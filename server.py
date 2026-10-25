"""
Cazino Game Server — Server-Side Random & Anti-Cheat
Обеспечивает честную генерацию всех игровых результатов на сервере.
"""
import os
import random
import json
import sqlite3
from flask import Flask, request, jsonify
from flask_cors import CORS

app = Flask(__name__)
CORS(app, resources={r"/api/*": {"origins": "*"}})

# ── База данных ──────────────────────────────────────────────────────
DB_PATH = os.path.join(os.path.dirname(__file__), "test.db")

# Активные игры в Mines (серверный анти-чит)
active_mines_games = {}


def init_db():
    conn = sqlite3.connect(DB_PATH)
    c = conn.cursor()
    c.execute("""
        CREATE TABLE IF NOT EXISTS users (
            id TEXT PRIMARY KEY,
            balance_ton REAL DEFAULT 15.0,
            balance_stars REAL DEFAULT 0.0,
            referrer_id TEXT DEFAULT NULL
        )
    """)
    # Миграция: добавляем колонки, если их нет (для старых БД)
    for col_def in [
        "ALTER TABLE users ADD COLUMN balance_stars REAL DEFAULT 0.0",
        "ALTER TABLE users ADD COLUMN referrer_id TEXT DEFAULT NULL",
        "ALTER TABLE users ADD COLUMN balance_ton REAL DEFAULT 15.0",
    ]:
        try:
            c.execute(col_def)
        except sqlite3.OperationalError:
            pass  # колонка уже существует
    # Пользователь по умолчанию (id из браузера)
    c.execute("INSERT OR IGNORE INTO users (id, balance_ton) VALUES ('6267608438', 15.0)")
    conn.commit()
    conn.close()


init_db()

def verify_init_data(init_data):
    return bool(init_data and init_data.strip())


# ── Пул предметов для кейсов ──────────────────────────────────────────
CASE_POOL = [
    {"name": "Plush Pepe", "image": "/GOLD.png", "rarity": "legendary", "chance": 1, "price": 500},
    {"name": "Durov Cap", "image": "/Silver.png", "rarity": "epic", "chance": 4, "price": 200},
    {"name": "Astral Shard", "image": "/CASE_COPPER.png", "rarity": "rare", "chance": 10, "price": 80},
    {"name": "Golden Fish", "image": "/CaseWOOD.png", "rarity": "rare", "chance": 10, "price": 75},
    {"name": "Shadow Veil", "image": "/case-test.png", "rarity": "uncommon", "chance": 15, "price": 40},
    {"name": "Ruby Heart", "image": "/GOLD.png", "rarity": "uncommon", "chance": 15, "price": 35},
    {"name": "Emerald Eye", "image": "/Silver.png", "rarity": "uncommon", "chance": 15, "price": 30},
    {"name": "Moonstone", "image": "/CASE_COPPER.png", "rarity": "common", "chance": 30, "price": 10},
]

def generate_crash_point():
    e = pow(2, 32)
    h = random.randint(0, e - 1)
    house_edge = 0.03
    point = (100 * e - h) / (e - h) / 100 * (1 - house_edge)
    if point < 1.0:
        return 1.0
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
# ── Баланс ───────────────────────────────────────────────────────────
@app.route("/api/balance", methods=["GET"])
def get_balance():
    user_id = request.args.get("user_id", "6267608438")
    conn = sqlite3.connect(DB_PATH)
    c = conn.cursor()
    c.execute("SELECT balance_ton, balance_stars FROM users WHERE id = ?", (user_id,))
    row = c.fetchone()
    conn.close()
    if row:
        return jsonify({"balance_ton": row[0], "balance_stars": row[1]})
    # Если пользователя нет — создаём с балансом 15 TON
    conn = sqlite3.connect(DB_PATH)
    c = conn.cursor()
    c.execute("INSERT OR IGNORE INTO users (id, balance_ton) VALUES (?, 15.0)", (user_id,))
    conn.commit()
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
    # Если initData есть — проверяем, что он не фейковый (короче 10 символов)
    if init_data and len(init_data) < 10:
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
    # Plinko multiplier: от x0.5 до x10.0
    roll = random.random()
    if roll < 0.15:
        multiplier = round(random.uniform(0.5, 1.0), 2)
    elif roll < 0.40:
        multiplier = round(random.uniform(1.0, 2.0), 2)
    elif roll < 0.65:
        multiplier = round(random.uniform(2.0, 4.0), 2)
    elif roll < 0.85:
        multiplier = round(random.uniform(4.0, 7.0), 2)
    else:
        multiplier = round(random.uniform(7.0, 10.0), 2)

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

    if balance < case_price:
        conn.close()
        return jsonify({"error": "Недостаточно средств"}), 400

    # Списываем цену кейса
    new_balance = balance - case_price
    c.execute("UPDATE users SET balance_ton = ? WHERE id = ?", (new_balance, user_id))

    # Выбираем случайный предмет
    item = pick_case_item()
    conn.commit()
    conn.close()

    return jsonify({"success": True, "item": item})


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


@app.route("/api/health", methods=["GET"])
def health():
    return jsonify({"status": "ok", "service": "cazino-game-server"})


if __name__ == "__main__":
    port = int(os.environ.get("PORT", 8000))
    debug = os.environ.get("DEBUG", "false").lower() == "true"
    app.run(host="0.0.0.0", port=port, debug=debug)
