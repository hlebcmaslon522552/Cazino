# -*- coding: utf-8 -*-
"""
download_missing.py
====================
Скачивает 4 недостающие NFT-коллекции (Resistance Dogs, Lucky Lockets,
Mirage Lamps, Fine Pens) из Telegram Gifts, обновляет флор-цену и
добавляет записи в public/my_nfts.json.

Как это работает:
  1. Для каждой коллекции скачивает картинку через
     TelegramGifts.download_image(slug, "webp").
  2. Получает цену через TelegramGifts.get_gift("Название коллекции").
  3. Извлекает флор (приоритет: tgmrkt_price_ton → fragment_price_ton → …).
  4. Если цена не найдена — ставит заглушку 100 TON.
  5. Добавляет 4 новые записи в public/my_nfts.json с полем rarity: "Common".
  6. При сетевой ошибке выводит "ОШИБКА СЕТИ" и немедленно останавливается.

Использование:
    python download_missing.py
"""

import json
import os
import shutil
import sys

if hasattr(sys.stdout, "reconfigure"):
    try:
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    except Exception:
        pass

from TelegramGifts import TelegramGifts

NFT_DIR = os.path.join("public", "nft_images")
NFTS_FILE = os.path.join("public", "my_nfts.json")

# 4 недостающие коллекции: (имя для get_gift, слаг для download_image)
MISSING_COLLECTIONS = [
    ("Resistance Dogs", "resistance_dog"),
    ("Lucky Lockets", "lucky_locket"),
    ("Mirage Lamps", "mirage_lamp"),
    ("Fine Pens", "fine_pen"),
]

# Источники цены в порядке приоритета (как в update_floors.py)
PRICE_SOURCE_KEYS = (
    "tgmrkt_price_ton",
    "fragment_price_ton",
    "getgems_price_ton",
    "portal_price_ton",
    "floor_price_ton",
)

FALLBACK_PRICE = 100.0  # TON, если цена не найдена

NETWORK_ERROR_TEXT = (
    "ОШИБКА СЕТИ: Нет доступа к Telegram. "
    "Включите VPN и запустите скрипт заново."
)


def is_network_error(exc: Exception) -> bool:
    """Проверяет, является ли исключение сетевой ошибкой."""
    exc_name = type(exc).__name__
    exc_str = str(exc).lower()
    network_keywords = [
        "connectionerror", "timeout", "proxyerror", "sslerror",
        "connection", "timeout", "dns", "resolve", "eof", "reset",
    ]
    for kw in network_keywords:
        if kw in exc_name.lower() or kw in exc_str:
            return True
    return False


def extract_floor_price(info) -> float:
    """Извлекает флор-цену из ответа TelegramGifts или возвращает заглушку."""
    if not info:
        return FALLBACK_PRICE
    prices = info.get("prices") or {}
    for key in PRICE_SOURCE_KEYS:
        value = prices.get(key)
        if value is not None:
            try:
                return float(value)
            except (TypeError, ValueError):
                continue
    return FALLBACK_PRICE


def main():
    os.makedirs(NFT_DIR, exist_ok=True)

    print("Инициализация TelegramGifts...")
    gifts = TelegramGifts(cache_mode="http", asset_mode="lazy", ttl_seconds=0)

    new_entries = []

    for name, slug in MISSING_COLLECTIONS:
        print(f"\n{'=' * 60}")
        print(f"Обрабатываю: {name} (slug: {slug})")

        # --- Шаг 1: Скачать картинку ---
        target_path = os.path.join(NFT_DIR, f"{slug}.webp")
        print(f"  Скачиваю картинку -> {slug}.webp ...", end=" ", flush=True)

        try:
            local_path = gifts.download_image(slug, "webp")
        except Exception as exc:
            if is_network_error(exc):
                print(f"\n{NETWORK_ERROR_TEXT}")
                sys.exit(1)
            print(f"ОШИБКА: {exc}")
            # Пробуем продолжить без картинки
            local_path = None

        if local_path:
            try:
                shutil.copy2(local_path, target_path)
                print("OK")
            except OSError as exc:
                print(f"НЕ УДАЛОСЬ СОХРАНИТЬ: {exc}")
        else:
            print("ПРОПУЩЕНА (картинка не скачана)")

        # --- Шаг 2: Получить цену ---
        print(f"  Получаю цену для '{name}' ...", end=" ", flush=True)
        floor_price = FALLBACK_PRICE

        try:
            info = gifts.get_gift(name)
            if info:
                floor_price = extract_floor_price(info)
                print(f"{floor_price} TON")
            else:
                print(f"информация не найдена → заглушка {FALLBACK_PRICE} TON")
        except Exception as exc:
            if is_network_error(exc):
                print(f"\n{NETWORK_ERROR_TEXT}")
                sys.exit(1)
            print(f"ОШИБКА: {exc} → заглушка {FALLBACK_PRICE} TON")

        # --- Шаг 3: Подготовить запись ---
        new_entries.append({
            "name": name,
            "slug": slug,
            "image": f"/nft_images/{slug}.webp",
            "floor": round(float(floor_price), 4),
        })

    # --- Шаг 4: Обновить JSON ---
    print(f"\n{'=' * 60}")
    print("Обновляю public/my_nfts.json ...")

    # Читаем текущий JSON
    with open(NFTS_FILE, "r", encoding="utf-8") as f:
        nfts = json.load(f)

    # Определяем следующий id
    last_id = 0
    for item in nfts:
        item_id = item.get("id")
        if isinstance(item_id, (int, float)):
            last_id = max(last_id, int(item_id))
        elif isinstance(item_id, str) and item_id.isdigit():
            last_id = max(last_id, int(item_id))

    # Если ни одного числового id не нашли, берём количество элементов
    if last_id == 0:
        last_id = len(nfts)

    # Добавляем новые записи
    for entry in new_entries:
        last_id += 1
        nfts.append({
            "id": last_id,
            "name": entry["name"],
            "image": entry["image"],
            "collection": entry["name"],
            "floor": entry["floor"],
            "rarity": "Common",
        })
        print(f"  + [{last_id}] {entry['name']} — {entry['floor']} TON — {entry['image']}")

    # Сохраняем JSON
    with open(NFTS_FILE, "w", encoding="utf-8") as f:
        json.dump(nfts, f, indent=2, ensure_ascii=False)

    print(f"\n✅ Готово! Добавлено {len(new_entries)} новых NFT в {NFTS_FILE}")
    print(f"   Всего записей: {len(nfts)}")

if __name__ == "__main__":
    main()

