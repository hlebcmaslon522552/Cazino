# -*- coding: utf-8 -*-
"""Apply task fixes to server.py / CaseShop.tsx / CasePage.tsx / InventoryPage.tsx / ProfilePage.tsx.
Preserves CRLF line endings of target files.
"""
import io
import os

ROOT = r"c:\Users\User\Desktop\Глеб\reactjs-template-master"


def P(*parts):
    return os.path.join(ROOT, *parts)


# ---------------------------------------------------------------------------
# server.py
# ---------------------------------------------------------------------------
S_POOL_OLD = """# ── Пул предметов для кейсов ──────────────────────────────────────────
CASE_POOL = [
    {"name": "Plush Pepe", "image": "/nft_images/plush_pepe.webp", "rarity": "legendary", "chance": 1, "price": 500},
    {"name": "Durov Cap", "image": "/nft_images/durovs_cap.webp", "rarity": "epic", "chance": 4, "price": 200},
    {"name": "Astral Shard", "image": "/nft_images/astral_shard.webp", "rarity": "rare", "chance": 10, "price": 80},
    {"name": "Golden Fish", "image": "/nft_images/bonded_ring.webp", "rarity": "rare", "chance": 10, "price": 75},
    {"name": "Shadow Veil", "image": "/nft_images/westside_sign.webp", "rarity": "uncommon", "chance": 15, "price": 40},
    {"name": "Ruby Heart", "image": "/nft_images/heart_locket-removebg-preview.png", "rarity": "uncommon", "chance": 15, "price": 35},
    {"name": "Emerald Eye", "image": "/nft_images/clover_pin.webp", "rarity": "uncommon", "chance": 15, "price": 30},
    {"name": "Moonstone", "image": "/nft_images/moon_pendant.webp", "rarity": "common", "chance": 30, "price": 10},
]

def generate_crash_point():
    e = pow(2, 32)
    h = random.randint(0, e - 1)
    house_edge = 0.03
    point = (100 * e - h) / (e - h) / 100 * (1 - house_edge)
    if point < 1.01:
        return 1.01
    if point > 111.0:
        return 111.0
    return round(point, 2)


def pick_case_item():
    total_chance = sum(item["chance"] for item in CASE_POOL)
    roll = random.uniform(0, total_chance)
    cumulative = 0.0
    for item in CASE_POOL:
        cumulative += item["chance"]
        if roll <= cumulative:
            return item
    return CASE_POOL[-1]
"""

S_POOL_NEW = """# ── Пулы предметов для кейсов (по ID кейса) ───────────────────────────
CASE_WOOD_POOL = [
    {"name": "Bow Tie", "image": "/nft_images/bow_tie.webp", "rarity": "common", "chance": 40, "price": 5.81},
    {"name": "Fresh Socks", "image": "/nft_images/fresh_socks.webp", "rarity": "uncommon", "chance": 30, "price": 4.48},
    {"name": "Candy Cane", "image": "/nft_images/candy_cane.webp", "rarity": "uncommon", "chance": 20, "price": 3.88},
    {"name": "Snow Globe", "image": "/nft_images/snow_globe.webp", "rarity": "rare", "chance": 10, "price": 6.42},
]

CASE_COPPER_POOL = [
    {"name": "Swiss Watch", "image": "/nft_images/swiss_watch.webp", "rarity": "rare", "chance": 30, "price": 56.06},
    {"name": "Signet Ring", "image": "/nft_images/signet_ring.webp", "rarity": "rare", "chance": 30, "price": 36.00},
    {"name": "Valentine Box", "image": "/nft_images/valentine_box.webp", "rarity": "uncommon", "chance": 20, "price": 12.75},
    {"name": "Jingle Bells", "image": "/nft_images/jingle_bells.webp", "rarity": "uncommon", "chance": 20, "price": 10.77},
]

CASE_SILVER_POOL = [
    {"name": "Astral Shard", "image": "/nft_images/astral_shard.webp", "rarity": "epic", "chance": 10, "price": 120.81},
    {"name": "Genie Lamp", "image": "/nft_images/genie_lamp.webp", "rarity": "rare", "chance": 20, "price": 38.72},
    {"name": "Toy Bear", "image": "/nft_images/toy_bear.webp", "rarity": "rare", "chance": 30, "price": 34.59},
    {"name": "Love Potion", "image": "/nft_images/love_potion.webp", "rarity": "uncommon", "chance": 40, "price": 14.79},
]

CASE_GOLD_POOL = [
    {"name": "Heart Locket", "image": "/nft_images/heart_locket-removebg-preview.png", "rarity": "legendary", "chance": 1, "price": 1249.48},
    {"name": "Precious Peach", "image": "/nft_images/precious_peach.webp", "rarity": "epic", "chance": 4, "price": 259.57},
    {"name": "Durovs Cap", "image": "/nft_images/durovs_cap.webp", "rarity": "rare", "chance": 15, "price": 420.24},
    {"name": "Mighty Arm", "image": "/nft_images/mighty_arm.webp", "rarity": "rare", "chance": 30, "price": 127.45},
    {"name": "Perfume Bottle", "image": "/nft_images/perfume_bottle.webp", "rarity": "uncommon", "chance": 50, "price": 83.10},
]

# Соответствие ID кейса (фронтенд) и пула предметов
CASE_POOLS = {
    "case_wood": CASE_WOOD_POOL,
    "case_copper": CASE_COPPER_POOL,
    "case_silver": CASE_SILVER_POOL,
    "case_gold": CASE_GOLD_POOL,
}

def generate_crash_point():
    e = pow(2, 32)
    h = random.randint(0, e - 1)
    house_edge = 0.03
    point = (100 * e - h) / (e - h) / 100 * (1 - house_edge)
    if point < 1.01:
        return 1.01
    if point > 111.0:
        return 111.0
    return round(point, 2)


def pick_case_item(case_id=""):
    pool = CASE_POOLS.get(case_id, CASE_WOOD_POOL)
    total_chance = sum(item["chance"] for item in pool)
    roll = random.uniform(0, total_chance)
    cumulative = 0.0
    for item in pool:
        cumulative += item["chance"]
        if roll <= cumulative:
            return item
    return pool[-1]
"""

S_OPEN_CASE_OLD = '    case_price = float(data.get("case_price", 0))\n'
S_OPEN_CASE_NEW = (
    '    case_price = float(data.get("case_price", 0))\n'
    '    case_id = str(data.get("case_id", "")).strip()\n'
)

S_PLAY_CASE_OLD = (
    '    elif game_type == "case":\n'
    '        item = pick_case_item()\n'
    '        return jsonify({"success": True, "item": item, "user_id": user_id})'
)
S_PLAY_CASE_NEW = (
    '    elif game_type == "case":\n'
    '        item = pick_case_item(data.get("case_id", ""))\n'
    '        return jsonify({"success": True, "item": item, "user_id": user_id})'
)

S_PICK_OLD = "        # Выбираем случайный предмет\n        item = pick_case_item()"
S_PICK_NEW = (
    "        # Выбираем случайный предмет из пула, соответствующего ID кейса\n"
    "        item = pick_case_item(case_id)"
)

# ---------------------------------------------------------------------------
# CaseShop.tsx
# ---------------------------------------------------------------------------
CS_OLD = """  { id: "case_silver", name: "Серебряный кейс", image: "Silver.png", price: 10.00 },
  { id: "case_gold", name: "Золотой кейс", image: "GOLD.png", price: 50.00 },
  { id: "case_test", name: "Тестовый кейс", image: "case-test.png", price: 100.00 }
];"""
CS_NEW = """  { id: "case_silver", name: "Серебряный кейс", image: "Silver.png", price: 10.00 },
  { id: "case_gold", name: "Золотой кейс", image: "GOLD.png", price: 50.00 }
];"""

# ---------------------------------------------------------------------------
# CasePage.tsx
# ---------------------------------------------------------------------------
CP_POOL_OLD = """const DEFAULT_POOL: DropItem[] = [
  { name: 'Plush Pepe', image: '/nft_images/plush_pepe.webp', rarity: 'legendary', chance: 1, price: 500 },
  { name: 'Durov Cap', image: '/nft_images/durovs_cap.webp', rarity: 'epic', chance: 4, price: 200 },
  { name: 'Astral Shard', image: '/nft_images/astral_shard.webp', rarity: 'rare', chance: 10, price: 80 },
  { name: 'Golden Fish', image: '/nft_images/bonded_ring.webp', rarity: 'rare', chance: 10, price: 75 },
  { name: 'Shadow Veil', image: '/nft_images/westside_sign.webp', rarity: 'uncommon', chance: 15, price: 40 },
  { name: 'Ruby Heart', image: '/nft_images/heart_locket-removebg-preview.png', rarity: 'uncommon', chance: 15, price: 35 },
  { name: 'Emerald Eye', image: '/nft_images/clover_pin.webp', rarity: 'uncommon', chance: 15, price: 30 },
  { name: 'Moonstone', image: '/nft_images/moon_pendant.webp', rarity: 'common', chance: 30, price: 10 },
];

function loadPool(): DropItem[] {
  try {
    const raw = localStorage.getItem('drop_chances');
    if (raw) return JSON.parse(raw);
  } catch {}
  return DEFAULT_POOL;
}"""

CP_POOL_NEW = """/* Пулы предметов по кейсам — синхронизированы с server.py */
const CASE_POOLS: Record<string, DropItem[]> = {
  case_wood: [
    { name: 'Bow Tie', image: '/nft_images/bow_tie.webp', rarity: 'common', chance: 40, price: 5.81 },
    { name: 'Fresh Socks', image: '/nft_images/fresh_socks.webp', rarity: 'uncommon', chance: 30, price: 4.48 },
    { name: 'Candy Cane', image: '/nft_images/candy_cane.webp', rarity: 'uncommon', chance: 20, price: 3.88 },
    { name: 'Snow Globe', image: '/nft_images/snow_globe.webp', rarity: 'rare', chance: 10, price: 6.42 },
  ],
  case_copper: [
    { name: 'Swiss Watch', image: '/nft_images/swiss_watch.webp', rarity: 'rare', chance: 30, price: 56.06 },
    { name: 'Signet Ring', image: '/nft_images/signet_ring.webp', rarity: 'rare', chance: 30, price: 36.00 },
    { name: 'Valentine Box', image: '/nft_images/valentine_box.webp', rarity: 'uncommon', chance: 20, price: 12.75 },
    { name: 'Jingle Bells', image: '/nft_images/jingle_bells.webp', rarity: 'uncommon', chance: 20, price: 10.77 },
  ],
  case_silver: [
    { name: 'Astral Shard', image: '/nft_images/astral_shard.webp', rarity: 'epic', chance: 10, price: 120.81 },
    { name: 'Genie Lamp', image: '/nft_images/genie_lamp.webp', rarity: 'rare', chance: 20, price: 38.72 },
    { name: 'Toy Bear', image: '/nft_images/toy_bear.webp', rarity: 'rare', chance: 30, price: 34.59 },
    { name: 'Love Potion', image: '/nft_images/love_potion.webp', rarity: 'uncommon', chance: 40, price: 14.79 },
  ],
  case_gold: [
    { name: 'Heart Locket', image: '/nft_images/heart_locket-removebg-preview.png', rarity: 'legendary', chance: 1, price: 1249.48 },
    { name: 'Precious Peach', image: '/nft_images/precious_peach.webp', rarity: 'epic', chance: 4, price: 259.57 },
    { name: 'Durovs Cap', image: '/nft_images/durovs_cap.webp', rarity: 'rare', chance: 15, price: 420.24 },
    { name: 'Mighty Arm', image: '/nft_images/mighty_arm.webp', rarity: 'rare', chance: 30, price: 127.45 },
    { name: 'Perfume Bottle', image: '/nft_images/perfume_bottle.webp', rarity: 'uncommon', chance: 50, price: 83.10 },
  ],
};

const DEFAULT_POOL: DropItem[] = CASE_POOLS['case_wood'];

function loadPool(caseId: string): DropItem[] {
  const fallback = CASE_POOLS[caseId] ?? DEFAULT_POOL;
  try {
    const raw = localStorage.getItem('drop_chances');
    if (raw) return JSON.parse(raw);
  } catch {}
  return fallback;
}"""

CP_LOAD_OLD = "  const pool = loadPool();\n"
CP_LOAD_NEW = "  const pool = loadPool(caseData.id);\n"

CP_BODY_OLD = """        body: JSON.stringify({
          user_id: userId,
          case_price: price,
        }),"""
CP_BODY_NEW = """        body: JSON.stringify({
          user_id: userId,
          case_id: caseData.id,
          case_price: price,
        }),"""

# ---------------------------------------------------------------------------
# InventoryPage.tsx
# ---------------------------------------------------------------------------
IV_IMPORT_OLD = "import { sellNft, withdrawNft, getFloorPrice, fetchInventory } from '../api';"
IV_IMPORT_NEW = "import { sellNft, getFloorPrice, fetchInventory } from '../api';"

IV_WITHDRAW_OLD = """  const handleWithdraw = async () => {
    if (!selected) return;
    haptic('medium');
    
    try {
      await withdrawNft(selected.id, initData);
      vibrate('warning');
      onToast('Заявка на вывод. Холд 1 час.', 'info');
      setSelected(null);
    } catch (err) {
      console.error('Ошибка вывода:', err);
      onToast('Ошибка при выводе', 'error');
    }
  };"""
IV_WITHDRAW_NEW = """  const handleWithdraw = () => {
    if (!selected) return;
    haptic('medium');
    // Заглушка: реальная логика юзербота будет реализована позже.
    onToast('Заявка на вывод отправлена администратору. Ожидайте.');
    setSelected(null);
  };"""

# ---------------------------------------------------------------------------
# ProfilePage.tsx
# ---------------------------------------------------------------------------
PP_OLD = """  // Данные пользователя из Telegram WebApp (синхронно)
  const tgUser = window.Telegram?.WebApp?.initDataUnsafe?.user;
  const [userName, setUserName] = useState(
    tgUser?.first_name
      ? tgUser.first_name + (tgUser.last_name ? ' ' + tgUser.last_name : '')
      : 'Пользователь'
  );
  const [username, setUsername] = useState(
    tgUser?.username ? '@' + tgUser.username : '@username'
  );
  const [avatarUrl, setAvatarUrl] = useState(tgUser?.photo_url || '');"""
PP_NEW = """  // Данные пользователя из Telegram WebApp
  const tgUser = window.Telegram?.WebApp?.initDataUnsafe?.user;
  // Вычисляем при каждом рендере, чтобы данные подтянулись даже если Telegram инициализировался позже
  const userName = tgUser?.first_name
    ? tgUser.first_name + (tgUser.last_name ? ' ' + tgUser.last_name : '')
    : 'Пользователь';
  const username = tgUser?.username ? '@' + tgUser.username : '@username';
  const avatarUrl = tgUser?.photo_url || '';"""


FILES = [
    (P("server.py"), [
        (S_POOL_OLD, S_POOL_NEW),
        (S_OPEN_CASE_OLD, S_OPEN_CASE_NEW),
        (S_PLAY_CASE_OLD, S_PLAY_CASE_NEW),
        (S_PICK_OLD, S_PICK_NEW),
    ]),
    (P("src", "components", "CaseShop.tsx"), [
        (CS_OLD, CS_NEW),
    ]),
    (P("src", "components", "CasePage.tsx"), [
        (CP_POOL_OLD, CP_POOL_NEW),
        (CP_LOAD_OLD, CP_LOAD_NEW),
        (CP_BODY_OLD, CP_BODY_NEW),
    ]),
    (P("src", "components", "InventoryPage.tsx"), [
        (IV_IMPORT_OLD, IV_IMPORT_NEW),
        (IV_WITHDRAW_OLD, IV_WITHDRAW_NEW),
    ]),
    (P("src", "components", "ProfilePage.tsx"), [
        (PP_OLD, PP_NEW),
    ]),
]

for path, repls in FILES:
    with io.open(path, "r", encoding="utf-8", newline="") as f:
        text = f.read()
    work = text.replace("\r\n", "\n")
    for i, (old, new) in enumerate(repls):
        n = work.count(old)
        if n != 1:
            raise SystemExit("%s [replacement #%d]: expected 1 match, found %d" % (path, i, n))
        work = work.replace(old, new)
    with io.open(path, "w", encoding="utf-8", newline="") as f:
        f.write(work.replace("\n", "\r\n"))
    print("OK: " + path)

print("All replacements applied.")