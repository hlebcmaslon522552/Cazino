import json

with open('public/my_nfts.json', 'r', encoding='utf-8') as f:
    data = json.load(f)

print(f'Total in JSON: {len(data)}')
print()
print('First 5:')
for item in data[:5]:
    print(f'  - {item["name"]}: floor={item["floor"]}, image={item["image"]}')

print()
print('Last 5:')
for item in data[-5:]:
    print(f'  - {item["name"]}: floor={item["floor"]}, image={item["image"]}')

print()
# Check which NFTs are missing
all_names = [
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
downloaded_names = {item['name'] for item in data}
missing = [n for n in all_names if n not in downloaded_names]
if missing:
    print(f'Missing ({len(missing)}):')
    for n in missing:
        print(f'  - {n}')
else:
    print('All NFTs downloaded!')

# Check image files
import os
files = os.listdir('public/nft_images')
print(f'\nImage files in public/nft_images/: {len(files)}')