from TelegramGifts import TelegramGifts
import json

gifts = TelegramGifts(cache_mode='http', asset_mode='lazy')

# Test with Plush Pepe
info = gifts.get_gift('Plush Pepe')
if info:
    print('=== Plush Pepe ===')
    print('KEYS:', list(info.keys()))
    print('links:', info.get('links'))
    print('prices:', info.get('prices'))
    print('type:', info.get('type'))
    print('short_name:', info.get('short_name'))
    print('full_name:', info.get('full_name'))
    print()
else:
    print('Not found: Plush Pepe')

# Try with short name
info2 = gifts.get_gift('plush_pepe')
if info2:
    print('=== plush_pepe ===')
    print('links:', info2.get('links'))
    print('prices:', info2.get('prices'))
else:
    print('Not found: plush_pepe')

# Get all regular gifts and list their names
print()
print('=== All regular gifts (first 10) ===')
regular = gifts.get_regular_gifts()
for g in regular[:10]:
    print(f'  full_name: {g.full_name}, short_name: {g.short_name}, id: {g.id}')

print()
print(f'Total regular gifts: {len(regular)}')