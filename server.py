"""
Cazino Game Server — Server-Side Random & Anti-Cheat
Обеспечивает честную генерацию всех игровых результатов на сервере.
"""
import os
import random
import json
import sqlite3
import threading
import time
import uuid
from datetime import datetime, timedelta
import requests
from flask import Flask, request, jsonify
from flask_cors import CORS

app = Flask(__name__)
CORS(app, resources={r"/api/*": {"origins": "*"}})

# ── База данных ──────────────────────────────────────────────────────
DB_PATH = os.path.join(os.path.dirname(__file__), "test.db")

# Активные игры в Mines (серверный анти-чит)
active_mines_games = {}

active_mines_games = {}

# ── Crash Game State (серверный таймер) ──────────────────────────────────
CRASH_STATE = "waiting"       # 'waiting' | 'flying'
CRASH_TIMER = 15              # секунд до старта
CRASH_POINT = 1.00
CRASH_START_TIME = 0.0
CRASH_LOCK = threading.Lock()



# ── Leaderboard / Prizes Config ─────────────────────────────────────
LEADERBOARD_PRIZES = {
    1: 500.0,
    2: 250.0,
    3: 100.0,
    4: 75.0,
    5: 50.0,
    6: 40.0,
    7: 30.0,
    8: 25.0,
    9: 20.0,
    10: 15.0,
    11: 10.0,
    12: 8.0,
    13: 6.0,
    14: 4.0,
    15: 2.0,
}

# Интервал сброса лидерборда (по умолчанию 7 дней)
RESET_INTERVAL_DAYS = int(os.environ.get("LEADERBOARD_RESET_DAYS", 7))
# Час дня, в который происходит сброс (0-23)
RESET_HOUR = int(os.environ.get("LEADERBOARD_RESET_HOUR", 0))
# Как часто проверять время сброса (в секундах)
CHECK_INTERVAL_SEC = int(os.environ.get("LEADERBOARD_CHECK_INTERVAL", 3600))

# ── Telegram Admin Notifications ────────────────────────────────────
TG_BOT_TOKEN = "8837626872:AAEEqnmT-hEKwMOhTfZ9LDLmOu7AHi88Pzw"
TG_ADMIN_CHAT_ID = os.environ.get("TG_ADMIN_CHAT_ID", "")

# Канал для проверки подписки (бонусный кейс) — бот должен быть в нём админом
TG_SUBSCRIPTION_CHANNEL = os.environ.get("TG_SUBSCRIPTION_CHANNEL", "@Test_Erra")

# Базовый URL Telegram Bot API. Прямой доступ к api.telegram.org из этого
# окружения недоступен, поэтому идём через Cloudflare Worker-прокси
# (как в send_telegram_notification и withdraw_nft).
TG_API_BASE = os.environ.get("TG_API_BASE", "https://stars.gleb0256149.workers.dev")


def init_db():
    # НЕ удаляем существующую БД — только создаём недостающие таблицы
    db_exists = os.path.exists(DB_PATH)
    conn = sqlite3.connect(DB_PATH)
    # Включаем WAL-режим для предотвращения блокировок при конкурентном доступе
    conn.execute("PRAGMA journal_mode=WAL")
    c = conn.cursor()

    # 1. Таблица пользователей
    c.execute("""
        CREATE TABLE IF NOT EXISTS users (
            id TEXT PRIMARY KEY,
            balance_ton REAL DEFAULT 15.0,
            balance_stars REAL DEFAULT 0.0
        )
    """)

    # 2. Таблица инвентаря
    c.execute("""
        CREATE TABLE IF NOT EXISTS inventory (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id TEXT,
            item_id TEXT,
            name TEXT,
            image TEXT,
            floor REAL,
            timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    """)

    # 3. Таблица оборота (для лидерборда turnover)
    c.execute("""
        CREATE TABLE IF NOT EXISTS turnover (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id TEXT,
            username TEXT,
            amount REAL,
            timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    """)

    # 4. Таблица депозитов (для лидерборда deposits)
    c.execute("""
        CREATE TABLE IF NOT EXISTS deposits (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id TEXT,
            username TEXT,
            amount REAL,
            timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    """)

    # 5. Таблица конфигов (для хранения времени последнего сброса лидерборда)
    c.execute("""
        CREATE TABLE IF NOT EXISTS config (
            key TEXT PRIMARY KEY,
            value TEXT NOT NULL
        )
    """)

    # 6. Таблица для бесплатных кейсов (отслеживание получения)
    c.execute("""
        CREATE TABLE IF NOT EXISTS free_case_claims (
            user_id TEXT PRIMARY KEY,
            last_claim_date TEXT
        )
    """)

    # Инициализация времени последнего сброса
    c.execute("INSERT OR IGNORE INTO config (key, value) VALUES ('last_reset', datetime('now'))")

    # Пользователь по умолчанию
    c.execute("INSERT OR IGNORE INTO users (id, balance_ton) VALUES ('6267608438', 15.0)")

    conn.commit()
    conn.close()
    if db_exists:
        print(f"[init_db] База данных {DB_PATH} уже существует — таблицы проверены/дополнены.")
    else:
        print("[init_db] База данных создана — все таблицы готовы.")


init_db()

def verify_init_data(init_data):
    return bool(init_data and init_data.strip())


# ── Пулы предметов для кейсов (по ID кейса) ───────────────────────────
CASE_WOOD_POOL = [
    {"name": "Bow Tie", "image": "/nft_images/bow_tie.webp", "rarity": "common", "chance": 40, "price": 5.814},
    {"name": "Fresh Socks", "image": "/nft_images/fresh_socks.webp", "rarity": "uncommon", "chance": 30, "price": 4.488},
    {"name": "Candy Cane", "image": "/nft_images/candy_cane.webp", "rarity": "uncommon", "chance": 20, "price": 3.8862},
    {"name": "Snow Globe", "image": "/nft_images/snow_globe.webp", "rarity": "rare", "chance": 10, "price": 6.426},
]

CASE_COPPER_POOL = [
    {"name": "Swiss Watch", "image": "/nft_images/swiss_watch.webp", "rarity": "rare", "chance": 30, "price": 56.0694},
    {"name": "Signet Ring", "image": "/nft_images/signet_ring.webp", "rarity": "rare", "chance": 30, "price": 36.006},
    {"name": "Valentine Box", "image": "/nft_images/valentine_box.webp", "rarity": "uncommon", "chance": 20, "price": 12.75},
    {"name": "Jingle Bells", "image": "/nft_images/jingle_bells.webp", "rarity": "uncommon", "chance": 20, "price": 10.7712},
]

CASE_SILVER_POOL = [
    {"name": "Astral Shard", "image": "/nft_images/astral_shard.webp", "rarity": "epic", "chance": 10, "price": 120.819},
    {"name": "Genie Lamp", "image": "/nft_images/genie_lamp.webp", "rarity": "rare", "chance": 20, "price": 38.7294},
    {"name": "Toy Bear", "image": "/nft_images/toy_bear.webp", "rarity": "rare", "chance": 30, "price": 34.5984},
    {"name": "Love Potion", "image": "/nft_images/love_potion.webp", "rarity": "uncommon", "chance": 40, "price": 14.79},
]

CASE_GOLD_POOL = [
    {"name": "Heart Locket", "image": "/nft_images/heart_locket-removebg-preview.png", "rarity": "legendary", "chance": 1, "price": 1249.4897},
    {"name": "Precious Peach", "image": "/nft_images/precious_peach.webp", "rarity": "epic", "chance": 4, "price": 259.5798},
    {"name": "Durovs Cap", "image": "/nft_images/durovs_cap.webp", "rarity": "rare", "chance": 15, "price": 420.24},
    {"name": "Mighty Arm", "image": "/nft_images/mighty_arm.webp", "rarity": "rare", "chance": 30, "price": 127.4592},
    {"name": "Perfume Bottle", "image": "/nft_images/perfume_bottle.webp", "rarity": "uncommon", "chance": 50, "price": 83.1096},
]

FREE_CASE_POOL = [
    {"name": "0.01 TON", "image": "/TON.png", "rarity": "common", "chance": 40, "price": 0.01, "is_ton": True},
    {"name": "0.1 TON", "image": "/TON.png", "rarity": "common", "chance": 25, "price": 0.1, "is_ton": True},
    {"name": "0.2 TON", "image": "/TON.png", "rarity": "common", "chance": 15, "price": 0.2, "is_ton": True},
    {"name": "0.3 TON", "image": "/TON.png", "rarity": "common", "chance": 10, "price": 0.3, "is_ton": True},
    {"name": "0.5 TON", "image": "/TON.png", "rarity": "common", "chance": 6, "price": 0.5, "is_ton": True},
    {"name": "1 TON", "image": "/TON.png", "rarity": "common", "chance": 3, "price": 1, "is_ton": True},
    {"name": "Big Year", "image": "/nft_images/big_year.webp", "rarity": "legendary", "chance": 1, "price": 3.89},
]

# Соответствие ID кейса (фронтенд) и пула предметов
CASE_POOLS = {
    "case_wood": CASE_WOOD_POOL,
    "case_copper": CASE_COPPER_POOL,
    "case_silver": CASE_SILVER_POOL,
    "case_gold": CASE_GOLD_POOL,
    "case_free": FREE_CASE_POOL,
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


# ── Crash Game Loop (фоновый поток) ───────────────────────────────────────
def crash_game_loop():
    """Фоновый поток: обновляет CRASH_STATE, CRASH_TIMER, CRASH_POINT каждую секунду."""
    global CRASH_STATE, CRASH_TIMER, CRASH_POINT, CRASH_START_TIME
    print("[CrashLoop] Поток запущен.")
    while True:
        try:
            with CRASH_LOCK:
                if CRASH_STATE == "waiting":
                    CRASH_TIMER -= 1
                    if CRASH_TIMER <= 0:
                        # Генерируем точку краша
                        CRASH_POINT = generate_crash_point()
                        CRASH_START_TIME = time.time()
                        CRASH_STATE = "flying"
                        print(f"[CrashLoop] Раунд стартовал! Краш-поинт: {CRASH_POINT}x")

                elif CRASH_STATE == "flying":
                    elapsed = time.time() - CRASH_START_TIME
                    if elapsed >= CRASH_POINT - 1.0:
                        # Раунд завершён (краш)
                        CRASH_STATE = "waiting"
                        CRASH_TIMER = 15
                        CRASH_POINT = 1.00
                        print("[CrashLoop] Раунд завершён. Ожидание следующего...")

        except Exception as e:
            print(f"[CrashLoop] Ошибка: {e}")

        time.sleep(1)





def pick_case_item(case_id=""):
    pool = CASE_POOLS.get(case_id, CASE_WOOD_POOL)
    return pick_case_item_from_pool(pool)


def pick_case_item_from_pool(pool):
    total_chance = sum(item["chance"] for item in pool)
    roll = random.uniform(0, total_chance)
    cumulative = 0.0
    for item in pool:
        cumulative += item["chance"]
        if roll <= cumulative:
            return item
    return pool[-1]
# ── Telegram Notification ──────────────────────────────────────────
def send_telegram_notification(message: str):
    """Отправляет сообщение админу в Telegram."""
    if not TG_BOT_TOKEN or not TG_ADMIN_CHAT_ID:
        print(f"[TG] Not configured, skipping notification. Message: {message}")
        return False
    try:
        url = f"https://stars.gleb0256149.workers.dev/bot{TG_BOT_TOKEN}/sendMessage"
        payload = {
            "chat_id": TG_ADMIN_CHAT_ID,
            "text": message,
            "parse_mode": "HTML",
        }
        resp = requests.post(url, json=payload, timeout=10)
        if resp.status_code == 200:
            print("[TG] Notification sent successfully")
            return True
        else:
            print(f"[TG] Failed: {resp.status_code} {resp.text}")
            return False
    except Exception as e:
        print(f"[TG] Error: {e}")
        return False


# ── Leaderboard Reset ──────────────────────────────────────────────
def get_total_deposits_by_user():
    """Возвращает топ-15 пользователей по сумме депозитов."""
    conn = None
    try:
        conn = sqlite3.connect(DB_PATH)
        c = conn.cursor()
        c.execute("""
            SELECT user_id, SUM(amount) as total
            FROM deposits
            GROUP BY user_id
            ORDER BY total DESC
            LIMIT 15
        """)
        rows = c.fetchall()
        return rows
    except Exception as e:
        print(f"[get_total_deposits_by_user] error: {e}")
        return []
    finally:
        if conn:
            conn.close()


def award_prizes(top_users: list) -> str:
    """
    Начисляет призы топ-15 пользователям.
    Возвращает строку с отчетом для Telegram.
    """
    if not top_users:
        return "Нет пользователей для награждения."

    report_lines = ["🏆 <b>Топ обнулён! Призы выданы:</b>"]
    conn = None
    try:
        conn = sqlite3.connect(DB_PATH)
        c = conn.cursor()

        for rank, (user_id, total_deposited) in enumerate(top_users, start=1):
            prize = LEADERBOARD_PRIZES.get(rank, 0.0)
            if prize <= 0:
                continue

            # Начисляем приз на баланс пользователя
            c.execute("SELECT balance_ton FROM users WHERE id = ?", (user_id,))
            row = c.fetchone()
            if row:
                new_balance = row[0] + prize
                c.execute("UPDATE users SET balance_ton = ? WHERE id = ?", (new_balance, user_id))
            else:
                # Создаём пользователя, если его нет
                c.execute("INSERT INTO users (id, balance_ton) VALUES (?, ?)", (user_id, prize))

            report_lines.append(
                f"  {rank}. <code>{user_id}</code> — {prize} TON (депозит: {total_deposited:.2f} TON)"
            )

        # Очищаем таблицу депозитов
        c.execute("DELETE FROM deposits")
        conn.commit()
    except Exception as e:
        print(f"[award_prizes] error: {e}")
        report_lines.append(f"  ❌ Ошибка: {e}")
    finally:
        if conn:
            conn.close()

    return "\n".join(report_lines)


def should_reset_now() -> bool:
    """
    Проверяет, пора ли сбрасывать лидерборд.
    Сброс происходит каждые RESET_INTERVAL_DAYS дней в RESET_HOUR часов.
    """
    conn = None
    try:
        conn = sqlite3.connect(DB_PATH)
        c = conn.cursor()
        c.execute("SELECT value FROM config WHERE key = 'last_reset'")
        row = c.fetchone()
    except Exception as e:
        print(f"[should_reset_now] error: {e}")
        return False
    finally:
        if conn:
            conn.close()

    if not row:
        return False

    last_reset_str = row[0]
    try:
        last_reset = datetime.strptime(last_reset_str, "%Y-%m-%d %H:%M:%S")
    except ValueError:
        return False

    now = datetime.now()
    next_reset = last_reset + timedelta(days=RESET_INTERVAL_DAYS)
    next_reset = next_reset.replace(hour=RESET_HOUR, minute=0, second=0, microsecond=0)

    # Если next_reset уже в прошлом — пора сбрасывать
    return now >= next_reset


def update_last_reset_time():
    """Обновляет время последнего сброса на текущее."""
    now_str = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    conn = None
    try:
        conn = sqlite3.connect(DB_PATH)
        c = conn.cursor()
        c.execute("UPDATE config SET value = ? WHERE key = 'last_reset'", (now_str,))
        conn.commit()
    except Exception as e:
        print(f"[update_last_reset_time] error: {e}")
    finally:
        if conn:
            conn.close()


def check_and_reset_leaderboard():
    """
    Фоновая задача: проверяет каждые CHECK_INTERVAL_SEC секунд,
    не пора ли сбросить лидерборд и выдать призы.
    """
    print(f"[Leaderboard] Фоновая задача запущена. "
          f"Интервал сброса: {RESET_INTERVAL_DAYS} дн., "
          f"час: {RESET_HOUR}:00, "
          f"проверка каждые {CHECK_INTERVAL_SEC} сек.")

    while True:
        try:
            if should_reset_now():
                print("[Leaderboard] Время сброса! Начинаем...")

                # 1. Получаем топ-15
                top_users = get_total_deposits_by_user()

                # 2. Выдаём призы и очищаем депозиты
                report = award_prizes(top_users)
                print(f"[Leaderboard] {report}")

                # 3. Обновляем время последнего сброса
                update_last_reset_time()

                # 4. Уведомление админу
                send_telegram_notification(report)

                print("[Leaderboard] Сброс завершён успешно.")
            else:
                # Лёгкое логирование раз в сутки (каждый 24-й цикл при CHECK_INTERVAL_SEC=3600)
                now = datetime.now()
                if now.hour == RESET_HOUR and now.minute == 0:
                    print(f"[Leaderboard] Следующая проверка через {CHECK_INTERVAL_SEC} сек. "
                          f"(сейчас {now.strftime('%Y-%m-%d %H:%M')})")
        except Exception as e:
            print(f"[Leaderboard] Ошибка: {e}")

        time.sleep(CHECK_INTERVAL_SEC)


# ── Баланс ───────────────────────────────────────────────────────────
@app.route("/api/balance", methods=["GET"])
def get_balance():
    user_id = request.args.get("user_id", "6267608438")
    conn = None
    try:
        conn = sqlite3.connect(DB_PATH)
        c = conn.cursor()
        c.execute("SELECT balance_ton, balance_stars FROM users WHERE id = ?", (user_id,))
        row = c.fetchone()
        if row:
            return jsonify({"balance_ton": row[0], "balance_stars": row[1]})
    except Exception as e:
        print(f"[get_balance] select error: {e}")
    finally:
        if conn:
            conn.close()

    # Если пользователя нет или ошибка — создаём с балансом 15 TON
    conn = None
    try:
        conn = sqlite3.connect(DB_PATH)
        c = conn.cursor()
        c.execute("INSERT OR IGNORE INTO users (id, balance_ton) VALUES (?, 15.0)", (user_id,))
        conn.commit()
    except Exception as e:
        print(f"[get_balance] insert error: {e}")
    finally:
        if conn:
            conn.close()
    return jsonify({"balance_ton": 15.0, "balance_stars": 0.0})


@app.route("/api/update_balance", methods=["POST"])
def update_balance():
    data = request.get_json(force=True, silent=True)
    if not data:
        return jsonify({"error": "Invalid JSON body"}), 400
    user_id = str(data.get("user_id", "unknown"))
    balance = float(data.get("balance", 0))
    if not user_id or user_id == "unknown":
        return jsonify({"error": "user_id is required"}), 400
    conn = None
    try:
        conn = sqlite3.connect(DB_PATH)
        c = conn.cursor()
        # Upsert: создаём строку если нет, обновляем баланс
        c.execute("INSERT INTO users (id, balance_ton) VALUES (?, ?) ON CONFLICT(id) DO UPDATE SET balance_ton = ?",
                  (user_id, balance, balance))
        conn.commit()
        return jsonify({"success": True})
    except Exception as e:
        print(f"[update_balance] error: {e}")
        return jsonify({"error": "Internal server error"}), 500
    finally:
        if conn:
            conn.close()


# ── Server Time ──────────────────────────────────────────────────────
@app.route("/api/time", methods=["GET"])
def get_server_time():
    now = datetime.utcnow()
    return jsonify({
        "timestamp": now.timestamp() * 1000,  # миллисекунды
        "date": now.isoformat()
    })


# ── Check Telegram Subscription ─────────────────────────────────────
@app.route("/api/check_subscription", methods=["POST"])
def check_subscription():
    data = request.get_json(force=True, silent=True)
    if not data:
        return jsonify({"error": "Invalid JSON body"}), 400
    user_id = str(data.get("user_id", "")).strip()
    if not user_id:
        return jsonify({"error": "Missing user_id"}), 400

    if not TG_BOT_TOKEN:
        return jsonify({"error": "Bot token not configured"}), 500

    # ── 1. Проверяем, что бот является админом канала ────────────────
    try:
        me_resp = requests.post(
            f"{TG_API_BASE}/bot{TG_BOT_TOKEN}/getMe",
            timeout=15,
        )
        me_resp.raise_for_status()
        bot_id = me_resp.json().get("result", {}).get("id")
        if not bot_id:
            return jsonify({"error": "Не удалось получить ID бота"}), 500
    except Exception as e:
        print(f"[check_subscription] getMe error: {e}")
        return jsonify({"error": f"Telegram API error: {e}"}), 500

    try:
        bot_resp = requests.post(
            f"{TG_API_BASE}/bot{TG_BOT_TOKEN}/getChatMember",
            json={"chat_id": TG_SUBSCRIPTION_CHANNEL, "user_id": bot_id},
            timeout=15,
        )
        bot_resp.raise_for_status()
        bot_data = bot_resp.json()
    except Exception as e:
        print(f"[check_subscription] getChatMember (bot) error: {e}")
        return jsonify({"error": f"Telegram API error: {e}"}), 500

    bot_status = bot_data.get("result", {}).get("status", "")
    if bot_status not in ("administrator", "creator"):
        print(f"[check_subscription] Bot is NOT admin, status={bot_status}")
        return jsonify({"error": "Бот не админ канала"}), 500

    # ── 2. Проверяем подписку пользователя ───────────────────────────
    try:
        user_resp = requests.post(
            f"{TG_API_BASE}/bot{TG_BOT_TOKEN}/getChatMember",
            json={"chat_id": TG_SUBSCRIPTION_CHANNEL, "user_id": int(user_id)},
            timeout=15,
        )
        user_data = user_resp.json()
    except Exception as e:
        print(f"[check_subscription] getChatMember (user) error: {e}")
        return jsonify({"error": f"Telegram API error: {e}"}), 500

    if not user_data.get("ok"):
        # Пользователь не найден / не в канале — не подписан
        return jsonify({"subscribed": False})

    user_status = user_data.get("result", {}).get("status", "left")
    subscribed = user_status in ("member", "administrator", "creator")
    print(f"[check_subscription] user={user_id} status={user_status} subscribed={subscribed}")
    return jsonify({"subscribed": subscribed})


# API endpoints
@app.route("/api/play_game", methods=["POST"])
def play_game():
    data = request.get_json(force=True, silent=True)
    if not data:
        return jsonify({"error": "Invalid JSON body"}), 400

    init_data = data.get("initData", "")
    # Если initData пустая (браузер/тест) — пропускаем
    # Если initData есть — проверяем, что начинается с query_id=
    if init_data and not init_data.startswith('query_id='):
        return jsonify({"error": "Forbidden: invalid initData"}), 403

    user_id = data.get("user_id", "unknown")
    game_type = data.get("game_type", "")

    if not game_type:
        return jsonify({"error": "game_type is required"}), 400

    # ── Upgrade (апгрейд NFT) ────────────────────────────────────────
    if game_type == "upgrade":
        start_price = float(data.get("start_price", 0))
        end_price = float(data.get("end_price", 0))
        if start_price <= 0 or end_price <= 0:
            return jsonify({"error": "start_price and end_price must be > 0"}), 400

        # Шанс: (start_price / end_price) * 100, но не больше 75%
        raw_chance = (start_price / end_price) * 100
        chance = min(raw_chance, 75.0)

        # Генерация случайного числа от 0 до 100
        roll = random.uniform(0, 100)
        success = roll < chance

        # Предмет цели (передан с фронтенда)
        item = None
        if success:
            item = {
                "name": data.get("target_name", "Unknown"),
                "floor": end_price,
                "image": data.get("target_image", "")
            }

        return jsonify({"success": success, "item": item, "user_id": user_id})

    # ── Для остальных game_type требуется bet_amount ─────────────────
    bet_amount = float(data.get("bet_amount", 0))
    if bet_amount <= 0:
        return jsonify({"error": "bet_amount must be > 0"}), 400

    if game_type == "crash":
        crash_point = generate_crash_point()
        return jsonify({"crash_point": crash_point, "user_id": user_id})

    elif game_type == "case":
        item = pick_case_item(data.get("case_id", ""))
        return jsonify({"success": True, "item": item, "user_id": user_id})

    else:
        return jsonify({"error": f"Unknown game_type: {game_type}"}), 400


# ── Plinko Drop ──────────────────────────────────────────────────────
# Массивы множителей, синхронизированные с фронтендом (Stake-style)
MULTIS_8  = [5.6, 2.1, 0.8, 0.5, 0.5, 0.5, 0.8, 2.1, 5.6]
MULTIS_10 = [8.0, 2.8, 1.4, 1.0, 0.6, 0.5, 0.6, 1.0, 1.4, 2.8, 8.0]
MULTIS_12 = [10.0, 3.0, 1.6, 1.4, 0.8, 0.5, 0.5, 0.5, 0.8, 1.4, 1.6, 3.0, 10.0]

# Веса, соответствующие house edge ~23%
# Чем ближе к центру (0.5x) — тем выше вес
WEIGHTS_8  = [1, 2, 5, 15, 15, 15, 5, 2, 1]
WEIGHTS_10 = [1, 2, 4, 8, 12, 15, 12, 8, 4, 2, 1]
WEIGHTS_12 = [1, 1, 3, 5, 10, 15, 15, 15, 10, 5, 3, 1, 1]


@app.route("/api/plinko_drop", methods=["POST"])
def plinko_drop():
    data = request.get_json(force=True, silent=True)
    if not data:
        return jsonify({"error": "Invalid JSON body"}), 400
    bet_amount = float(data.get("bet_amount", 0))
    if bet_amount <= 0:
        return jsonify({"error": "bet_amount must be > 0"}), 400

    rows = int(data.get("rows", 8))

    # Выбираем массив и веса по количеству рядов
    if rows == 8:
        multis = MULTIS_8
        w = WEIGHTS_8
    elif rows == 10:
        multis = MULTIS_10
        w = WEIGHTS_10
    elif rows == 12:
        multis = MULTIS_12
        w = WEIGHTS_12
    else:
        return jsonify({"error": f"Unsupported rows: {rows}. Use 8, 10 or 12."}), 400

    # Выбираем индекс слота по весовой таблице
    slot_index = random.choices(range(len(multis)), weights=w, k=1)[0]
    multiplier = multis[slot_index]

    win_amount = round(bet_amount * multiplier, 2)
    return jsonify({
        "slotIndex": slot_index,
        "multiplier": multiplier,
        "win_amount": win_amount
    })


# ── Open Case ────────────────────────────────────────────────────────
@app.route("/api/open_case", methods=["POST"])
def open_case():
    data = request.get_json(force=True, silent=True)
    if not data:
        return jsonify({"error": "Invalid JSON body"}), 400
    user_id = str(data.get("user_id", "unknown"))
    case_price = float(data.get("case_price", 0))
    case_id = str(data.get("case_id", "")).strip()
    if not user_id or user_id == "unknown":
        return jsonify({"error": "user_id is required"}), 400

    # ── Бесплатный кейс ─────────────────────────────────────────────
    if case_id == "case_free" or case_price == 0:
        # Проверяем, не забрал ли уже пользователь кейс сегодня
        conn = None
        try:
            conn = sqlite3.connect(DB_PATH)
            c = conn.cursor()
            c.execute("SELECT last_claim_date FROM free_case_claims WHERE user_id = ?", (user_id,))
            row = c.fetchone()
            today = datetime.utcnow().strftime("%Y-%m-%d")
            if row and row[0] == today:
                return jsonify({"error": "Вы уже забрали бесплатный кейс сегодня"}), 400

            # Выбираем случайный предмет из FREE_CASE_POOL
            item = pick_case_item_from_pool(FREE_CASE_POOL)
            item_id = str(uuid.uuid4())

            # Если выпал TON — начисляем на баланс
            if item.get("is_ton"):
                c.execute(
                    "UPDATE users SET balance_ton = COALESCE(balance_ton, 0) + ? WHERE id = ?",
                    (item["price"], user_id)
                )
                c.execute(
                    "INSERT OR IGNORE INTO users (id, balance_ton) VALUES (?, ?)",
                    (user_id, item["price"])
                )
            else:
                # Добавляем предмет в инвентарь
                c.execute(
                    "INSERT INTO inventory (user_id, item_id, name, image, floor) VALUES (?, ?, ?, ?, ?)",
                    (user_id, item_id, item["name"], item["image"], item["price"])
                )

            # Записываем дату получения бесплатного кейса
            c.execute(
                "INSERT OR REPLACE INTO free_case_claims (user_id, last_claim_date) VALUES (?, ?)",
                (user_id, today)
            )
            conn.commit()
            if conn:
                conn.close()
        except Exception as e:
            print(f"[open_case/free] error: {e}")
            if conn:
                conn.close()
            return jsonify({"error": "Database error"}), 500

        return jsonify({"success": True, "item": {**item, "id": item_id}})

    # ── Платные кейсы ───────────────────────────────────────────────
    if case_price <= 0:
        return jsonify({"error": "case_price must be > 0"}), 400

    # Проверяем баланс пользователя
    conn = None
    try:
        conn = sqlite3.connect(DB_PATH)
        c = conn.cursor()
        c.execute("SELECT balance_ton FROM users WHERE id = ?", (user_id,))
        row = c.fetchone()
        if not row:
            # Создаём пользователя с балансом 15.0
            c.execute("INSERT OR IGNORE INTO users (id, balance_ton) VALUES (?, 15.0)", (user_id,))
            conn.commit()
            balance = 15.0
        else:
            balance = row[0]
    except Exception as e:
        print(f"[open_case] select/insert error: {e}")
        if conn:
            conn.close()
        return jsonify({"error": "Database error"}), 500

    if balance < case_price:
        if conn:
            conn.close()
        return jsonify({"error": "Недостаточно средств"}), 400

    # Списываем цену кейса
    try:
        new_balance = balance - case_price

        # Выбираем случайный предмет из пула, соответствующего ID кейса
        item = pick_case_item(case_id)
        item_id = str(uuid.uuid4())

        # Добавляем предмет в отдельную таблицу инвентаря
        c.execute(
            "INSERT INTO inventory (user_id, item_id, name, image, floor) VALUES (?, ?, ?, ?, ?)",
            (user_id, item_id, item["name"], item["image"], item["price"])
        )

        # Обновляем баланс
        c.execute(
            "UPDATE users SET balance_ton = ? WHERE id = ?",
            (new_balance, user_id)
        )
        conn.commit()
        if conn:
            conn.close()
    except Exception as e:
        print(f"[open_case] update error: {e}")
        if conn:
            conn.close()
        return jsonify({"error": "Database error"}), 500

    return jsonify({"success": True, "item": {**item, "id": item_id}})


# ── Inventory ──────────────────────────────────────────────────────────
@app.route("/api/inventory", methods=["GET"])
def get_inventory():
    user_id = request.args.get("user_id", "6267608438")
    conn = None
    try:
        conn = sqlite3.connect(DB_PATH)
        c = conn.cursor()
        c.execute("SELECT id, item_id, name, image, floor, timestamp FROM inventory WHERE user_id = ?", (user_id,))
        rows = c.fetchall()
    except Exception as e:
        print(f"[get_inventory] error: {e}")
        return jsonify([])
    finally:
        if conn:
            conn.close()

    items = [
        {
            "id": row[0],          # ← УНИКАЛЬНЫЙ ID записи (PRIMARY KEY)
            "item_id": row[1],      # ← ID предмета (может повторяться для одинаковых NFT)
            "name": row[2],
            "image": row[3],
            "floor": row[4],
            "timestamp": row[5]
        }
        for row in rows
    ]
    return jsonify(items)


@app.route("/api/inventory/add", methods=["POST"])
def inventory_add():
    data = request.get_json(force=True, silent=True)
    if not data:
        return jsonify({"error": "Invalid JSON body"}), 400
    user_id = str(data.get("user_id", "unknown"))
    item = data.get("item")
    if not user_id or user_id == "unknown":
        return jsonify({"error": "user_id is required"}), 400
    if not item:
        return jsonify({"error": "item is required"}), 400

    item_id = item.get("id") if isinstance(item, dict) else None
    if not item_id:
        item_id = str(uuid.uuid4())
    name = item.get("name", "Unknown") if isinstance(item, dict) else "Unknown"
    image = item.get("image", "") if isinstance(item, dict) else ""
    floor = float(item.get("floor", 0)) if isinstance(item, dict) else 0.0

    conn = None
    try:
        conn = sqlite3.connect(DB_PATH)
        c = conn.cursor()
        c.execute(
            "INSERT INTO inventory (user_id, item_id, name, image, floor) VALUES (?, ?, ?, ?, ?)",
            (user_id, item_id, name, image, floor)
        )
        conn.commit()
    except Exception as e:
        print(f"[inventory_add] insert error: {e}")
        return jsonify({"error": "Database error"}), 500
    finally:
        if conn:
            conn.close()

    return jsonify({"success": True})


@app.route("/api/inventory/remove", methods=["POST"])
def inventory_remove():
    data = request.get_json(force=True, silent=True)
    if not data:
        return jsonify({"error": "Invalid JSON body"}), 400
    user_id = str(data.get("user_id", "unknown"))
    inventory_id = data.get("inventory_id")
    if not user_id or user_id == "unknown":
        return jsonify({"error": "user_id is required"}), 400
    if inventory_id is None:
        return jsonify({"error": "inventory_id is required"}), 400

    conn = None
    try:
        conn = sqlite3.connect(DB_PATH)
        c = conn.cursor()
        c.execute("DELETE FROM inventory WHERE id = ?", (inventory_id,))
        conn.commit()
    except Exception as e:
        print(f"[inventory_remove] delete error: {e}")
        return jsonify({"error": "Database error"}), 500
    finally:
        if conn:
            conn.close()

    return jsonify({"success": True})


# ── Buy NFT (Market) ─────────────────────────────────────────────────────
@app.route("/api/buy_nft", methods=["POST"])
def buy_nft():
    """Покупка NFT из маркета: списывает TON и добавляет предмет в инвентарь."""
    data = request.get_json(force=True, silent=True)
    if not data:
        return jsonify({"error": "Invalid JSON body"}), 400

    user_id = str(data.get("user_id", "unknown"))
    item = data.get("item")

    if not user_id or user_id == "unknown":
        return jsonify({"error": "user_id is required"}), 400
    if not item:
        return jsonify({"error": "item is required"}), 400

    price = float(item.get("floor", 0))
    if price <= 0:
        return jsonify({"error": "Invalid item price"}), 400

    try:
        conn = sqlite3.connect(DB_PATH)
        c = conn.cursor()
    except Exception as e:
        print(f"[buy_nft] connect error: {e}")
        return jsonify({"error": "Database connection error"}), 500

    # Проверяем баланс
    try:
        c.execute("SELECT balance_ton FROM users WHERE id = ?", (user_id,))
        row = c.fetchone()
    except Exception as e:
        print(f"[buy_nft] select error: {e}")
        if conn:
            conn.close()
        return jsonify({"error": "Database error"}), 500

    if row:
        balance = row[0]
    else:
        balance = 15.0

    if balance < price:
        if conn:
            conn.close()
        return jsonify({"error": "Недостаточно TON"}), 400

    # Добавляем предмет в отдельную таблицу инвентаря
    item_id = item.get("id") if isinstance(item, dict) else str(uuid.uuid4())
    name = item.get("name", "Unknown") if isinstance(item, dict) else "Unknown"
    image = item.get("image", "") if isinstance(item, dict) else ""
    floor = float(item.get("floor", 0)) if isinstance(item, dict) else 0.0

    new_balance = round(balance - price, 2)

    try:
        c.execute(
            "INSERT INTO inventory (user_id, item_id, name, image, floor) VALUES (?, ?, ?, ?, ?)",
            (user_id, item_id, name, image, floor)
        )
        c.execute(
            "UPDATE users SET balance_ton = ? WHERE id = ?",
            (new_balance, user_id)
        )
        conn.commit()
    except Exception as e:
        print(f"[buy_nft] insert/update error: {e}")
        if conn:
            conn.close()
        return jsonify({"error": "Database error"}), 500

    if conn:
        conn.close()

    return jsonify({
        "success": True,
        "new_balance": new_balance
    })


# ── Sell NFT ─────────────────────────────────────────────────────────────
@app.route("/api/sell_nft", methods=["POST"])
def sell_nft():
    data = request.get_json(force=True, silent=True)
    if not data:
        return jsonify({"error": "Invalid JSON"}), 400
    user_id = str(data.get("user_id", "unknown"))
    price = float(data.get("price", 0))
    inventory_id = data.get("inventory_id")

    if not user_id or user_id == "unknown":
        return jsonify({"error": "user_id is required"}), 400

    conn = None
    try:
        conn = sqlite3.connect(DB_PATH)
        c = conn.cursor()
        c.execute("SELECT balance_ton FROM users WHERE id = ?", (user_id,))
        row = c.fetchone()
        balance = row[0] if row else 15.0

        new_balance = balance + price
        c.execute("INSERT INTO users (id, balance_ton) VALUES (?, ?) ON CONFLICT(id) DO UPDATE SET balance_ton = ?",
                  (user_id, new_balance, new_balance))

        # Удаляем проданный предмет из инвентаря по уникальному ID записи,
        # чтобы нельзя было продать один и тот же NFT несколько раз,
        # и чтобы не снести два одинаковых предмета.
        if inventory_id is not None:
            c.execute("DELETE FROM inventory WHERE id = ?", (inventory_id,))

        conn.commit()
    except Exception as e:
        print(f"[sell_nft] error: {e}")
        return jsonify({"error": "Database error"}), 500
    finally:
        if conn:
            conn.close()

    return jsonify({"success": True, "new_balance": new_balance})


# Mines endpoints
@app.route("/api/mines_start", methods=["POST"])
def mines_start():
    data = request.get_json(force=True, silent=True)
    if not data:
        return jsonify({"error": "Invalid JSON body"}), 400

    user_id = str(data.get("user_id", "unknown"))
    bet = float(data.get("bet", 0))
    size = int(data.get("size", 5))
    mines_count = int(data.get("mines_count", 3))

    if bet <= 0:
        return jsonify({"error": "Bet must be > 0"}), 400

    total_cells = size * size
    if mines_count >= total_cells:
        return jsonify({"error": "Too many mines"}), 400

    cells = list(range(total_cells))
    for i in range(len(cells) - 1, 0, -1):
        j = random.randint(0, i)
        cells[i], cells[j] = cells[j], cells[i]

    mine_indexes = cells[:mines_count]

    active_mines_games[user_id] = {
        "mines": mine_indexes,
        "safe_revealed": [],
        "multiplier": 1.0,
        "game_over": False,
        "bet": bet,
        "total_cells": total_cells,
        "mines_count": mines_count
    }

    return jsonify({
        "status": "started",
        "total_cells": total_cells,
        "mines": mines_count,
        "user_id": user_id
    })


@app.route("/api/mines_click", methods=["POST"])
def mines_click():
    data = request.get_json(force=True, silent=True)
    if not data:
        return jsonify({"error": "Invalid JSON body"}), 400

    user_id = str(data.get("user_id", "unknown"))
    cell_index = int(data.get("cell_index", -1))

    game = active_mines_games.get(user_id)
    if not game:
        return jsonify({"error": "Game not found. Start a new game first."}), 404
    if game["game_over"]:
        return jsonify({"error": "Game is already over"}), 400
    if cell_index < 0:
        return jsonify({"error": "Invalid cell_index"}), 400
    if cell_index in game["safe_revealed"]:
        return jsonify({"error": "Cell already revealed"}), 400

    if cell_index in game["mines"]:
        game["game_over"] = True
        return jsonify({
            "status": "boom",
            "cell_index": cell_index,
            "mine_indexes": game["mines"],
            "user_id": user_id
        })
    else:
        game["safe_revealed"].append(cell_index)
        safe_count = len(game["safe_revealed"])
        new_multiplier = round(1.0 + safe_count * 0.2, 2)
        game["multiplier"] = new_multiplier
        return jsonify({
            "status": "safe",
            "cell_index": cell_index,
            "safe_count": safe_count,
            "new_multiplier": new_multiplier,
            "user_id": user_id
        })


# ── Telegram Stars Invoice ─────────────────────────────────────────────
@app.route("/api/create_invoice", methods=["POST"])
def create_invoice():
    """Создаёт счёт для оплаты Telegram Stars."""
    data = request.get_json(force=True, silent=True)
    if not data:
        return jsonify({"error": "Invalid JSON body"}), 400

    user_id = str(data.get("user_id", ""))
    amount = data.get("amount", 0)

    if not user_id:
        return jsonify({"error": "Missing user_id"}), 400
    try:
        amount = int(amount)
    except (ValueError, TypeError):
        return jsonify({"error": "Amount must be a number"}), 400
    if amount < 50:
        return jsonify({"error": "Минимум 50 Stars"}), 400

    bot_token = "8837626872:AAEEqnmT-hEKwMOhTfZ9LDLmOu7AHi88Pzw"
    url = f"https://api.telegram.org/bot{bot_token}/createInvoiceLink"
    headers = {"Content-Type": "application/json"}

    # ── Прокси через QuantumProxies ──────────────────────────────────
    proxy_url = (
        "http://qp_live_63883d50984c71728cd4f125bdfa64c229299b2f4cf338cbc7000c01ac56a226"
        ":@residentialboson.quantumproxies.io:10000"
    )
    proxies = {"http": proxy_url, "https": proxy_url}

    payload = {
        "title": "Пополнение баланса",
        "description": f"Покупка {amount} Stars",
        "payload": f"topup_{user_id}_{amount}",
        "currency": "XTR",
        "provider_token": "",
        "prices": [{"label": "Stars", "amount": int(amount)}]
    }

    # ── Повторные попытки (retry) для Cloudflare Worker ─────────────
    max_attempts = 3
    retry_delay_sec = 2
    timeout_sec = 30
    response = None

    for attempt in range(1, max_attempts + 1):
        try:
            print(f"[create_invoice] Attempt {attempt}/{max_attempts}: POST {url}")
            headers["Content-Type"] = "application/json"
            print(f"[create_invoice] Attempt {attempt}: Payload: {json.dumps(payload, ensure_ascii=False)}")
            print(f"[create_invoice] Attempt {attempt}: Timeout={timeout_sec}s, waiting for worker...")
            response = requests.post(url, json=payload, headers=headers, proxies=proxies, timeout=timeout_sec)
            print(f"[create_invoice] Attempt {attempt}: Status {response.status_code}")
            print(f"[create_invoice] Attempt {attempt}: Response: {response.text[:500]}")
        except requests.exceptions.Timeout:
            print(f"[create_invoice] Attempt {attempt}: TIMEOUT after {timeout_sec}s (Cloudflare Worker не ответил)")
            response = None
        except requests.exceptions.RequestException as e:
            print(f"[create_invoice] Attempt {attempt}: REQUEST ERROR -> {e}")
            response = None
        except Exception as e:
            print(f"[create_invoice] Attempt {attempt}: UNEXPECTED ERROR -> {e}")
            response = None

        if response is not None:
            # Запрос выполнен — обрабатываем ответ
            try:
                result = response.json()
            except Exception as json_err:
                print(f"[create_invoice] Attempt {attempt}: Невалидный JSON в ответе -> {json_err}")
                result = None

            if result is not None and result.get("ok"):
                invoice_link = result.get("result")
                if not invoice_link:
                    print(f"[create_invoice] Attempt {attempt}: ok=true, но нет ссылки на счёт")
                    return jsonify({"error": "Telegram не вернул ссылку на счёт"}), 500
                print(f"[create_invoice] Attempt {attempt}: SUCCESS, invoiceLink = {invoice_link}")
                return jsonify({"invoiceLink": invoice_link})

            if result is not None:
                error_desc = result.get("description", "Unknown error")
                print(f"[create_invoice] Attempt {attempt}: Telegram error -> {error_desc}")
                return jsonify({"error": f"Ошибка Telegram: {error_desc}"}), 400

            # result = None (невалидный JSON) — считаем неудачей и повторяем
        else:
            print(f"[create_invoice] Attempt {attempt}: Запрос завершился без ответа (неудача)")

        # Если это не последняя попытка — пауза перед ретраем
        if attempt < max_attempts:
            print(f"[create_invoice] Retry через {retry_delay_sec} сек...")
            time.sleep(retry_delay_sec)

    # Все попытки исчерпаны
    print(f"[create_invoice] FAILED: все {max_attempts} попытки не удались")
    return jsonify({"error": "Не удалось создать счет. Попробуйте позже"}), 500


@app.route("/api/health", methods=["GET"])
def health():
    return jsonify({"status": "ok", "service": "cazino-game-server"})



# ── Crash State ──────────────────────────────────────────────────────────
@app.route("/api/crash_state", methods=["GET"])
def crash_state():
    """Возвращает текущее состояние Crash-раунда."""
    with CRASH_LOCK:
        return jsonify({
            "state": CRASH_STATE,
            "timer": CRASH_TIMER,
            "crash_point": CRASH_POINT,
            "start_time": CRASH_START_TIME
        })



# ── Withdraw NFT (уведомление админу) ─────────────────────────────────
@app.route("/api/withdraw_nft", methods=["POST"])
def withdraw_nft():
    """
    Принимает заявку на вывод NFT и отправляет уведомление админу в Telegram.
    """
    data = request.get_json(force=True, silent=True)
    if not data:
        return jsonify({"error": "Invalid JSON body"}), 400

    user_id = str(data.get("user_id", "unknown"))
    username = str(data.get("username", "unknown"))
    nft_name = str(data.get("nft_name", "unknown"))
    nft_price = float(data.get("nft_price", 0))

    # Формируем текст уведомления
    text = (
        "🔔 ЗАЯВКА НА ВЫВОД NFT!\n\n"
        "👤 Юзер: @{} (ID: {})\n"
        "🎁 NFT: {}\n"
        "💰 Цена: {} TON\n\n"
        "⚠️ Проверьте NFT и отправьте его юзеру."
    ).format(username, user_id, nft_name, nft_price)

    try:
        bot_token = "8837626872:AAEEqnmT-hEKwMOhTfZ9LDLmOu7AHi88Pzw"
        url = f"https://stars.gleb0256149.workers.dev/bot{bot_token}/sendMessage"
        payload = {
            "chat_id": 6267608438,
            "text": text,
        }
        resp = requests.post(url, json=payload, timeout=10)
        if not resp.ok:
            print(f"[withdraw_nft] Telegram API error: {resp.status_code} {resp.text}")
    except Exception as e:
        print(f"[withdraw_nft] Request failed: {e}")

    return jsonify({"success": True})


# ── Turnover Leaderboard ──────────────────────────────────────────────
@app.route("/api/add_turnover", methods=["POST"])
def add_turnover():
    """Фиксирует ставку пользователя в таблице оборота."""
    data = request.get_json(force=True, silent=True)
    if not data:
        return jsonify({"error": "Invalid JSON body"}), 400

    user_id = str(data.get("user_id", "unknown"))
    username = str(data.get("username", "Unknown"))
    amount = float(data.get("amount", 0))

    if amount <= 0:
        return jsonify({"error": "Amount must be > 0"}), 400

    conn = None
    try:
        conn = sqlite3.connect(DB_PATH)
        c = conn.cursor()
        c.execute(
            "INSERT INTO turnover (user_id, username, amount) VALUES (?, ?, ?)",
            (user_id, username, amount)
        )
        conn.commit()
    except Exception as e:
        print(f"[add_turnover] error: {e}")
        return jsonify({"error": "Database error"}), 500
    finally:
        if conn:
            conn.close()
    return jsonify({"success": True})


@app.route("/api/leaderboard_turnover", methods=["GET"])
def leaderboard_turnover():
    """Возвращает топ-15 юзеров по сумме оборота."""
    conn = None
    try:
        conn = sqlite3.connect(DB_PATH)
        c = conn.cursor()
        c.execute("""
            SELECT username, SUM(amount) as total
            FROM turnover
            GROUP BY user_id
            ORDER BY total DESC
            LIMIT 15
        """)
        rows = c.fetchall()
        leaderboard = [{"username": row[0], "total": round(row[1], 2)} for row in rows]
        return jsonify(leaderboard)
    except Exception as e:
        print(f"[leaderboard_turnover] error: {e}")
        return jsonify([])
    finally:
        if conn:
            conn.close()


# ── Запуск фоновой задачи сброса лидерборда ───────────────────────────
def start_leaderboard_reset_worker():
    """Запускает фоновый поток для автоматического сброса лидерборда."""
    thread = threading.Thread(target=check_and_reset_leaderboard, daemon=True)
    thread.start()
    print("[Server] Фоновый поток сброса лидерборда запущен.")


start_leaderboard_reset_worker()

# ── Запуск фонового потока Crash ─────────────────────────────────────────
crash_thread = threading.Thread(target=crash_game_loop, daemon=True)
crash_thread.start()
print("[Server] Фоновый поток Crash запущен.")




if __name__ == "__main__":
    port = int(os.environ.get("PORT", 8000))
    debug = os.environ.get("DEBUG", "false").lower() == "true"
    app.run(host="0.0.0.0", port=port, debug=debug)
