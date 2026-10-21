from TelegramGifts import TelegramGifts
import json, time, os

def update_prices():
    print("🔄 Запуск парсера цен...")
    # Используем облегченный режим, чтобы не качать гигабайты картинок сразу
    gifts = TelegramGifts(cache_mode="http", asset_mode="lazy")
    
    # Получаем ВСЕ доступные гифты (обычные и апгрейженные)
    # Метод get_regular_gifts() возвращает список объектов
    try:
        all_gifts = gifts.get_regular_gifts()
    except Exception as e:
        print(f"❌ Ошибка получения списка: {e}")
        return

    print(f"📦 Найдено моделей: {len(all_gifts)}. Собираю цены...")
    
    while True:
        result = {}
        for i, gift in enumerate(all_gifts):
            try:
                # Берем данные по каждой модели
                info = gifts.get_gift(gift.full_name)
                if info:
                    # Цена: TGMrkt -> Floor
                    price = info['prices'].get('tgmrkt_price_ton') or info['prices'].get('floor_price_ton', 0)
                    image_url = info.get('links', {}).get('webp', '')
                    
                    # Используем full_name как ключ
                    result[info['full_name']] = {
                        "floor": price,
                        "image": image_url,
                        "model": info['full_name']
                    }
            except Exception:
                pass # Пропускаем ошибки отдельных гифтов, чтобы не ломать всё
        
        # Сохраняем в папку public для React
        os.makedirs("public", exist_ok=True)
        with open("public/prices.json", "w", encoding="utf-8") as f:
            json.dump(result, f, indent=2, ensure_ascii=False)
            
        print(f"✅ Цены обновлены: {len(result)} гифтов. Ждем 1 час...")
        time.sleep(3600)

if __name__ == "__main__":
    update_prices()