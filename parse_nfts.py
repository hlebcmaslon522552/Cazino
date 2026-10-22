import os
import json
import requests
from TelegramGifts import TelegramGifts
from TelegramGifts.identity import canonical_short_name

def download_nfts():
    os.makedirs('public/nft_images', exist_ok=True)
    
    gifts = TelegramGifts(cache_mode="http", asset_mode="lazy")
    
    # Список коллекций из ТЗ
    collections = [
        "Plush Pepe", "Durov's Cap", "Precious Peach", "Scared Cat", "Astral Shard", 
        "Loot Bag", "Perfume Bottle", "Swiss Watch", "Genie Lamp", "Vintage Cigar", 
        "Toy Bear", "Signet Ring", "Heart Locket", "Snoop Dogg", "Khabib's Papakha", 
        "Durov's Glasses", "Snoop Cigar", "Chill Flame", "Instant Ramen", "Heroic Helmet", 
        "Light Sword", "Mood Pack", "UFC Strike", "Timeless Book", "Algorithm Cup", 
        "Intelligence Cup", "Fine Pen", "Pool Float", "Surge Board", "Swag Bag", 
        "Low Rider", "Westside Sign", "Liberty Figure", "Rare Bird", "Bling Binky", 
        "Vice Cream", "Ice Cream", "Victory Medal", "Spring Basket", "Easter Egg", 
        "Stellar Rocket", "Jolly Chimp", "Happy Brownie", "Artisan Brick", "Jack-in-the-Box", 
        "Faith Amulet", "Moon Pendant", "Clover Pin", "Money Pot", "Whip Cupcake", 
        "Mousse Cake", "Pretty Posy", "Ionic Dryer", "Neko Helmet", "Fresh Socks", 
        "Bow Tie", "Top Hat", "Mighty Arm", "Input Key", "Lush Bouquet", "Joyful Bundle", 
        "Nail Bracelet", "Bonded Ring", "Restless Jar", "Sky Stilettos", "Diamond Ring", 
        "Love Potion", "Valentine Box", "Cupid Charm", "Big Year", "Lunar Snake", 
        "Tama Gadget", "Pet Snake", "Snake Box", "Jingle Bells", "Holiday Drink", 
        "Party Sparkler", "Cookie Heart", "Candy Cane", "Xmas Stocking", "Santa Hat", 
        "Snow Globe"
    ]
    
    def make_safe_name(name):
        """Преобразует имя в безопасный формат для имени файла."""
        return name.lower().replace(" ", "_").replace("'", "").replace("'", "").replace("-", "_").replace(".", "").replace(",", "")
    
    nft_data = []
    
    # Собираем все regular gift'ы для поиска по несовпадающим именам
    regular_gifts = gifts.get_regular_gifts()
    # Строим lookup-таблицу: normalized_name -> full_name
    regular_lookup = {}
    for rg in regular_gifts:
        normalized = rg.full_name.lower().replace("'", "'").replace("'", "'")
        regular_lookup[normalized] = rg.full_name
    
    for name in collections:
        try:
            print(f"Загрузка: {name}...")
            
            # Пытаемся найти гифт разными способами
            info = gifts.get_gift(name)
            
            if not info:
                # Пробуем canonical short name (durovs_cap вместо Durov's Cap)
                canonical = canonical_short_name(name)
                info = gifts.get_gift(canonical)
            
            if not info:
                # Пробуем через regular gifts список с заменой апострофов
                normalized_name = name.lower().replace("'", "'").replace("'", "'")
                if normalized_name in regular_lookup:
                    info = gifts.get_gift(regular_lookup[normalized_name])
            
            if not info:
                print(f"  - Не найдено в базе: {name}")
                continue
            
            # Получаем URL картинки
            links = info.get('links', {})
            image_url = links.get('webp', '')
            
            if not image_url:
                print(f"  - Нет ссылки на картинку для: {name}")
                continue
            
            # Получаем флор (цену) в зависимости от типа
            prices = info.get('prices', {})
            gift_type = info.get('type', 'REGULAR')
            
            if gift_type == 'UPGRADED':
                floor = prices.get('tgmrkt_price_ton') or prices.get('floor_price_ton') or prices.get('getgems_price_ton') or 0.0
            else:
                floor = prices.get('floor_price') or prices.get('floor_price_ton') or 0.0
            
            safe_name = make_safe_name(name)
            filename = f"{safe_name}.webp"
            filepath = f"public/nft_images/{filename}"
            
            # Скачиваем картинку
            img_res = requests.get(image_url, timeout=10)
            if img_res.status_code == 200:
                with open(filepath, 'wb') as f:
                    f.write(img_res.content)
                
                nft_data.append({
                    "id": safe_name,
                    "name": name,
                    "image": f"/nft_images/{filename}",
                    "collection": name,
                    "floor": float(floor)
                })
                print(f"  + Скачано (Флор: {floor} TON)")
            else:
                print(f"  - Ошибка скачивания картинки (Статус: {img_res.status_code})")
                
        except Exception as e:
            print(f"Ошибка с {name}: {e}")

    # Сохраняем в JSON
    with open('public/my_nfts.json', 'w', encoding='utf-8') as f:
        json.dump(nft_data, f, indent=2, ensure_ascii=False)
        
    print(f"\n✅ Готово! Успешно скачано {len(nft_data)} NFT из {len(collections)}.")

if __name__ == "__main__":
    download_nfts()