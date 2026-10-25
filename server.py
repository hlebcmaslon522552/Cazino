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
TG_BOT_TOKEN = os.environ.get("TG_BOT_TOKEN", "")
TG_ADMIN_CHAT_ID = os.environ.get("TG_ADMIN_CHAT_ID", "")


def init_db():
    conn = sqlite3.connect(DB_PATH)
    c = conn.cursor()
    c.execute("""
        CREATE TABLE IF NOT EXISTS users (
            id TEXT PRIMARY KEY,
            balance_ton REAL DEFAULT 15.0,
            balance_stars REAL DEFAULT 0.0,
            referrer_id TEXT DEFAULT NULL,
            inventory TEXT DEFAULT '[]'
        )
    """)
    # Миграция: добавляем колонки, если их нет (для старых БД)
    for col_def in [
        "ALTER TABLE users ADD COLUMN balance_stars REAL DEFAULT 0.0",
        "ALTER TABLE users ADD COLUMN referrer_id TEXT DEFAULT NULL",
        "ALTER TABLE users ADD COLUMN balance_ton REAL DEFAULT 15.0",
        "ALTER TABLE users ADD COLUMN inventory TEXT DEFAULT '[]'",
    ]:
        try:
            c.execute(col_def)
        except sqlite3.OperationalError:
            pass  # колонка уже существует
    # Таблица депозитов (для лидерборда)
    c.execute("""
        CREATE TABLE IF NOT EXISTS deposits (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id TEXT NOT NULL,
            amount REAL NOT NULL,
            created_at TEXT DEFAULT (datetime('now')),
            prize_paid INTEGER DEFAULT 0
        )
    """)
    # Таблица конфигов (для хранения времени последнего сброса)
    c.execute("""
        CREATE TABLE IF NOT EXISTS config (
            key TEXT PRIMARY KEY,
            value TEXT NOT NULL
        )
    """)
    # Инициализация времени последнего сброса (если нет — ставим сейчас)
    c.execute("INSERT OR IGNORE INTO config (key, value) VALUES ('last_reset', datetime('now'))")

    # Таблица оборота (turnover)
    c.execute("""
        CREATE TABLE IF NOT EXISTS turnover (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id TEXT,
            username TEXT,
            amount REAL
        )
    """)

    # Пользователь по умолчанию (id из браузера)
    try:
        c.execute("INSERT OR IGNORE INTO users (id, balance_ton) VALUES ('6267608438', 15.0)")
        conn.commit()
    except Exception as e:
        print(f"[init_db] insert default user error: {e}")
    finally:
        conn.close()


init_db()

def verify_init_data(init_data):
    return bool(init_data and init_data.strip())


# ── Пул предметов для кейсов ──────────────────────────────────────────
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
# ── Telegram Notification ──────────────────────────────────────────
def send_telegram_notification(message: str):
    """Отправляет сообщение админу в Telegram."""
    if not TG_BOT_TOKEN or not TG_ADMIN_CHAT_ID:
        print(f"[TG] Not configured, skipping notification. Message: {message}")
        return False
    try:
        url = f"https://api.telegram.org/bot{TG_BOT_TOKEN}/sendMessage"
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
    try:
        conn = sqlite3.connect(DB_PATH)
        c = conn.cursor()
        c.execute("""
            SELECT user_id, SUM(amount) as total
            FROM deposits
            WHERE prize_paid = 0
            GROUP BY user_id
            ORDER BY total DESC
            LIMIT 15
        """)
        rows = c.fetchall()
        conn.close()
        return rows
    except Exception as e:
        print(f"[get_total_deposits_by_user] error: {e}")
        return []


def award_prizes(top_users: list) -> str:
    """
    Начисляет призы топ-15 пользователям.
    Возвращает строку с отчетом для Telegram.
    """
    if not top_users:
        return "Нет пользователей для награждения."

    report_lines = ["🏆 <b>Топ обнулён! Призы выданы:</b>"]
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
        conn.close()
    except Exception as e:
        print(f"[award_prizes] error: {e}")
        report_lines.append(f"  ❌ Ошибка: {e}")

    return "\n".join(report_lines)


def should_reset_now() -> bool:
    """
    Проверяет, пора ли сбрасывать лидерборд.
    Сброс происходит каждые RESET_INTERVAL_DAYS дней в RESET_HOUR часов.
    """
    try:
        conn = sqlite3.connect(DB_PATH)
        c = conn.cursor()
        c.execute("SELECT value FROM config WHERE key = 'last_reset'")
        row = c.fetchone()
        conn.close()
    except Exception as e:
        print(f"[should_reset_now] error: {e}")
        return False

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
    try:
        conn = sqlite3.connect(DB_PATH)
        c = conn.cursor()
        c.execute("UPDATE config SET value = ? WHERE key = 'last_reset'", (now_str,))
        conn.commit()
        conn.close()
    except Exception as e:
        print(f"[update_last_reset_time] error: {e}")


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
    try:
        conn = sqlite3.connect(DB_PATH)
        c = conn.cursor()
        c.execute("SELECT balance_ton, balance_stars FROM users WHERE id = ?", (user_id,))
        row = c.fetchone()
        conn.close()
        if row:
            return jsonify({"balance_ton": row[0], "balance_stars": row[1]})
    except Exception as e:
        print(f"[get_balance] select error: {e}")

    # Если пользователя нет или ошибка — создаём с балансом 15 TON
    try:
        conn = sqlite3.connect(DB_PATH)
        c = conn.cursor()
        c.execute("INSERT OR IGNORE INTO users (id, balance_ton) VALUES (?, 15.0)", (user_id,))
        conn.commit()
        conn.close()
    except Exception as e:
        print(f"[get_balance] insert error: {e}")
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
    try:
        conn = sqlite3.connect(DB_PATH)
        c = conn.cursor()
        # Upsert: создаём строку если нет, обновляем баланс
        c.execute("INSERT INTO users (id, balance_ton) VALUES (?, ?) ON CONFLICT(id) DO UPDATE SET balance_ton = ?",
                  (user_id, balance, balance))
        conn.commit()
        conn.close()
        return jsonify({"success": True})
    except Exception as e:
        print(f"update_balance error: {e}")
        return jsonify({"error": "Internal server error"}), 500


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
        item = pick_case_item()
        return jsonify({"success": True, "item": item, "user_id": user_id})

    else:
        return jsonify({"error": f"Unknown game_type: {game_type}"}), 400


# ── Plinko Drop ──────────────────────────────────────────────────────
@app.route("/api/plinko_drop", methods=["POST"])
def plinko_drop():
    data = request.get_json(force=True, silent=True)
    if not data:
        return jsonify({"error": "Invalid JSON body"}), 400
    bet_amount = float(data.get("bet_amount", 0))
    if bet_amount <= 0:
        return jsonify({"error": "bet_amount must be > 0"}), 400

    # Серверная генерация множителя Plinko
    # Plinko multiplier: от x0.5 до x10.0 (23% house edge)
    weights = [1, 1, 2, 4, 12, 80]
    multipliers = [10.0, 5.0, 2.0, 1.5, 1.0, 0.5]
    multiplier = random.choices(multipliers, weights=weights, k=1)[0]

    win_amount = round(bet_amount * multiplier, 2)
    return jsonify({"multiplier": multiplier, "win_amount": win_amount})


# ── Open Case ────────────────────────────────────────────────────────
@app.route("/api/open_case", methods=["POST"])
def open_case():
    data = request.get_json(force=True, silent=True)
    if not data:
        return jsonify({"error": "Invalid JSON body"}), 400
    user_id = str(data.get("user_id", "unknown"))
    case_price = float(data.get("case_price", 0))
    if not user_id or user_id == "unknown":
        return jsonify({"error": "user_id is required"}), 400
    if case_price <= 0:
        return jsonify({"error": "case_price must be > 0"}), 400

    # Проверяем баланс пользователя
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
        return jsonify({"error": "Database error"}), 500

    if balance < case_price:
        conn.close()
        return jsonify({"error": "Недостаточно средств"}), 400

    # Списываем цену кейса
    try:
        new_balance = balance - case_price
        c.execute("UPDATE users SET balance_ton = ? WHERE id = ?", (new_balance, user_id))

        # Выбираем случайный предмет
        item = pick_case_item()
        conn.commit()
        conn.close()
    except Exception as e:
        print(f"[open_case] update error: {e}")
        conn.close()
        return jsonify({"error": "Database error"}), 500

    return jsonify({"success": True, "item": item})


# ── Inventory ──────────────────────────────────────────────────────────
@app.route("/api/inventory", methods=["GET"])
def get_inventory():
    user_id = request.args.get("user_id", "6267608438")
    try:
        conn = sqlite3.connect(DB_PATH)
        c = conn.cursor()
        c.execute("SELECT inventory FROM users WHERE id = ?", (user_id,))
        row = c.fetchone()
        conn.close()
    except Exception as e:
        print(f"[get_inventory] error: {e}")
        return jsonify([])

    if row and row[0]:
        try:
            items = json.loads(row[0])
        except json.JSONDecodeError:
            items = []
    else:
        items = []
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

    try:
        conn = sqlite3.connect(DB_PATH)
        c = conn.cursor()
    except Exception as e:
        print(f"[inventory_add] connect error: {e}")
        return jsonify({"error": "Database connection error"}), 500

    try:
        c.execute("SELECT inventory FROM users WHERE id = ?", (user_id,))
        row = c.fetchone()
    except Exception as e:
        print(f"[inventory_add] select error: {e}")
        conn.close()
        return jsonify({"error": "Database error"}), 500

    if row and row[0]:
        try:
            items = json.loads(row[0])
        except json.JSONDecodeError:
            items = []
    else:
        items = []

    # Избегаем дубликатов по id (если есть)
    item_id = item.get("id") if isinstance(item, dict) else None
    if item_id is not None:
        if not any(isinstance(i, dict) and i.get("id") == item_id for i in items):
            items.append(item)
    else:
        items.append(item)

    inventory_json = json.dumps(items, ensure_ascii=False)
    try:
        c.execute("INSERT INTO users (id, inventory) VALUES (?, ?) ON CONFLICT(id) DO UPDATE SET inventory = ?",
                  (user_id, inventory_json, inventory_json))
        conn.commit()
    except Exception as e:
        print(f"[inventory_add] insert/update error: {e}")
        print(e)  # дополнительный вывод ошибки
        conn.close()
        return jsonify({"error": "Database error"}), 500

    conn.close()
    return jsonify({"success": True, "inventory": items})


@app.route("/api/inventory/remove", methods=["POST"])
def inventory_remove():
    data = request.get_json(force=True, silent=True)
    if not data:
        return jsonify({"error": "Invalid JSON body"}), 400
    user_id = str(data.get("user_id", "unknown"))
    item_id = data.get("item_id")
    if not user_id or user_id == "unknown":
        return jsonify({"error": "user_id is required"}), 400
    if item_id is None:
        return jsonify({"error": "item_id is required"}), 400

    try:
        conn = sqlite3.connect(DB_PATH)
        c = conn.cursor()
    except Exception as e:
        print(f"[inventory_remove] connect error: {e}")
        return jsonify({"error": "Database connection error"}), 500

    try:
        c.execute("SELECT inventory FROM users WHERE id = ?", (user_id,))
        row = c.fetchone()
    except Exception as e:
        print(f"[inventory_remove] select error: {e}")
        conn.close()
        return jsonify({"error": "Database error"}), 500

    if row and row[0]:
        try:
            items = json.loads(row[0])
        except json.JSONDecodeError:
            items = []
    else:
        items = []

    # Удаляем предмет по id
    items = [i for i in items if isinstance(i, dict) and i.get("id") != item_id]

    inventory_json = json.dumps(items, ensure_ascii=False)
    try:
        c.execute("INSERT INTO users (id, inventory) VALUES (?, ?) ON CONFLICT(id) DO UPDATE SET inventory = ?",
                  (user_id, inventory_json, inventory_json))
        conn.commit()
    except Exception as e:
        print(f"[inventory_remove] insert/update error: {e}")
        conn.close()
        return jsonify({"error": "Database error"}), 500

    conn.close()
    return jsonify({"success": True, "inventory": items})


# ── Sell NFT ─────────────────────────────────────────────────────────────
@app.route("/api/sell_nft", methods=["POST"])
def sell_nft():
    data = request.get_json(force=True, silent=True)
    if not data:
        return jsonify({"error": "Invalid JSON"}), 400
    user_id = str(data.get("user_id", "unknown"))
    price = float(data.get("price", 0))

    if not user_id or user_id == "unknown":
        return jsonify({"error": "user_id is required"}), 400

    try:
        conn = sqlite3.connect(DB_PATH)
        c = conn.cursor()
        c.execute("SELECT balance_ton FROM users WHERE id = ?", (user_id,))
        row = c.fetchone()
        balance = row[0] if row else 15.0

        new_balance = balance + price
        c.execute("INSERT INTO users (id, balance_ton) VALUES (?, ?) ON CONFLICT(id) DO UPDATE SET balance_ton = ?",
                  (user_id, new_balance, new_balance))
        conn.commit()
        conn.close()
    except Exception as e:
        print(f"[sell_nft] error: {e}")
        return jsonify({"error": "Database error"}), 500

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

    if not TG_BOT_TOKEN:
        print("[create_invoice] BOT_TOKEN is empty!")
        return jsonify({"error": "Telegram bot not configured"}), 500

    try:
        url = f"https://api.telegram.org/bot{TG_BOT_TOKEN}/createInvoiceLink"
        payload = {
            "title": "Пополнение баланса",
            "description": f"Покупка {amount} Stars",
            "payload": f"topup_{user_id}_{amount}",
            "currency": "XTR",
            "prices": [{"label": "Stars", "amount": int(amount)}]
        }
        print(f"[create_invoice] Sending to Telegram: {url}")
        print(f"[create_invoice] Payload: {json.dumps(payload, ensure_ascii=False)}")
        response = requests.post(url, json=payload, timeout=15)
        print("TELEGRAM RESPONSE:", response.json())

        result = response.json()
        if not result.get("ok"):
            error_desc = result.get("description", "Unknown error")
            print(f"[create_invoice] Telegram error: {error_desc}")
            return jsonify({"error": f"Ошибка Telegram: {error_desc}"}), 400

        invoice_link = result.get("result")
        if not invoice_link:
            return jsonify({"error": "Telegram не вернул ссылку на счёт"}), 500

        return jsonify({"invoiceLink": invoice_link})

    except requests.exceptions.Timeout:
        print("[create_invoice] Timeout connecting to Telegram API")
        return jsonify({"error": "Таймаут при обращении к Telegram"}), 500
    except requests.exceptions.RequestException as e:
        print(f"[create_invoice] Request error: {e}")
        return jsonify({"error": f"Ошибка соединения с Telegram: {str(e)}"}), 500
    except Exception as e:
        print(f"[create_invoice] Unexpected error: {e}")
        return jsonify({"error": "Внутренняя ошибка сервера"}), 500


@app.route("/api/health", methods=["GET"])
def health():
    return jsonify({"status": "ok", "service": "cazino-game-server"})


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

    try:
        conn = sqlite3.connect(DB_PATH)
        c = conn.cursor()
        c.execute(
            "INSERT INTO turnover (user_id, username, amount) VALUES (?, ?, ?)",
            (user_id, username, amount)
        )
        conn.commit()
        conn.close()
    except Exception as e:
        print(f"[add_turnover] error: {e}")
        return jsonify({"error": "Database error"}), 500
    return jsonify({"success": True})


@app.route("/api/leaderboard_turnover", methods=["GET"])
def leaderboard_turnover():
    """Возвращает топ-15 юзеров по сумме оборота."""
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
        conn.close()
        leaderboard = [{"username": row[0], "total": round(row[1], 2)} for row in rows]
        return jsonify(leaderboard)
    except Exception as e:
        print(f"[leaderboard_turnover] error: {e}")
        return jsonify([])


# ── Запуск фоновой задачи сброса лидерборда ───────────────────────────
def start_leaderboard_reset_worker():
    """Запускает фоновый поток для автоматического сброса лидерборда."""
    thread = threading.Thread(target=check_and_reset_leaderboard, daemon=True)
    thread.start()
    print("[Server] Фоновый поток сброса лидерборда запущен.")


start_leaderboard_reset_worker()


if __name__ == "__main__":
    port = int(os.environ.get("PORT", 8000))
    debug = os.environ.get("DEBUG", "false").lower() == "true"
    app.run(host="0.0.0.0", port=port, debug=debug)
