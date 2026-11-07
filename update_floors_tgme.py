import json

with open('public/my_nfts.json', 'r', encoding='utf-8') as f:
    data = json.load(f)

# New prices from TG.ME (name: new_floor)
new_prices = {
    'Plush Pepe': 7950,
    'Algorithm Cup': 3450,
    'Intelligence Cup': 3099,
    'Heart Locket': 1700,
    'Resistance Dogs': 569,
    'Durovs Cap': 463,
    'Scared Cat': 299,
    'Precious Peach': 295,
    'Heroic Helmet': 231,
    'Loot Bag': 150,
    'Mighty Arm': 150,
    'Westside Sign': 149,
    'Nail Bracelet': 149,
    'Astral Shard': 148,
    'Durovs Glasses': 148,
    'Mini Oscar': 115,
    'Perfume Bottle': 95,
    'Ion Gem': 85,
    'Artisan Brick': 83,
    'Swiss Watch': 75,
    'Magic Potion': 75,
    'Gem Signet': 73,
    'Low Rider': 70,
    'Kissed Frog': 66,
    'Sharp Tongue': 59,
    'Bonded Ring': 49,
    'Vintage Cigar': 46,
    'Neko Helmet': 45,
    'Voodoo Doll': 43,
    'Genie Lamp': 40,
    'Toy Bear': 39,
    'Signet Ring': 38,
    'Eternal Rose': 35,
    'Diamond Ring': 35,
    'Electric Skull': 35,
    'Rare Bird': 33,
    'Bling Binky': 30,
    'Khabibs Papakha': 29,
    'Cupid Charm': 27,
    'Snoop Cigar': 20,
    'Sky Stilettos': 20,
    'Ufc Strike': 20,
    'Mad Pumpkin': 19,
    'Ionic Dryer': 18,
    'Trapped Heart': 18,
    'Lucky Lockets': 17,
    'Love Potion': 17,
    'Crystal Ball': 15,
    'Flying Broom': 15,
    'Record Player': 14,
    'Valentine Box': 14,
    'Evil Eye': 13,
    'Love Candle': 13,
    'Skull Flower': 13,
    'Sakura Flower': 12,
    'Sleigh Bell': 12,
    'Top Hat': 12,
    'Jingle Bells': 11,
    'Joyful Bundle': 11,
    'Hanging Star': 11,
    'Jelly Bunny': 10,
    'Berry Box': 10,
    'Snow Mittens': 10,
    'Jolly Chimp': 9,
    'Witch Hat': 9,
    'Bunny Muffin': 9,
    'Fine Pens': 9,
    'Snow Globe': 8,
    'Surge Board': 8,
    'Desk Calendar': 7,
    'Spring Basket': 7,
    'Input Key': 7,
    'Faith Amulet': 7,
    'Pretty Posy': 7,
    'Lush Bouquet': 7,
    'Light Sword': 7,
    'Santa Hat': 7,
    'Moon Pendant': 7,
    'Spy Agaric': 7,
    'Bow Tie': 7,
    'Eternal Candle': 7,
    'Snoop Dogg': 6,
    'Homemade Cake': 6,
    'B-Day Candle': 6,
    'Party Sparkler': 6,
    'Cookie Heart': 6,
    'Spiced Wine': 6,
    'Liberty Figure': 6,
    'Clover Pin': 6,
    'Ginger Cookie': 6,
    'Hypno Lollipop': 6,
    'Fresh Socks': 6,
    'Mousse Cake': 6,
    'Swag Bag': 6,
    'Winter Wreath': 6,
    'Star Notepad': 6,
    'Holiday Drink': 6,
    'Stellar Rocket': 6,
    'Victory Medal': 6,
    'Restless Jar': 6,
    'Hex Pot': 6,
    'Money Pot': 6,
    'Jack In The Box': 6,
    'Candy Cane': 5,
    'Xmas Stocking': 5,
    'Lol Pop': 5,
    'Vice Cream': 5,
    'Chill Flame': 5,
    'Instant Ramen': 5,
    'Lunar Snake': 5,
    'Whip Cupcake': 5,
    'Jester Hat': 5,
    'Pet Snake': 5,
    'Snake Box': 5,
    'Ice Cream': 5,
    'Happy Brownie': 5,
    'Mirage Lamps': 5,
    'Pool Float': 5,
    'Mood Pack': 5,
    'Big Year': 5,
    'Tama Gadget': 5,
    'Easter Egg': 5,
    'Timeless Book': 5,
}

changes = []
not_found = []

for item in data:
    name = item.get('name', '')
    if name in new_prices:
        old_floor = item.get('floor')
        new_floor = new_prices[name]
        if old_floor != new_floor:
            changes.append((name, old_floor, new_floor))
            item['floor'] = new_floor

# Check which names from the list were NOT found
found_names = {item.get('name', '') for item in data}
for n in new_prices:
    if n not in found_names:
        not_found.append(n)

with open('public/my_nfts.json', 'w', encoding='utf-8') as f:
    json.dump(data, f, indent=2, ensure_ascii=False)

print(f'=== Changes made: {len(changes)} ===')
for name, old, new in changes:
    print(f'  {name}: {old} -> {new}')

if not_found:
    print(f'\n=== NOT FOUND in JSON ({len(not_found)}) ===')
    for n in not_found:
        print(f'  {n}')