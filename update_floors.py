# -*- coding: utf-8 -*-
"""
update_floors.py — обновление актуального флора (floor price) всех NFT
из public/my_nfts.json через библиотеку TelegramGifts.

Использование:
    python update_floors.py

Скрипт:
  1. Читает public/my_nfts.json (массив объектов с полем "name").
  2. Для каждого имени запрашивает данные о подарке у TelegramGifts.
  3. Берёт актуальную цену в TON (приоритет: TGMrkt → Fragment → GetGems → Portal → Floor).
  4. Записывает новую цену в поле "floor" и сохраняет файл обратно.
"""
import json
from typing import Dict, List, Optional

from TelegramGifts import TelegramGifts

NFTS_FILE = 'public/my_nfts.json'

# Имена в нашем JSON отличаются от канонических имён в библиотеке:
# Telegram хранит названия с типографским апострофом (’) и дефисами.
# Здесь — точечные алиасы, которые не покрываются автоматической нормализацией.
NAME_ALIASES: Dict[str, str] = {
    "Durovs Cap": "Durov’s Cap",
    "Durovs Glasses": "Durov’s Glasses",
    "Khabibs Papakha": "Khabib’s Papakha",
    "Jack In The Box": "Jack-in-the-Box",
    "Ufc Strike": "UFC Strike",
}

# Источники цены в порядке приоритета.
# fragment_price_ton отсутствует в текущей версии TelegramGifts, но оставлен
# для совместимости — если источник объявится, он будет использован первым.
PRICE_SOURCE_KEYS: tuple = (
    "tgmrkt_price_ton",
    "fragment_price_ton",
    "getgems_price_ton",
    "portal_price_ton",
    "floor_price_ton",
)


def build_gifts_client() -> TelegramGifts:
    """
    Создаёт клиент TelegramGifts.

    cache_mode='http' + asset_mode='lazy' — надёжная конфигурация: работает
    через HTTP-кэш и не пытается сделать git clone/pull репозитория ассетов.
    """
    return TelegramGifts(cache_mode='http', asset_mode='lazy')


def build_query_candidates(name: str) -> List[str]:
    """
    Возвращает список имён-кандидатов для запроса к библиотеке.

    Порядок важен: сначала точное имя, затем вариант с типографским апострофом
    (прямой ' в данных библиотеки не распознаётся), затем явные алиасы.
    """
    candidates = [name]

    curly = name.replace("'", "’")
    if curly != name and curly not in candidates:
        candidates.append(curly)

    alias = NAME_ALIASES.get(name)
    if alias:
        if alias not in candidates:
            candidates.append(alias)
        curly_alias = alias.replace("'", "’")
        if curly_alias not in candidates:
            candidates.append(curly_alias)

    return candidates


def extract_floor_price(info: Optional[dict]) -> Optional[float]:
    """Извлекает актуальную цену (TON) из ответа TelegramGifts."""
    if not info:
        return None

    prices = info.get("prices") or {}
    for key in PRICE_SOURCE_KEYS:
        value = prices.get(key)
        if value:
            return float(value)
    return None


def fetch_floor_price(gifts: TelegramGifts, name: str) -> float:
    """
    Возвращает актуальный флор в TON для подарка.

    Бросает LookupError, если подарок не найден или цена недоступна.
    """
    last_info = None
    for candidate in build_query_candidates(name):
        try:
            last_info = gifts.get_gift(candidate)
        except Exception:  # сетевые ошибки/таймауты — пробуем следующий вариант
            last_info = None
            continue

        price = extract_floor_price(last_info)
        if price is not None:
            return price

    if last_info is None:
        raise LookupError("подарок не найден в TelegramGifts")
    raise LookupError("актуальная цена в TON недоступна")


def update_floors() -> None:
    # Инициализируем библиотеку
    gifts = build_gifts_client()

    # Читаем текущий JSON
    with open(NFTS_FILE, 'r', encoding='utf-8') as f:
        nfts = json.load(f)

    updated_count = 0
    unchanged_count = 0
    not_found: List[str] = []
    total = len(nfts)

    for item in nfts:
        name = item.get('name')
        if not name:
            continue

        old_floor = item.get('floor')
        print(f"Обновляем: {name}...")

        try:
            new_floor = fetch_floor_price(gifts, name)

            if new_floor > 0:
                item['floor'] = round(new_floor, 4)
                updated_count += 1
                if old_floor is not None and float(old_floor) != new_floor:
                    print(f"  -> {old_floor} TON --> {new_floor} TON")
                else:
                    print(f"  -> Цена не изменилась: {new_floor} TON")
            else:
                unchanged_count += 1
                print(f"  -> Цена не найдена (оставляем {old_floor})")

        except Exception as e:
            not_found.append(name)
            print(f"  -> Ошибка: {e}")

    # Сохраняем обновлённый JSON
    with open(NFTS_FILE, 'w', encoding='utf-8') as f:
        json.dump(nfts, f, indent=2, ensure_ascii=False)

    print()
    print(f"✅ Обновлено цен: {updated_count} из {total}")
    if unchanged_count:
        print(f"ℹ️  Без изменений: {unchanged_count}")
    if not_found:
        print(f"⚠️  Не найдено ({len(not_found)}): {', '.join(not_found)}")


if __name__ == "__main__":
    update_floors()