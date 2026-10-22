import os
import json
from TelegramGifts import TelegramGifts


def clean_name(name: str) -> str:
    """Очищает имя файла от суффиксов типа -removebg-preview"""
    for suffix in ['-removebg-preview', '-cleanup', '-background-removed']:
        if suffix in name:
            name = name.split(suffix)[0]
    return name


def create_gifts_client(max_retries: int = 3):
    """Создаёт клиент TelegramGifts с обработкой ошибок."""
    import time
    for attempt in range(1, max_retries + 1):
        try:
            return TelegramGifts(cache_mode='http', asset_mode='lazy')
        except Exception as e:
            print(f"  [Попытка {attempt}/{max_retries}] Ошибка инициализации TelegramGifts: {e}")
            if attempt < max_retries:
                time.sleep(1)
            else:
                print("  Не удалось подключиться к TelegramGifts. Флор будет 0.")
                return None


def load_local_floor():
    """Пытаемся найти локальный файл с флором."""
    possible_files = ['public/floor.json', 'public/gifts.json', 'public/all_gifts.json', 'floor.json', 'gifts.json']
    for file in possible_files:
        if os.path.exists(file):
            print(f"  Найден локальный файл с флором: {file}")
            with open(file, 'r', encoding='utf-8') as f:
                return json.load(f)
    print("  Локальный файл с флором не найден. Будем использовать API.")
    return None


def generate_nft_json():
    local_data = load_local_floor()
    gifts = create_gifts_client()
    folder_path = 'public/nft_images'

    if not os.path.exists(folder_path):
        print(f"Папка {folder_path} не найдена!")
        return

    nft_data = []

    for filename in sorted(os.listdir(folder_path)):
        if not filename.lower().endswith(('.webp', '.png', '.jpg')):
            continue

        raw_name = os.path.splitext(filename)[0]
        base_name = clean_name(raw_name)
        display_name = base_name.replace('_', ' ').title()

        print(f"Обработка: {display_name}...")

        floor = 0.0
        found = False

        # 1. Ищем в локальном файле
        if local_data:
            # Если это словарь (dict) — { "Plush Pepe": 5.0, ... }
            if isinstance(local_data, dict):
                for key, val in local_data.items():
                    if key.lower() == display_name.lower() or key.lower() == base_name.lower():
                        floor = float(val) if isinstance(val, (int, float)) else float(val.get('floor', 0))
                        found = True
                        break
            # Если это список (list) — [ { "name": "Plush Pepe", "floor": 5.0 }, ... ]
            elif isinstance(local_data, list):
                for item in local_data:
                    item_name = item.get('name', '')
                    if item_name.lower() == display_name.lower() or item_name.lower() == base_name.lower():
                        floor = float(item.get('floor', 0))
                        found = True
                        break

        # 2. Если в локальном нет — идём в API
        if not found:
            if gifts is not None:
                try:
                    info = gifts.get_gift(display_name)
                    if info and info.get('prices'):
                        prices = info['prices']
                        floor = prices.get('tgmrkt_price_ton') or prices.get('fragment_price_ton') or 0.0
                        print(f"  + Флор из API: {floor} TON")
                    else:
                        print(f"  - Флор не найден, ставлю 0")
                except Exception as e:
                    print(f"  - Ошибка API: {e}")
            else:
                print(f"  - Клиент TelegramGifts недоступен, флор = 0")
        else:
            print(f"  + Флор из локального файла: {floor} TON")

        nft_data.append({
            "id": base_name,
            "name": display_name,
            "image": f"/nft_images/{filename}",
            "collection": display_name,
            "floor": float(floor)
        })

    with open('public/my_nfts.json', 'w', encoding='utf-8') as f:
        json.dump(nft_data, f, indent=2, ensure_ascii=False)

    print(f"\n✅ Готово! Сгенерировано {len(nft_data)} NFT.")


if __name__ == "__main__":
    generate_nft_json()