# -*- coding: utf-8 -*-
"""
download_missing.py
====================
Скачивает ТОЛЬКО недостающие NFT-картинки из Telegram Gifts в папку public/nft_images/.

Как это работает:
  1. Сканирует public/nft_images/ и собирает имена уже существующих файлов
     (без расширения .webp).
  2. Берёт полный список коллекций (123 шт.) и сопоставляет каждую коллекцию
     с реальным гифтом из данных TelegramGifts (слаги в репозитории ассетов
     хранятся в snake_case, например "algorithm_cup").
  3. Для коллекций, файлы которых ещё не скачаны, вызывает
     TelegramGifts.download_image(api_slug, "webp") и копирует картинку в
     public/nft_images/<file_slug>.webp.

Слаги:
    Коллекция        ->  api-слаг (download_image)   ->  файл
    "Plush Pepe"     ->  plush_pepe                  ->  plush_pepe.webp
    "Algorithm Cups" ->  algorithm_cup               ->  algorithm_cup.webp

  Примечание: api-слаг — это canonical short name гифта (нижний регистр,
  без пробелов и апострофов, слова через "_"). Именно такие имена лежат в
  webp/by_name репозитория TelegramGiftsAssests, поэтому download_image
  работает только с ними (слаг вида "plushpepe" без подчёркиваний даёт 404).

ЗАЩИТА ОТ БЛОКИРОВКИ (ВАЖНО):
  Вызов download_image обёрнут в try-except. При сетевой ошибке
  (ConnectionError, Timeout, ProxyError, SSLError и т.д.) скрипт НЕМЕДЛЕННО
  останавливается, выводит сообщение:
      "ОШИБКА СЕТИ: Нет доступа к Telegram. Включите VPN и запустите скрипт заново"
  и не пытается переподключаться в цикле (чтобы не спамить запросами).
  Ошибка 404 (гифта/картинки нет в базе) — НЕ сетевая, такие коллекции просто
  попадают в список "не найдены".
"""

import os
import re
import shutil
import sys

import requests

# Гарантируем, что вывод (в т.ч. эмодзи и кириллица) не ломается
# при перенаправлении в файл/пайп на Windows (иначе cp1251 -> UnicodeEncodeError)
if hasattr(sys.stdout, "reconfigure"):
    try:
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    except Exception:
        pass

from TelegramGifts import TelegramGifts
from TelegramGifts.exceptions import CacheError, GitHubFetchError

# Куда складываем картинки
NFT_DIR = os.path.join("public", "nft_images")

# Полный список коллекций (123 шт.) из Telegram Gifts
COLLECTIONS = [
    "Resistance Dogs", "Lucky Lockets", "Mirage Lamps", "Algorithm Cups", "Intelligence Cups",
    "Fine Pens", "Durov's Glasses", "Liberty Figures", "Surge Boards", "Vice Cream",
    "Chill Flame", "Timeless Book", "Mood Pack", "Pool Floats", "Rare Birds",
    "Victory Medals", "UFC Strikes", "Khabib's Papakhas", "Bling Binkies", "Money Pots",
    "Pretty Posies", "Faith Amulets", "Happy Brownies", "Ice Cream", "Instant Ramens",
    "Mousse Cakes", "Spring Baskets", "Clover Pins", "Fresh Socks", "Sky Stilettos",
    "Artisan Bricks", "Mighty Arms", "Input Keys", "Ionic Dryers", "Jolly Chimps",
    "Moon Pendants", "Stellar Rockets", "Low Riders", "Snoop Cigars", "Snoop Doggs",
    "Swag Bags", "Westside Signs", "Cupid Charms", "Joyful Bundles", "Valentine Boxes",
    "Whip Cupcakes", "Lush Bouquets", "Heart Lockets", "Bow Ties", "Heroic Helmets",
    "Nail Bracelets", "Restless Jars", "Light Swords", "Gem Signets", "Snake Boxes",
    "Xmas Stockings", "Pet Snakes", "Big Years", "Bonded Rings", "Holiday Drinks",
    "Easter Eggs", "Jack-in-the-Box", "Witch Hats", "Neko Helmets", "Tama Gadgets",
    "Winter Wreaths", "Candy Canes", "Electric Skulls", "Snow Globes", "Record Players",
    "Sakura Flowers", "Top Hats", "Sleigh Bells", "Diamond Rings", "Loot Bags",
    "Love Potions", "Ginger Cookies", "Lol Pops", "Mini Oscars", "Star Notepads",
    "Ion Gems", "Eternal Candles", "Crystal Balls", "Flying Brooms", "Swiss Watch",
    "B-Day Candles", "Bunny Muffins", "Hypno Lollipops", "Astral Shards", "Mad Pumpkins",
    "Voodoo Dolls", "Desk Calendars", "Jingle Bells", "Cookie Hearts", "Hanging Stars",
    "Snow Mittens", "Love Candles", "Jester Hats", "Lunar Snakes", "Party Sparklers",
    "Genie Lamps", "Eternal Roses", "Evil Eyes", "Hex Pots", "Homemade Cakes",
    "Jelly Bunnies", "Kissed Frogs", "Durov's Caps", "Berry Boxes", "Plush Pepe",
    "Precious Peach", "Scared Cat", "Perfume Bottle", "Magic Potion", "Sharp Tongue",
    "Vintage Cigar", "Toy Bear", "Signet Ring", "Trapped Heart", "Skull Flower",
    "Spy Agaric", "Santa Hat", "Spiced Wine",
]

# Текст, который выводится при проблеме с доступом к Telegram
NETWORK_ERROR_TEXT = (
    "ОШИБКА СЕТИ: Нет доступа к Telegram. Включите VPN и запустите скрипт заново"
)

# Сетевые исключения requests: при них скачивание нужно НЕМЕДЛЕННО остановить
NETWORK_EXCEPTIONS = (
    requests.exceptions.ConnectionError,
    requests.exceptions.ProxyError,
    requests.exceptions.SSLError,
    requests.exceptions.Timeout,
    requests.exceptions.ConnectTimeout,
    requests.exceptions.ReadTimeout,
    requests.exceptions.TooManyRedirects,
    requests.exceptions.ChunkedEncodingError,
)

# Неправильные формы множественного числа, которые не выводятся общим правилом
SPECIAL_PLURALS = {
    "brownies": "brownie", "bunnies": "bunny", "binkies": "binky",
    "posies": "posy", "cookies": "cookie", "ties": "tie", "eyes": "eye",
    "candies": "candy",
}

# Названия, которые пишутся одинаково во множественном/единственном виде
# (по каноническому слагу) и не должны преобразовываться
INVARIANT_SLUGS = {
    "durovs_glasses", "fresh_socks", "sky_stilettos", "snow_mittens",
    "jingle_bells", "ice_cream", "vice_cream", "mood_pack", "swiss_watch",
    "plush_pepe", "scared_cat", "chill_flame", "timeless_book",
    "perfume_bottle", "magic_potion", "sharp_tongue", "vintage_cigar",
    "toy_bear", "signet_ring", "trapped_heart", "skull_flower", "spy_agaric",
    "santa_hat", "spiced_wine", "precious_peach", "jack_in_the_box",
}

def slugify_name(name):
    """Слаг для API/файла: нижний регистр, без пробелов/апострофов, слова через '_'.
    Например: "Algorithm Cups" -> "algorithm_cups", "Durov's Glasses" -> "durovs_glasses"."""
    kept = re.sub(r"[^a-z0-9\s]", "", name.lower())
    return "_".join(kept.split())


def singularize(name):
    """Превращает название коллекции во множественном числе в единственное:
    "Algorithm Cups" -> "Algorithm Cup", "Happy Brownies" -> "Happy Brownie"."""
    if slugify_name(name) in INVARIANT_SLUGS:
        return name
    words = name.split()
    last = words[-1].lower()
    if last in SPECIAL_PLURALS:
        words[-1] = SPECIAL_PLURALS[last]
    elif last.endswith("ies"):
        words[-1] = last[:-3] + "y"
    elif last.endswith("xes"):
        words[-1] = last[:-2]          # boxes -> box
    elif last.endswith("ses") and len(last) > 4:
        words[-1] = last[:-1]          # roses -> rose
    elif last.endswith("s") and not last.endswith("ss"):
        words[-1] = last[:-1]          # cups -> cup
    return " ".join(words)


def build_catalog(gifts):
    """Собирает словарь short_name -> full_name по ВСЕМ гифтам Telegram Gifts."""
    catalog = {}
    for detail in gifts.get_all_gifts_details():
        catalog.setdefault(detail.short_name, detail.full_name)
    return catalog


def resolve_short_name(collection, catalog):
    """Находит реальный short_name гифта для названия коллекции.
    Сначала точное совпадение канонического слага, затем форма единственного числа.
    Если коллекция не найдена в данных — возвращается слаг-кандидат
    (единственное число, чтобы имя файла оставалось в стиле папки: без дублей)."""
    for candidate in (collection, singularize(collection)):
        slug = slugify_name(candidate)
        if slug in catalog:
            return slug
    return slugify_name(singularize(collection))


def existing_file_stems():
    """Имена уже существующих файлов в public/nft_images/ без расширения."""
    if not os.path.isdir(NFT_DIR):
        return set()
    return {os.path.splitext(fname)[0] for fname in os.listdir(NFT_DIR)}


def is_not_found_error(exc):
    """True, если ошибка означает, что гифта/картинки просто НЕТ (HTTP 404)."""
    if isinstance(exc, requests.exceptions.HTTPError):
        resp = getattr(exc, "response", None)
        if resp is not None and resp.status_code == 404:
            return True
    cause = getattr(exc, "__cause__", None) or getattr(exc, "__context__", None)
    if isinstance(cause, requests.exceptions.HTTPError):
        resp = getattr(cause, "response", None)
        if resp is not None and resp.status_code == 404:
            return True
    # Запасной вариант: смотрим текст сообщения (библиотека оборачивает 404 как
    # 'Network error while downloading asset: 404 Client Error: ...')
    return "404" in str(exc)


def is_network_error(exc):
    """True, если ошибка — это проблема доступа к сети/Telegram (нужно остановиться)."""
    # Прямая сетевая ошибка requests
    if isinstance(exc, NETWORK_EXCEPTIONS):
        return True
    # HTTP-ошибка (кроме 404), например 403/429/5xx — доступ к ресурсу заблокирован
    if isinstance(exc, requests.exceptions.HTTPError):
        resp = getattr(exc, "response", None)
        if resp is not None and resp.status_code == 404:
            return False
        return True
    # Библиотека оборачивает сетевые ошибки в GitHubFetchError — смотрим первопричину
    cause = getattr(exc, "__cause__", None) or getattr(exc, "__context__", None)
    if isinstance(cause, requests.exceptions.HTTPError):
        resp = getattr(cause, "response", None)
        if resp is not None and resp.status_code == 404:
            return False
        return True
    if isinstance(cause, requests.exceptions.RequestException):
        return True
    # Запасной вариант: классифицируем по тексту сообщения
    msg = str(exc).lower()
    if "404" in msg:
        return False
    network_hints = (
        "timed out", "timeout", "connection", "proxy", "unreachable",
        "refused", "network error", "ssl", "dns", "resolve",
    )
    return any(hint in msg for hint in network_hints)


def network_error_exit():
    """Выводит сообщение о сетевой ошибке и немедленно останавливает скрипт."""
    print("\n" + NETWORK_ERROR_TEXT)
    sys.exit(1)

def main():
    os.makedirs(NFT_DIR, exist_ok=True)

    print("Запуск TelegramGifts...")
    # cache_mode="http": качаем только нужные JSON, asset_mode="lazy": картинки лениво.
    # ttl_seconds=0 -> всегда используем свежие данные из репозитория ассетов.
    gifts = TelegramGifts(cache_mode="http", asset_mode="lazy", ttl_seconds=0)

    # 1. Загружаем каталог гифтов (свежие данные)
    try:
        catalog = build_catalog(gifts)
    except Exception as exc:
        if not is_not_found_error(exc):
            network_error_exit()
        print(f"Не удалось загрузить данные о гифтах (не найдены): {exc}")
        network_error_exit()
    print(f"Каталог гифтов загружен: {len(catalog)} шт.")

    # 2. Сканируем папку: собираем имена уже существующих файлов (без .webp)
    existing = existing_file_stems()
    print(f"Уже есть файлов в {NFT_DIR}/: {len(existing)}")

    # 3. Сравниваем списки — оставляем только те коллекции, которых НЕТ в папке
    missing = []      # (коллекция, api_slug, file_slug)
    already = []      # коллекции, файлы которых уже скачаны
    for collection in COLLECTIONS:
        api_slug = resolve_short_name(collection, catalog)
        if api_slug in existing:
            already.append(collection)
            continue
        missing.append((collection, api_slug, f"{api_slug}.webp"))

    print(f"Коллекций уже скачано:    {len(already)}")
    print(f"Нужно скачать:            {len(missing)}")
    print("-" * 70)

    downloaded = []   # (коллекция, файл)
    not_found = []    # (коллекция, слаг) - нет в базе Telegram Gifts
    failed = []       # прочие ошибки

    # 4. Скачиваем недостающие
    for collection, api_slug, file_slug in missing:
        target = os.path.join(NFT_DIR, file_slug)
        print(f"Скачиваю: {collection} ({api_slug}) ...", end=" ", flush=True)

        try:
            # ВАЖНО: обёртка try-except вокруг download_image (защита от блокировки сети)
            local_path = gifts.download_image(api_slug, "webp")
        except Exception as exc:
            if is_network_error(exc):
                # Сетевая ошибка -> НЕМЕДЛЕННАЯ остановка, без переподключений/спама
                print()
                network_error_exit()
            if is_not_found_error(exc):
                print("НЕ НАЙДЕНО")
                not_found.append((collection, api_slug))
                continue
            print(f"ОШИБКА: {exc}")
            failed.append((collection, api_slug))
            continue

        # 5. Сохраняем в public/nft_images/<file_slug>
        try:
            shutil.copy2(local_path, target)
        except OSError as exc:
            print(f"НЕ УДАЛОСЬ СОХРАНИТЬ: {exc}")
            failed.append((collection, api_slug))
            continue

        print("OK")
        downloaded.append((collection, file_slug))

    # 6. Итоговый вывод
    print("-" * 70)
    print(f"✅ СКАЧАНО ({len(downloaded)}):")
    for collection, file_slug in downloaded:
        print(f"   + {collection} -> {file_slug}")

    print(f"\n❌ НЕ НАЙДЕНЫ ({len(not_found)}):")
    for collection, api_slug in not_found:
        print(f"   - {collection} (слаг: {api_slug})")

    if failed:
        print(f"\n⚠️  ОШИБКИ ({len(failed)}):")
        for collection, api_slug in failed:
            print(f"   - {collection} (слаг: {api_slug})")

    print("\nГотово!")


if __name__ == "__main__":
    main()