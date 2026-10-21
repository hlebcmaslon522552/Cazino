import json
import os

# Моковые данные для теста
mock_gifts = []
names = ["Plush Pepe", "Hex Pot", "Loot Bag", "Jolly Chimp", "Durov Cap", "Astral Shard", "Vice Cream", "Swiss Watch"]
for i, name in enumerate(names):
    mock_gifts.append({
        "id": i + 1,
        "name": name,
        "image": f"https://nft.fragment.com/gift/{name.lower().replace(' ', '')}-1.webp",
        "floor": round(5.0 + i * 2.5, 2)
    })

os.makedirs("public", exist_ok=True)
with open("public/all_gifts.json", "w", encoding="utf-8") as f:
    json.dump(mock_gifts, f, indent=2, ensure_ascii=False)

print(f"✅ Сгенерировано {len(mock_gifts)} тестовых NFT в public/all_gifts.json")