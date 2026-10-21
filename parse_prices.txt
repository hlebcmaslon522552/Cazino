from TelegramGifts import TelegramGifts
import json, time, os

def update_prices():
    gifts = TelegramGifts()
    # Сюда добавь те гифты, которые тебе нужны
    target_gifts = ["Plush Pepe", "Hex Pot", "Loot Bag", "Durov Cap", "Jolly Chimp"]
    
    while True:
        print("🔄 Обновляю цены...")
        result = {}
        for name in target_gifts:
            info = gifts.get_gift(name)
            if info:
                price = info['prices'].get('tgmrkt_price_ton') or info['prices'].get('fragment_price_ton', 0)
                result[name] = {
                    "floor": price,
                    "image": info['image_url']
                }
        
        # Сохраняем файл В ПАПКУ PUBLIC (чтобы React его видел)
        os.makedirs("public", exist_ok=True)
        with open("public/prices.json", "w", encoding="utf-8") as f:
            json.dump(result, f, indent=2, ensure_ascii=False)
            
        print("✅ Цены обновлены и сохранены в public/prices.json")
        time.sleep(3600) # Ждём 1 час

if __name__ == "__main__":
    update_prices()