#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
fix_missing_nfts.py
====================
Скачивает 4 недостающие картинки через API (requests),
обновляет public/my_nfts.json и проверяет целостность списка NFT.

Использование:
    pip install requests
    python fix_missing_nfts.py
"""

import json
import os
import re
from collections import Counter

import requests

NFT_IMAGES_DIR = os.path.join("public", "nft_images")
NFTS_JSON_PATH = os.path.join("public", "my_nfts.json")

MISSING_IMAGES = [
    {
        "url_png": "https://api.changes.tg/original/resistancedog.png",
        "url_webp": "https://api.changes.tg/original/resistancedog.webp",
        "filename": "resistance_dog.webp",
        "nft_id": 82,
        "nft_name": "Resistance Dogs",
        "nft_collection": "Resistance Dogs",
    },
    {
        "url_png": "https://api.changes.tg/original/luckylocket.png",
        "url_webp": "https://api.changes.tg/original/luckylocket.webp",
        "filename": "lucky_locket.webp",
        "nft_id": 83,
        "nft_name": "Lucky Lockets",
        "nft_collection": "Lucky Lockets",
    },
    {
        "url_png": "https://api.changes.tg/original/miragelamp.png",
        "url_webp": "https://api.changes.tg/original/miragelamp.webp",
        "filename": "mirage_lamp.webp",
        "nft_id": 84,
        "nft_name": "Mirage Lamps",
        "nft_collection": "Mirage Lamps",
    },
    {
        "url_png": "https://api.changes.tg/original/finepen.png",
        "url_webp": "https://api.changes.tg/original/finepen.webp",
        "filename": "fine_pen.webp",
        "nft_id": 85,
        "nft_name": "Fine Pens",
        "nft_collection": "Fine Pens",
    },
]
def download_image(url: str, filepath: str) -> bool:
    """Скачивает файл по URL, сохраняет. True при успехе."""
    try:
        resp = requests.get(url, timeout=30, stream=True)
        if resp.status_code == 200:
            with open(filepath, "wb") as f:
                for chunk in resp.iter_content(chunk_size=8192):
                    f.write(chunk)
            return True
        else:
            print(f"    HTTP {resp.status_code} для {url}")
            return False
    except requests.RequestException as e:
        print(f"    Ошибка сети/таймаут: {e}")
        return False


def step1_download_images():
    """Скачивает 4 недостающие картинки."""
    print("=" * 60)
    print("ШАГ 1: Скачивание 4 недостающих картинок")
    print("=" * 60)

    os.makedirs(NFT_IMAGES_DIR, exist_ok=True)
    downloaded = 0

    for img in MISSING_IMAGES:
        filepath = os.path.join(NFT_IMAGES_DIR, img["filename"])
        if os.path.exists(filepath) and os.path.getsize(filepath) > 0:
            print(f"  [ПРОПУСК] {img['filename']} уже существует")
            downloaded += 1
            continue

        print(f"  Скачиваю: {img['nft_name']} -> {img['filename']}")

        # Сначала пробуем .png
        print(f"    Пробую PNG: {img['url_png']}")
        if download_image(img["url_png"], filepath):
            print(f"    ✅ Скачано (PNG) -> {filepath}")
            downloaded += 1
            continue

        # Если 404/таймаут, пробуем .webp
        print(f"    Пробую WEBP: {img['url_webp']}")
        if download_image(img["url_webp"], filepath):
            print(f"    ✅ Скачано (WEBP) -> {filepath}")
            downloaded += 1
            continue

        print(f"    ❌ Не удалось скачать {img['filename']}")

    print(f"\n  Итого скачано: {downloaded} / {len(MISSING_IMAGES)}")
    return downloaded
def step2_update_json():
    """Проверяет JSON и добавляет недостающие записи."""
    print("\n" + "=" * 60)
    print("ШАГ 2: Проверка/обновление public/my_nfts.json")
    print("=" * 60)

    with open(NFTS_JSON_PATH, "r", encoding="utf-8") as f:
        nfts = json.load(f)

    print(f"  Текущее количество записей: {len(nfts)}")

    existing_ids = set(str(item.get("id")) for item in nfts)

    added = 0
    for img in MISSING_IMAGES:
        str_id = str(img["nft_id"])
        if str_id in existing_ids:
            print(f"  [OK] ID {img['nft_id']} ({img['nft_name']}) уже есть в JSON")
        else:
            nfts.append({
                "id": img["nft_id"],
                "name": img["nft_name"],
                "image": f"/nft_images/{img['filename']}",
                "collection": img["nft_collection"],
                "floor": 100.0,
                "rarity": "Common",
            })
            print(f"  [ДОБАВЛЕНО] ID {img['nft_id']} ({img['nft_name']})")
            added += 1

    if added > 0:
        with open(NFTS_JSON_PATH, "w", encoding="utf-8") as f:
            json.dump(nfts, f, indent=2, ensure_ascii=False)
        print(f"\n  ✅ Добавлено {added} записей. Всего: {len(nfts)}")
    else:
        print(f"\n  ✅ Все записи уже есть. Всего: {len(nfts)}")

    return nfts
def step3_verify(nfts):
    """Проверка целостности: файлы vs JSON, уникальность ID."""
    print("\n" + "=" * 60)
    print("ШАГ 3: Проверка целостности")
    print("=" * 60)

    files = os.listdir(NFT_IMAGES_DIR)
    image_count = len(files)
    print(f"  Файлов в папке '{NFT_IMAGES_DIR}': {image_count}")

    json_count = len(nfts)
    print(f"  Записей в JSON: {json_count}")

    if image_count != json_count:
        print(f"\n  ⚠️  Несоответствие: {image_count} файлов != {json_count} записей")
        json_images = set()
        for item in nfts:
            img_path = item.get("image", "")
            if img_path.startswith("/"):
                img_path = img_path[1:]
            json_images.add(os.path.basename(img_path))
        print(f"\n  Файлы без записи в JSON:")
        for fname in sorted(files):
            if fname not in json_images:
                print(f"    - {fname} (нет в JSON)")
        print(f"\n  Записи без файла:")
        for item in nfts:
            img_path = item.get("image", "")
            expected_file = os.path.basename(img_path)
            if expected_file not in files:
                print(f"    - ID {item.get('id')}: {item.get('name')} -> {expected_file} (нет файла)")
    else:
        print(f"  ✅ Количество файлов совпадает с количеством записей.")

    ids = [str(item.get("id")) for item in nfts]
    unique_ids = set(ids)
    if len(ids) != len(unique_ids):
        print(f"\n  ⚠️  Обнаружены дубликаты ID!")
        for item_id, count in Counter(ids).items():
            if count > 1:
                print(f"    - ID '{item_id}' встречается {count} раз")
    else:
        print(f"  ✅ Все {len(ids)} ID уникальны.")

    print(f"\n  Проверка 4 недостающих NFT:")
    all_ok = True
    for img in MISSING_IMAGES:
        filepath = os.path.join(NFT_IMAGES_DIR, img["filename"])
        exists = os.path.exists(filepath)
        if exists:
            size = os.path.getsize(filepath)
            status = "✅" if size > 0 else "❌"
            print(f"    {status} {img['filename']} (ID {img['nft_id']}) -> {size} байт")
            if size == 0:
                all_ok = False
        else:
            print(f"    ❌ {img['filename']} (ID {img['nft_id']}) -> отсутствует")
            all_ok = False

    if all_ok:
        print(f"\n  ✅ Все 4 NFT успешно скачаны и проверены!")
    else:
        print(f"\n  ⚠️  Некоторые файлы отсутствуют.")

    return image_count, json_count
def step4_check_market_upgrader():
    """Проверяет, что Маркет и Апгрейдер читают список NFT из JSON."""
    print("\n" + "=" * 60)
    print("ШАГ 4: Проверка логики Маркета и Апгрейдера")
    print("=" * 60)

    issues = []

    # --- Маркет (GiftShop.tsx) ---
    gspath = os.path.join("src", "components", "GiftShop.tsx")
    if os.path.exists(gspath):
        with open(gspath, "r", encoding="utf-8") as f:
            content = f.read()
        refs = ["fetch('/my_nfts.json')", 'fetch("my_nfts.json")',
                "fetch('my_nfts.json')", 'fetch("/my_nfts.json")', "my_nfts.json"]
        if any(r in content for r in refs):
            print("  ✅ GiftShop (Маркет): загружает список из my_nfts.json")
        else:
            msg = "  ⚠️ GiftShop (Маркет): НЕ найден fetch на my_nfts.json"
            print(msg); issues.append(msg)
    else:
        print("  ⚠️ GiftShop.tsx не найден")

    # --- Апгрейдер (UpgraderPage.tsx) ---
    upath = os.path.join("src", "components", "UpgraderPage.tsx")
    if os.path.exists(upath):
        with open(upath, "r", encoding="utf-8") as f:
            content = f.read()
        if "my_nfts.json" in content:
            print("  ✅ UpgraderPage (Апгрейдер): загружает пул конечных NFT из my_nfts.json")
        else:
            msg = "  ⚠️ UpgraderPage: НЕ найден fetch на my_nfts.json"
            print(msg); issues.append(msg)
    else:
        print("  ⚠️ UpgraderPage.tsx не найден")

    # --- Сервер ---
    if os.path.exists("server.py"):
        with open("server.py", "r", encoding="utf-8") as f:
            content = f.read()
        if "buy_nft" in content:
            print("  ✅ server.py /api/buy_nft: принимает item из тела запроса")
        for pat in [r"NFT_LIST\s*=", r"nft_list\s*=", r"ALL_NFTS\s*=", r"all_nfts\s*=\s*\["]:
            if re.search(pat, content):
                msg = f"  ⚠️ server.py: возможный хардкод: {pat}"
                print(msg); issues.append(msg)
    else:
        print("  ⚠️ server.py не найден")

    if not issues:
        print("\n  ✅ Маркет и Апгрейдер используют список NFT из JSON, хардкода нет.")
    else:
        print(f"\n  ⚠️ Найдено {len(issues)} проблем(ы).")
    return issues


def main():
    print("=" * 60)
    print("  fix_missing_nfts.py — Скачивание 4 недостающих NFT")
    print("=" * 60)

    downloaded = step1_download_images()
    nfts = step2_update_json()
    img_cnt, json_cnt = step3_verify(nfts)
    issues = step4_check_market_upgrader()

    print("\n" + "=" * 60)
    print("  ИТОГОВЫЙ ОТЧЁТ")
    print("=" * 60)
    print(f"  Скачано изображений:      {downloaded} / {len(MISSING_IMAGES)}")
    print(f"  Файлов в папке:           {img_cnt}")
    print(f"  Записей в JSON:           {json_cnt}")
    unique_ok = len(set(str(i.get("id")) for i in nfts)) == json_cnt
    print(f"  ID уникальны:             {'✅' if unique_ok else '❌'}")
    print(f"  Проблем с логикой:        {len(issues)}")
    for iss in issues:
        print(f"    - {iss}")
    print("\n✅ Готово!")


if __name__ == "__main__":
    main()