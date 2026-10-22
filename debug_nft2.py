from TelegramGifts import TelegramGifts

gifts = TelegramGifts(cache_mode='http', asset_mode='lazy')

# Test exact names from our list
names_to_test = [
    "Durov's Cap",
    "durov's cap",
    'durovs_cap',
    "Khabib's Papakha",
    'khabibs_papakha',
    "Durov's Glasses",
    'durovs_glasses',
    "Fine Pen",
    "Plush Pepe",
    "Jack-in-the-Box",
    "Artisan Brick",
]
for name in names_to_test:
    info = gifts.get_gift(name)
    if info:
        print(f'OK: {name!r} -> {info["type"]} / {info["short_name"]} / links.webp={info["links"]["webp"]}')
    else:
        print(f'NO: {name!r} -> not found')