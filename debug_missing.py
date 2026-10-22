from TelegramGifts import TelegramGifts
from TelegramGifts.identity import canonical_short_name

gifts = TelegramGifts(cache_mode='http', asset_mode='lazy')

missing = ["Heart Locket", "Chill Flame", "Light Sword", "Fine Pen", "Joyful Bundle", "Restless Jar"]

regular = gifts.get_regular_gifts()
regular_names = [g.full_name for g in regular]
details = gifts.get_all_gifts_details()
detail_names = [d.full_name for d in details]

for name in missing:
    print(f'\n=== {name} ===')
    
    # Try different approaches
    info = gifts.get_gift(name)
    print(f'  get_gift({name!r}): {"FOUND" if info else "NOT FOUND"}')
    
    canonical = canonical_short_name(name)
    print(f'  canonical: {canonical!r}')
    info2 = gifts.get_gift(canonical)
    print(f'  get_gift({canonical!r}): {"FOUND" if info2 else "NOT FOUND"}')
    
    # Search in regular gifts
    found_reg = False
    for g in regular:
        if name.lower() in g.full_name.lower() or canonical in g.full_name.lower().replace(" ", "_"):
            print(f'  Regular match: full_name={g.full_name!r}, short_name={g.short_name!r}')
            found_reg = True
    if not found_reg:
        print(f'  No regular match found')
    
    # Search in details
    found_det = False
    for d in details:
        if name.lower() in d.full_name.lower() or canonical in d.short_name:
            print(f'  Detail match: full_name={d.full_name!r}, short_name={d.short_name!r}')
            found_det = True
    if not found_det:
        print(f'  No detail match found')

print('\n\nDone checking.')