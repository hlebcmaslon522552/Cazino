"""
Cazino Game Server — Server-Side Random & Anti-Cheat
Обеспечивает честную генерацию всех игровых результатов на сервере.
"""
import os
import random
import json
import sqlite3
import sys
import threading
import time
import uuid
from datetime import datetime, timedelta
import hmac
import hashlib
import math
import urllib.parse
import bleach
import requests
from flask import Flask, request, jsonify
from flask_cors import CORS
from flask_socketio import SocketIO, emit, join_room

# Принудительный UTF-8 для stdout/stderr. При запуске с перенаправлением вывода
# в файл (start_server.bat, > server.log) Python 3.9 на Windows пишет в cp866,
# и русские сообщения в логе превращаются в "крокозябры".
for _stream in (sys.stdout, sys.stderr):
    try:
        _stream.reconfigure(encoding="utf-8", errors="replace")
    except Exception:
        pass

app = Flask(__name__, static_folder='dist', static_url_path='')

# ── CORS ────────────────────────────────────────────────────────────────
# flask-cors обрабатывает CORS-заголовки, включая preflight (OPTIONS).
# supports_credentials=True необходим для отправки X-Init-Data и кук.
CORS(app, resources={r"/api/*": {"origins": "*", "supports_credentials": True}})

# SocketIO — свой CORS (cors_allowed_origins="*" разрешает любые источники)
socketio = SocketIO(app, cors_allowed_origins="*")

# ── Fallback CORS-заголовки (на случай, если flask-cors не отработал) ──
@app.after_request
def _add_cors_and_log(response):
    origin = request.headers.get("Origin", "")
    print(
        f"REQUEST: {request.method} {request.path}"
        f" args={dict(request.args)}"
        f" origin={origin or '-'}",
        flush=True,
    )

    # Гарантированно добавляем CORS-заголовки к каждому ответу.
    # Если flask-cors уже добавил — перезаписываем тем же значением.
    response.headers["Access-Control-Allow-Origin"] = origin if origin else "*"
    response.headers["Access-Control-Allow-Credentials"] = "true"
    response.headers["Access-Control-Allow-Methods"] = "GET, POST, PUT, DELETE, OPTIONS"
    response.headers["Access-Control-Allow-Headers"] = (
        "Content-Type, Authorization, X-Init-Data, "
        "X-Internal-Secret, ngrok-skip-browser-warning"
    )
    response.headers["Access-Control-Max-Age"] = "86400"
    # Vary: Origin — подсказка кешу, что ответ зависит от Origin
    response.headers.add("Vary", "Origin")

    print(
        f"RESPONSE: {request.method} {request.path} -> {response.status_code}"
        f" origin={origin or '*'}",
        flush=True,
    )
    return response


# ── OPTIONS (preflight) — гарантированный ответ 200 для всех /api/* ──
# flask-cors должен обрабатывать preflight сам, но если SocketIO перехватил
# запрос до него — явный маршрут гарантирует 200 + CORS-заголовки из after_request.
@app.route("/api/<path:subpath>", methods=["OPTIONS"])
def _handle_preflight(subpath):
    return jsonify({"ok": True})


@app.errorhandler(404)
def handle_404(e):
    # Для путей, не начинающихся с /api/, отдаём index.html (React Router)
    if not request.path.startswith('/api/'):
        return app.send_static_file('index.html')
    # Для /api/* — JSON
    print(f"[404] Нет такого эндпоинта: {request.method} {request.path}", flush=True)
    return jsonify({
        "error": "Not found",
        "path": request.path,
        "method": request.method,
    }), 404


# ── PvP Rooms ─────────────────────────────────────────────────────────
PVP_ROOMS = {}
PVP_ROOMS_LOCK = threading.Lock()
# Таймаут ожидания соперника (сек). Держим чуть меньше клиентского таймера (15),
# чтобы "висящая" комната не досталась следующему игроку как фантомный матч.
PVP_WAIT_TIMEOUT = 12

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
CRASH_RATE = 0.2222           # 1x за 4.5 сек: multiplier = 1.0 + elapsed * CRASH_RATE
CRASH_PLAYERS = []            # ставки текущего раунда: [{ user_id, username, bet, sid }]
CRASH_LOCK = threading.Lock()

# ── Hockey Game State (глобальные раунды, как Crash) ────────────────────
HOCKEY_STATE = "waiting"       # 'waiting' | 'playing'
HOCKEY_TIMER = 15              # секунд до старта раунда
HOCKEY_PLAYERS = []            # ставки текущего раунда: [{ user_id, username, bet, sid }]
HOCKEY_LOCK = threading.Lock()
HOCKEY_START_TIME = 0.0

# Активные ставки в Хоккее: user_id -> bet (чтобы восстанавливать при реконнекте)
ACTIVE_HOCKEY_BETS = {}

# Комиссия казино: победитель получает 97.5% банка, 2.5% уходит казино
CASINO_COMMISSION_RATE = 0.025

FIELD_W = 500
FIELD_H = 300



# ── Leaderboard / Prizes Config ─────────────────────────────────────
# ── Daily Tasks Config ──────────────────────────────────────────────
DAILY_TASKS = [
    {
        "id": "daily_bet_5",
        "title": "Сделать 5 ставок (от 1 TON)",
        "goal": 5,
        "reward": 0.2,
        "type": "bet_count",
        "min_bet": 1.0
    },
    {
        "id": "daily_crash_win_5x",
        "title": "Выиграть в Краше x5 (ставка от 5 TON)",
        "goal": 1,
        "reward": 1.0,
        "type": "crash_win",
        "min_multiplier": 5.0,
        "min_bet": 5.0
    },
    {
        "id": "daily_pvp_win",
        "title": "Выиграть в PvP 3 раза (ставка от 2 TON)",
        "goal": 3,
        "reward": 0.5,
        "type": "pvp_win",
        "min_bet": 2.0
    },
    {
        "id": "daily_case_open",
        "title": "Открыть 3 кейса (любых)",
        "goal": 3,
        "reward": 0.3,
        "type": "case_open"
    }
]

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

ADMIN_ID = "6267608438"

# Канал для проверки подписки (бонусный кейс) — бот должен быть в нём админом
TG_SUBSCRIPTION_CHANNEL = os.environ.get("TG_SUBSCRIPTION_CHANNEL", "@Test_Erra")

# Базовый URL Telegram Bot API. Прямой доступ к api.telegram.org из этого
# окружения недоступен, поэтому идём через Cloudflare Worker-прокси
# (как в send_telegram_notification и withdraw_nft).
TG_API_BASE = os.environ.get("TG_API_BASE", "https://stars.gleb0256149.workers.dev")

# ── Внутренний API баланса (SECURITY) ─────────────────────────────────
# Начислять/списывать TON может ТОЛЬКО сервер: подтверждённый депозит (вебхук
# платёжной системы), выплата при выводе, результат игры. Клиент не должен
# уметь записывать баланс — поэтому клиентский /api/update_balance удалён,
# а внутренний /api/add_balance защищён общим секретом (как вебхук).
# Секрет задаётся ТОЛЬКО через переменную окружения BALANCE_API_SECRET.
# Если секрет не задан — эндпоинт отключён (fail closed): иначе любой,
# кто узнал URL, смог бы начислить себе сколько угодно TON.
BALANCE_API_SECRET = os.environ.get("BALANCE_API_SECRET", "").strip()
# Заголовок, в котором серверный клиент (вебхук платежей / воркер выплат)
# передаёт секрет. Именно заголовок, а не тело, чтобы ключ не попадал в логи.
BALANCE_SECRET_HEADER = "X-Internal-Secret"
# Предохранитель от опечаток: одна операция не может изменить баланс
# больше чем на этот лимит.
MAX_BALANCE_OPERATION = 1_000_000.0


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
            balance_stars REAL DEFAULT 0.0,
            referrer_id TEXT DEFAULT NULL
        )
    """)
    # Добавляем колонку referrer_id, если её нет (для уже существующих БД)
    try:
        c.execute("ALTER TABLE users ADD COLUMN referrer_id TEXT DEFAULT NULL")
    except sqlite3.OperationalError:
        pass  # колонка уже существует

    # 2. Таблица инвентаря
    c.execute("""
        CREATE TABLE IF NOT EXISTS inventory (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id TEXT,
            item_id TEXT,
            name TEXT,
            image TEXT,
            floor REAL,
            status TEXT DEFAULT 'available',
            timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    """)
    # Добавляем колонку status, если её нет (для уже существующих БД)
    try:
        c.execute("ALTER TABLE inventory ADD COLUMN status TEXT DEFAULT 'available'")
    except sqlite3.OperationalError:
        pass  # колонка уже существует

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

    # 3.1. Таблица истории ставок (беты и выигрыши пользователя)
    c.execute("""
        CREATE TABLE IF NOT EXISTS bet_history (
            id INTEGER PRIMARY KEY,
            user_id TEXT,
            game_type TEXT,
            bet_type TEXT,
            amount REAL,
            item_name TEXT,
            timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    """)
    # Доп. поле kind ('bet' | 'win') — расширение схемы для статистики max_win
    try:
        c.execute("ALTER TABLE bet_history ADD COLUMN kind TEXT DEFAULT 'bet'")
    except sqlite3.OperationalError:
        pass  # колонка уже существует

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

    # 7. Таблица ежедневных заданий
    c.execute("""
        CREATE TABLE IF NOT EXISTS user_tasks (
            user_id TEXT,
            task_id TEXT,
            progress INTEGER DEFAULT 0,
            claimed BOOLEAN DEFAULT 0,
            last_reset TEXT,
            PRIMARY KEY (user_id, task_id)
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

def sanitize_turnover():
    """Сброс сломанных данных оборота при старте сервера.

    Проверяет всех пользователей в таблице turnover (оборот = SUM(amount) по
    user_id). Если суммарный оборот пользователя превышает 1 000 000 TON или
    встречаются записи с аномальными значениями (формат вида 9.9e+22 от
    накрутки) — обнуляем его оборот (удаляем его записи оборота).
    """
    if not os.path.exists(DB_PATH):
        return
    conn = None
    try:
        conn = sqlite3.connect(DB_PATH)
        c = conn.cursor()
        user_ids = [row[0] for row in c.execute("SELECT DISTINCT user_id FROM turnover")]
        for uid in user_ids:
            total, max_amount = c.execute(
                "SELECT COALESCE(SUM(amount), 0), COALESCE(MAX(ABS(amount)), 0) FROM turnover WHERE user_id = ?",
                (uid,)
            ).fetchone()
            # Аномалия: огромная сумма (> 1 000 000) или экспоненциальный формат (e+22)
            if total > 1_000_000 or max_amount > 1_000_000 or "e+" in repr(max_amount).lower():
                c.execute("DELETE FROM turnover WHERE user_id = ?", (uid,))
                print(f"[sanitize_turnover] Сброшен оборот пользователя {uid}: total={total}, max={max_amount}")
        conn.commit()
        print("[sanitize_turnover] Проверка оборота завершена.")
    except Exception as e:
        print(f"[sanitize_turnover] Ошибка: {e}")
    finally:
        if conn:
            conn.close()


sanitize_turnover()


# ── Daily Tasks Helpers ────────────────────────────────────────────

def reset_user_tasks_if_new_day(user_id):
    """Сбрасывает progress и claimed для всех задач пользователя, если наступил новый день."""
    today = datetime.utcnow().strftime("%Y-%m-%d")
    conn = None
    try:
        conn = sqlite3.connect(DB_PATH)
        c = conn.cursor()
        # Проверяем last_reset для любой задачи пользователя
        c.execute("SELECT last_reset FROM user_tasks WHERE user_id = ? LIMIT 1", (user_id,))
        row = c.fetchone()
        last_reset = row[0] if row else None
        if last_reset is None or last_reset != today:
            # Новый день — сбрасываем все задачи пользователя
            for task in DAILY_TASKS:
                c.execute(
                    "INSERT OR REPLACE INTO user_tasks (user_id, task_id, progress, claimed, last_reset) VALUES (?, ?, 0, 0, ?)",
                    (user_id, task["id"], today)
                )
            conn.commit()
            print(f"[DailyTasks] Сброс задач для user={user_id} на дату {today}", flush=True)
        else:
            # Убеждаемся, что все задачи существуют (для новых добавленных задач)
            for task in DAILY_TASKS:
                c.execute(
                    "INSERT OR IGNORE INTO user_tasks (user_id, task_id, progress, claimed, last_reset) VALUES (?, ?, 0, 0, ?)",
                    (user_id, task["id"], today)
                )
            conn.commit()
    except Exception as e:
        print(f"[DailyTasks] reset_user_tasks_if_new_day error: {e}", flush=True)
    finally:
        if conn:
            conn.close()
    return today

def update_task_progress(user_id, task_id, increment=1):
    """Увеличивает прогресс задачи (если не забрана и не новый день)."""
    today = reset_user_tasks_if_new_day(user_id)
    conn = None
    try:
        conn = sqlite3.connect(DB_PATH)
        c = conn.cursor()
        # Убеждаемся, что задача существует
        c.execute(
            "INSERT OR IGNORE INTO user_tasks (user_id, task_id, progress, claimed, last_reset) VALUES (?, ?, 0, 0, ?)",
            (user_id, task_id, today)
        )
        # Увеличиваем progress только если не claimed
        c.execute(
            "UPDATE user_tasks SET progress = progress + ? WHERE user_id = ? AND task_id = ? AND claimed = 0",
            (increment, user_id, task_id)
        )
        conn.commit()
        print(f"[DailyTasks] Обновлён прогресс user={user_id} task={task_id} +{increment}", flush=True)
    except Exception as e:
        print(f"[DailyTasks] update_task_progress error: {e}", flush=True)
    finally:
        if conn:
            conn.close()


def verify_init_data(init_data):
    """Проверяет подпись Telegram initData с использованием HMAC-SHA256.
    
    Алгоритм:
    1. Разбираем строку запроса
    2. Извлекаем hash
    3. Удаляем hash из набора
    4. Сортируем оставшиеся поля
    5. Собираем data_check_string
    6. Вычисляем secret_key = HMAC-SHA256('WebAppData', bot_token)
    7. Вычисляем signature = HMAC-SHA256(secret_key, data_check_string)
    8. Сравниваем signature с hash (constant-time)
    """
    if not init_data or not init_data.strip():
        return False
    
    try:
        # Разбираем строку запроса (query_id=...&hash=...)
        parsed = urllib.parse.parse_qs(init_data, keep_blank_values=True)
        
        # Извлекаем hash
        hash_value = parsed.pop('hash', None)
        if not hash_value or not hash_value[0]:
            return False
        hash_value = hash_value[0]
        
        # Удаляем дублирующиеся ключи — берём последнее значение
        data_check_pairs = []
        for key, values in parsed.items():
            # Берём последнее значение для каждого ключа
            data_check_pairs.append((key, values[-1]))
        
        # Сортируем по ключу
        data_check_pairs.sort(key=lambda x: x[0])
        
        # Собираем data_check_string
        data_check_string = '\n'.join(f'{k}={v}' for k, v in data_check_pairs)
        
        # Вычисляем secret_key = HMAC-SHA256('WebAppData', bot_token)
        secret_key = hmac.new(
            b'WebAppData',
            TG_BOT_TOKEN.encode('utf-8'),
            hashlib.sha256
        ).digest()
        
        # Вычисляем подпись
        signature = hmac.new(
            secret_key,
            data_check_string.encode('utf-8'),
            hashlib.sha256
        ).hexdigest()
        
        return hmac.compare_digest(signature, hash_value)
    except Exception as e:
        print(f"[verify_init_data] error: {e}", flush=True)
        return False


# ── Пулы предметов для кейсов (по ID кейса) ───────────────────────────
CASE_WOOD_POOL = [
    {"name": "0.1 TON", "image": "/TON.png", "type": "ton", "rarity": "common", "chance": 35, "price": 0.1},
    {"name": "0.2 TON", "image": "/TON.png", "type": "ton", "rarity": "common", "chance": 25, "price": 0.2},
    {"name": "0.3 TON", "image": "/TON.png", "type": "ton", "rarity": "common", "chance": 15, "price": 0.3},
    {"name": "0.5 TON", "image": "/TON.png", "type": "ton", "rarity": "uncommon", "chance": 10, "price": 0.5},
    {"name": "0.8 TON", "image": "/TON.png", "type": "ton", "rarity": "uncommon", "chance": 5, "price": 0.8},
    {"name": "Big Year", "image": "/nft_images/big_year.webp", "rarity": "uncommon", "chance": 4, "price": 5.0},
    {"name": "Candy Cane", "image": "/nft_images/candy_cane.webp", "rarity": "rare", "chance": 3, "price": 5.0},
    {"name": "Happy Brownie", "image": "/nft_images/happy_brownie.webp", "rarity": "rare", "chance": 1.5, "price": 5.0},
    {"name": "Fresh Socks", "image": "/nft_images/fresh_socks.webp", "rarity": "rare", "chance": 1, "price": 6.0},
    {"name": "Bow Tie", "image": "/nft_images/bow_tie.webp", "rarity": "epic", "chance": 0.5, "price": 7.0},
]

CASE_COPPER_POOL = [
    {"name": "1.0 TON", "image": "/TON.png", "type": "ton", "rarity": "common", "chance": 30, "price": 1.0},
    {"name": "2.0 TON", "image": "/TON.png", "type": "ton", "rarity": "common", "chance": 20, "price": 2.0},
    {"name": "3.0 TON", "image": "/TON.png", "type": "ton", "rarity": "common", "chance": 15, "price": 3.0},
    {"name": "5.0 TON", "image": "/TON.png", "type": "ton", "rarity": "uncommon", "chance": 10, "price": 5.0},
    {"name": "7.0 TON", "image": "/TON.png", "type": "ton", "rarity": "uncommon", "chance": 5, "price": 7.0},
    {"name": "Mirage Lamps", "image": "/nft_images/mirage_lamp.webp", "rarity": "uncommon", "chance": 5, "price": 5.0},
    {"name": "Love Potion", "image": "/nft_images/love_potion.webp", "rarity": "rare", "chance": 4, "price": 17.0},
    {"name": "Jingle Bells", "image": "/nft_images/jingle_bells.webp", "rarity": "rare", "chance": 4, "price": 11.0},
    {"name": "Valentine Box", "image": "/nft_images/valentine_box.webp", "rarity": "epic", "chance": 3, "price": 14.0},
    {"name": "Signet Ring", "image": "/nft_images/signet_ring.webp", "rarity": "epic", "chance": 2, "price": 38.0},
    {"name": "Gem Signet", "image": "/nft_images/gem_signet.webp", "rarity": "epic", "chance": 2, "price": 73.0},
    {"name": "Swiss Watch", "image": "/nft_images/swiss_watch.webp", "rarity": "legendary", "chance": 0.1, "price": 75.0},
]

CASE_SILVER_POOL = [
    {"name": "5.0 TON", "image": "/TON.png", "type": "ton", "rarity": "common", "chance": 30, "price": 5.0},
    {"name": "10.0 TON", "image": "/TON.png", "type": "ton", "rarity": "common", "chance": 20, "price": 10.0},
    {"name": "15.0 TON", "image": "/TON.png", "type": "ton", "rarity": "common", "chance": 15, "price": 15.0},
    {"name": "25.0 TON", "image": "/TON.png", "type": "ton", "rarity": "uncommon", "chance": 10, "price": 25.0},
    {"name": "40.0 TON", "image": "/TON.png", "type": "ton", "rarity": "uncommon", "chance": 5, "price": 40.0},
    {"name": "Neko Helmet", "image": "/nft_images/neko_helmet.webp", "rarity": "uncommon", "chance": 4, "price": 45.0},
    {"name": "Love Candle", "image": "/nft_images/love_candle.webp", "rarity": "rare", "chance": 3, "price": 13.0},
    {"name": "Toy Bear", "image": "/nft_images/toy_bear.webp", "rarity": "rare", "chance": 3, "price": 39.0},
    {"name": "Genie Lamp", "image": "/nft_images/genie_lamp.webp", "rarity": "epic", "chance": 2, "price": 40.0},
    {"name": "Magic Potion", "image": "/nft_images/magic_potion.webp", "rarity": "epic", "chance": 1.5, "price": 75.0},
    {"name": "Artisan Brick", "image": "/nft_images/artisan_brick.webp", "rarity": "epic", "chance": 1, "price": 83.0},
    {"name": "Mini Oscar", "image": "/nft_images/mini_oscar.webp", "rarity": "legendary", "chance": 0.5, "price": 115.0},
    {"name": "Mighty Arm", "image": "/nft_images/mighty_arm.webp", "rarity": "mythic", "chance": 0.1, "price": 150.0},
]

CASE_GOLD_POOL = [
    {"name": "20.0 TON", "image": "/TON.png", "type": "ton", "rarity": "common", "chance": 25, "price": 20.0},
    {"name": "50.0 TON", "image": "/TON.png", "type": "ton", "rarity": "common", "chance": 20, "price": 50.0},
    {"name": "80.0 TON", "image": "/TON.png", "type": "ton", "rarity": "common", "chance": 15, "price": 80.0},
    {"name": "120.0 TON", "image": "/TON.png", "type": "ton", "rarity": "uncommon", "chance": 10, "price": 120.0},
    {"name": "180.0 TON", "image": "/TON.png", "type": "ton", "rarity": "uncommon", "chance": 5, "price": 180.0},
    {"name": "Perfume Bottle", "image": "/nft_images/perfume_bottle.webp", "rarity": "uncommon", "chance": 5, "price": 95.0},
    {"name": "Mighty Arm", "image": "/nft_images/mighty_arm.webp", "rarity": "rare", "chance": 4, "price": 150.0},
    {"name": "Trapped Heart", "image": "/nft_images/trapped_heart.webp", "rarity": "rare", "chance": 4, "price": 18.0},
    {"name": "Durovs Cap", "image": "/nft_images/durovs_cap.webp", "rarity": "epic", "chance": 3, "price": 463.0},
    {"name": "Precious Peach", "image": "/nft_images/precious_peach.webp", "rarity": "epic", "chance": 2, "price": 295.0},
    {"name": "Heroic Helmet", "image": "/nft_images/heroic_helmet.webp", "rarity": "epic", "chance": 2, "price": 231.0},
    {"name": "Loot Bag", "image": "/nft_images/loot_bag.webp", "rarity": "legendary", "chance": 0.9, "price": 150.0},
    {"name": "Scared Cat", "image": "/nft_images/scared_cat.webp", "rarity": "legendary", "chance": 0.08, "price": 299.0},
    {"name": "Resistance Dogs", "image": "/nft_images/resistance_dog.webp", "rarity": "mythic", "chance": 0.015, "price": 569.0},
    {"name": "Plush Pepe", "image": "/nft_images/plush_pepe.webp", "rarity": "mythic", "chance": 0.005, "price": 7950.0},
]

FREE_CASE_POOL = [
    {"name": "0.01 TON", "image": "/TON.png", "rarity": "common", "type": "ton", "chance": 55, "price": 0.01},
    {"name": "0.1 TON", "image": "/TON.png", "rarity": "common", "type": "ton", "chance": 20, "price": 0.1},
    {"name": "0.2 TON", "image": "/TON.png", "rarity": "common", "type": "ton", "chance": 10, "price": 0.2},
    {"name": "0.3 TON", "image": "/TON.png", "rarity": "common", "type": "ton", "chance": 7, "price": 0.3},
    {"name": "0.5 TON", "image": "/TON.png", "rarity": "common", "type": "ton", "chance": 5, "price": 0.5},
    {"name": "1 TON", "image": "/TON.png", "rarity": "common", "type": "ton", "chance": 2.99, "price": 1},
    {"name": "Big Year", "image": "/nft_images/big_year.webp", "rarity": "legendary", "type": "item", "chance": 0.01, "price": 3.89},
]

# Соответствие ID кейса (фронтенд) и пула предметов
CASE_POOLS = {
    "case_wood": CASE_WOOD_POOL,
    "case_copper": CASE_COPPER_POOL,
    "case_silver": CASE_SILVER_POOL,
    "case_gold": CASE_GOLD_POOL,
    "case_free": FREE_CASE_POOL,
}

# Минимальная точка краша: сервер гарантирует, что раунд не крашится
# мгновенно (1.00/1.01x) — график всегда успевает отрисоваться.
MIN_CRASH_POINT = 1.05

def generate_crash_point():
    # 4% — мгновенный краш (1.00x)
    if random.random() < 0.04:
        print(f"[Crash] Generated: 1.00x (instant crash, 4% roll)")
        return 1.00

    # Остальные 96% — формула 1/(1-R), где R = random.random()
    r = random.random()               # 0.0 <= r < 1.0
    crash = 1.0 / (1.0 - r)          # диапазон [1.0, +inf)

    # Жёсткий потолок 1000.0x
    if crash > 1000.0:
        crash = 1000.0

    crash = round(crash, 2)
    print(f"[Crash] Generated: {crash}x (1/(1-{r:.4f}))")
    return crash


# ── Crash Game Loop (фоновый поток) ───────────────────────────────────────
def crash_game_loop():
    """Фоновый поток: синхронный цикл раунда Crash.
    Вся логика таймера полностью на сервере — клиент только рисует анимацию.
    Раунд длится до достижения crash_point при фиксированной скорости 0.2222 x/с."""
    global CRASH_STATE, CRASH_TIMER, CRASH_POINT, CRASH_START_TIME, CRASH_RATE, CRASH_PLAYERS
    print("[CrashLoop] Поток запущен.")
    while True:
        try:
            # ── 1. Состояние ожидания (15 секунд) ──
            CRASH_STATE = "waiting"
            CRASH_TIMER = 15
            for i in range(15, 0, -1):
                CRASH_TIMER = i
                socketio.emit('crash_timer', {'timer': i})
                socketio.sleep(1)

            # ── 2. Старт раунда ──
            with CRASH_LOCK:
                CRASH_POINT = generate_crash_point()
                CRASH_START_TIME = time.time() * 1000   # миллисекунды для JS-клиента
                CRASH_RATE = 0.2222                     # 1x за 4.5 сек
                CRASH_STATE = "flying"
                # НЕ очищаем CRASH_PLAYERS здесь — список очищается только после краша,
                # чтобы таблица игроков не пропадала во время летящего раунда.

            print(f"[SERVER] START. crash_point={CRASH_POINT}, start_time={CRASH_START_TIME}, rate={CRASH_RATE}")
            print(f"[CrashLoop] Раунд стартовал! Краш-поинт: {CRASH_POINT}x, rate: {CRASH_RATE}")
            socketio.emit('crash_started', {
                'crash_point': CRASH_POINT,
                'start_time': CRASH_START_TIME,
                'rate': CRASH_RATE,
                'time_to_crash': round((CRASH_POINT - 1.0) / CRASH_RATE, 2),
            })

            # ── 3. Ожидание краша — тики каждые ~0.01x ──
            # Время до краша = (crash_point - 1.0) / rate (секунд)
            crash_duration_ms = (CRASH_POINT - 1.0) / CRASH_RATE * 1000
            elapsed = 0.0
            last_tick = 0.0
            while elapsed < crash_duration_ms:
                socketio.sleep(0.05)          # ~20 тиков/с, ~0.0111x за тик
                with CRASH_LOCK:
                    elapsed = (time.time() * 1000) - CRASH_START_TIME
                    current_multiplier = 1.0 + (elapsed / 1000) * CRASH_RATE
                tick_val = round(current_multiplier, 2)
                # Отправляем только когда множитель перешагнул очередные 0.01x
                if tick_val > last_tick:
                    last_tick = tick_val
                    socketio.emit('crash_tick', {'multiplier': tick_val})

                # ── Авто-сбор (серверный) ──
                auto_cashed_any = False
                with CRASH_LOCK:
                    for p in CRASH_PLAYERS:
                        if (p.get('auto_cashout') is not None
                                and not p.get('cashed_out', False)
                                and tick_val >= p['auto_cashout']):
                            p['cashed_out'] = True
                            p['multiplier'] = p['auto_cashout']
                            win_amount = p['bet'] * p['auto_cashout']
                            # Начисляем выигрыш в БД
                            try:
                                conn2 = sqlite3.connect(DB_PATH)
                                c2 = conn2.cursor()
                                c2.execute(
                                    "UPDATE users SET balance_ton = COALESCE(balance_ton, 0) + ? WHERE id = ?",
                                    (win_amount, p['user_id'])
                                )
                                conn2.commit()
                                conn2.close()
                            except Exception as db_err:
                                print(f"[AutoCashout] DB error: {db_err}")
                            print(f"[AutoCashout] Игрок {p['user_id']} ({p['username']}) забрал на {p['auto_cashout']}x, выигрыш {win_amount:.2f} TON")
                            auto_cashed_any = True
                if auto_cashed_any:
                    with CRASH_LOCK:
                        ac_players_snapshot = [
                            {
                                'user_id': p['user_id'],
                                'username': p['username'],
                                'bet': p['bet'],
                                'multiplier': p.get('multiplier'),
                                'cashed_out': p.get('cashed_out', False),
                            }
                            for p in CRASH_PLAYERS
                        ]
                    socketio.emit('crash_players_update', {'players': ac_players_snapshot})

            # ── 4. Краш ──
            with CRASH_LOCK:
                CRASH_STATE = "waiting"
                CRASH_TIMER = 15
                final_crash_point = CRASH_POINT
                CRASH_POINT = 1.00
                # Рассылаем финальный список игроков перед очисткой
                final_players = [
                    {
                        'user_id': p['user_id'],
                        'username': p['username'],
                        'bet': p['bet'],
                        'multiplier': p.get('multiplier'),
                        'cashed_out': p.get('cashed_out', False),
                    }
                    for p in CRASH_PLAYERS
                ]
                CRASH_PLAYERS = []

            if final_players:
                socketio.emit('crash_players_update', {'players': final_players})

            print(f"[CrashLoop] КРАШ! {final_crash_point}x")
            print(f"[SERVER] END. Sending crash_ended with crash_point={final_crash_point}")
            # Отправляем crash_ended всем клиентам (emit вне контекста запроса уже
            # транслируется всем подключённым клиентам, broadcast=True не нужен)
            socketio.emit('crash_ended', {'crash_point': final_crash_point})
            print(f"[CrashLoop] Раунд завершён. RUG PULL (краш-поинт: {final_crash_point}x).")

            # ── 5. Пауза для отображения RUG PULL ──
            print(f"[CrashLoop] Ожидание 3 сек перед новым раундом...")
            socketio.sleep(3)

        except Exception as e:
            print(f"[CrashLoop] Ошибка: {e}")
            socketio.sleep(1)





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
    # Проверка initData (если передан заголовок X-Init-Data)
    init_data_header = request.headers.get("X-Init-Data", "")
    if init_data_header and not verify_init_data(init_data_header):
        return jsonify({"error": "Forbidden: invalid initData"}), 403

    user_id = request.args.get("user_id", "6267608438")
    print(f"REQUEST: /api/balance user_id={user_id}", flush=True)

    # ── Проверка/сброс ежедневных заданий при входе ──
    try:
        reset_user_tasks_if_new_day(user_id)
    except Exception as e:
        print(f"[get_balance] reset tasks error: {e}", flush=True)

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


# ── Daily Tasks API ────────────────────────────────────────────────

@app.route("/api/tasks", methods=["GET"])
def get_tasks():
    """Возвращает список заданий с прогрессом и флагом claimed для пользователя."""
    user_id = request.args.get("user_id", "6267608438")

    # Проверка/сброс нового дня
    try:
        reset_user_tasks_if_new_day(user_id)
    except Exception as e:
        print(f"[get_tasks] reset error: {e}", flush=True)

    tasks_response = []
    conn = None
    try:
        conn = sqlite3.connect(DB_PATH)
        c = conn.cursor()
        for task in DAILY_TASKS:
            c.execute(
                "SELECT progress, claimed, last_reset FROM user_tasks WHERE user_id = ? AND task_id = ?",
                (user_id, task["id"])
            )
            row = c.fetchone()
            progress = row[0] if row else 0
            claimed = bool(row[1]) if row else False
            tasks_response.append({
                "id": task["id"],
                "title": task["title"],
                "goal": task["goal"],
                "reward": task["reward"],
                "progress": progress,
                "claimed": claimed,
            })
    except Exception as e:
        print(f"[get_tasks] error: {e}", flush=True)
        return jsonify({"error": "Internal server error"}), 500
    finally:
        if conn:
            conn.close()

    return jsonify({"tasks": tasks_response})


@app.route("/api/tasks/claim", methods=["POST"])
def claim_task_reward():
    """Принимает { user_id, task_id }, проверяет условие и начисляет награду."""
    data = request.get_json(force=True, silent=True)
    if not data:
        return jsonify({"error": "Invalid JSON body"}), 400

    user_id = str(data.get("user_id", ""))
    task_id = str(data.get("task_id", ""))

    if not user_id or not task_id:
        return jsonify({"error": "user_id and task_id are required"}), 400

    # Проверяем, что task_id существует
    task_config = None
    for t in DAILY_TASKS:
        if t["id"] == task_id:
            task_config = t
            break
    if not task_config:
        return jsonify({"error": f"Unknown task_id: {task_id}"}), 400

    # Проверка/сброс нового дня
    try:
        reset_user_tasks_if_new_day(user_id)
    except Exception as e:
        print(f"[claim_task] reset error: {e}", flush=True)

    conn = None
    try:
        conn = sqlite3.connect(DB_PATH)
        c = conn.cursor()

        # Читаем текущий прогресс
        c.execute(
            "SELECT progress, claimed FROM user_tasks WHERE user_id = ? AND task_id = ?",
            (user_id, task_id)
        )
        row = c.fetchone()
        if not row:
            return jsonify({"error": "Task not found for user"}), 404

        progress = row[0]
        claimed = bool(row[1])

        if claimed:
            return jsonify({"error": "Reward already claimed"}), 400

        if progress < task_config["goal"]:
            return jsonify({"error": "Task not completed yet"}), 400

        # Начисляем награду
        reward = task_config["reward"]
        c.execute(
            "UPDATE users SET balance_ton = COALESCE(balance_ton, 0) + ? WHERE id = ?",
            (reward, user_id)
        )
        # Помечаем как забранное
        c.execute(
            "UPDATE user_tasks SET claimed = 1 WHERE user_id = ? AND task_id = ?",
            (user_id, task_id)
        )
        conn.commit()

        # Получаем новый баланс
        c.execute("SELECT balance_ton FROM users WHERE id = ?", (user_id,))
        new_balance = round(c.fetchone()[0], 4)

        print(f"[DailyTasks] Награда выдана user={user_id} task={task_id} reward={reward} TON", flush=True)

        return jsonify({
            "success": True,
            "reward": reward,
            "balance_ton": new_balance,
        })
    except Exception as e:
        print(f"[claim_task] error: {e}", flush=True)
        return jsonify({"error": "Internal server error"}), 500
    finally:
        if conn:
            conn.close()


# ── Referral: установить реферера ─────────────────────────────────────
@app.route("/api/set_referrer", methods=["POST"])
def set_referrer():
    """Устанавливает referrer_id для нового пользователя, пришедшего по реферальной ссылке."""
    data = request.get_json(force=True, silent=True)
    if not data:
        return jsonify({"error": "Invalid JSON body"}), 400
    user_id = str(data.get("user_id", "unknown"))
    referrer_id = str(data.get("referrer_id", ""))
    if not user_id or user_id == "unknown" or not referrer_id:
        return jsonify({"error": "user_id and referrer_id are required"}), 400
    if user_id == referrer_id:
        return jsonify({"error": "Нельзя указывать самого себя"}), 400
    conn = None
    try:
        conn = sqlite3.connect(DB_PATH)
        c = conn.cursor()
        # Проверяем, что referrer_id существует в БД
        c.execute("SELECT id FROM users WHERE id = ?", (referrer_id,))
        if not c.fetchone():
            return jsonify({"error": "Реферер не найден"}), 404

        # Создаём пользователя, если его нет, и устанавливаем referrer_id
        c.execute(
            "INSERT INTO users (id, balance_ton, referrer_id) VALUES (?, 15.0, ?) "
            "ON CONFLICT(id) DO UPDATE SET referrer_id = COALESCE(referrer_id, ?)",
            (user_id, referrer_id, referrer_id)
        )
        conn.commit()

        # Проверяем, что referrer_id реально установился
        c.execute("SELECT referrer_id FROM users WHERE id = ?", (user_id,))
        row = c.fetchone()
        if not row or row[0] != referrer_id:
            return jsonify({"error": "Реферер уже установлен"}), 400

        return jsonify({"success": True, "message": f"Реферер {referrer_id} привязан к {user_id}"})
    except Exception as e:
        print(f"[set_referrer] error: {e}")
        return jsonify({"error": "Internal server error"}), 500
    finally:
        if conn:
            conn.close()


# ── Referral: статистика ──────────────────────────────────────────────
@app.route("/api/referral_stats", methods=["GET"])
def referral_stats():
    """Возвращает количество приглашённых и заработанную сумму для user_id."""
    user_id = request.args.get("user_id", "")
    if not user_id:
        return jsonify({"error": "user_id is required"}), 400
    conn = None
    try:
        conn = sqlite3.connect(DB_PATH)
        c = conn.cursor()

        # Количество приглашённых
        c.execute("SELECT COUNT(*) FROM users WHERE referrer_id = ?", (user_id,))
        invited = c.fetchone()[0]

        # Сумма 5% от депозитов приглашённых пользователей
        # Ищем всех, кого пригласил этот пользователь
        c.execute("""
            SELECT COALESCE(SUM(d.amount * 0.05), 0.0)
            FROM deposits d
            JOIN users u ON u.id = d.user_id
            WHERE u.referrer_id = ?
        """, (user_id,))
        earned = round(c.fetchone()[0], 4)

        return jsonify({"invited": invited, "earned": earned})
    except Exception as e:
        print(f"[referral_stats] error: {e}")
        return jsonify({"error": "Internal server error"}), 500
    finally:
        if conn:
            conn.close()


@app.route("/api/add_balance", methods=["POST"])
def add_balance():
    """
    ВНУТРЕННИЙ эндпоинт изменения баланса (не для клиента!).

    Вызывается только серверными компонентами: вебхук подтверждения депозита,
    воркер выплат при выводе и т.п. Защищён секретом BALANCE_API_SECRET,
    который передаётся в заголовке X-Internal-Secret (аналог вебхука).

    Тело запроса: { "user_id": "...", "amount": 10.5, "reason": "deposit" }
        amount — ДЕЛЬТА (сумма к добавлению, может быть отрицательной для
        списания), НЕ итоговый баланс. Итоговый баланс всегда считает сервер.

    SECURITY: публичный клиентский POST /api/update_balance, принимавший
    абсолютный баланс от клиента, ПОЛНОСТЬЮ УДАЛЁН — любой мог «накрутить»
    себе миллион TON. Теперь клиент не способен менять баланс напрямую.
    """
    # Fail closed: если владелец не задал секрет, эндпоинт не работает вообще.
    if not BALANCE_API_SECRET:
        print("[add_balance] BALANCE_API_SECRET не задан — эндпоинт отключён", flush=True)
        return jsonify({"error": "Balance API is disabled"}), 503

    provided_secret = request.headers.get(BALANCE_SECRET_HEADER, "")
    if not hmac.compare_digest(provided_secret, BALANCE_API_SECRET):
        print("[add_balance] ОТКАЗ: неверный/отсутствующий X-Internal-Secret", flush=True)
        return jsonify({"error": "Forbidden"}), 403

    data = request.get_json(force=True, silent=True)
    if not data:
        return jsonify({"error": "Invalid JSON body"}), 400

    user_id = str(data.get("user_id", "")).strip()
    if not user_id or user_id == "unknown":
        return jsonify({"error": "user_id is required"}), 400

    try:
        amount = float(data.get("amount", 0))
    except (TypeError, ValueError):
        return jsonify({"error": "amount must be a number"}), 400

    if not math.isfinite(amount) or amount == 0:
        return jsonify({"error": "amount must be a non-zero finite number"}), 400
    if abs(amount) > MAX_BALANCE_OPERATION:
        return jsonify({"error": f"amount exceeds limit of {MAX_BALANCE_OPERATION}"}), 400

    amount = round(amount, 4)
    reason = str(data.get("reason", "deposit")).strip().lower() or "deposit"

    conn = None
    try:
        conn = sqlite3.connect(DB_PATH)
        c = conn.cursor()

        # Создаём пользователя с дефолтным балансом, если его ещё нет
        c.execute("INSERT OR IGNORE INTO users (id) VALUES (?)", (user_id,))

        # Баланс меняем ДЕЛЬТОЙ прямо в БД — итог считает сервер, а не клиент
        c.execute(
            "UPDATE users SET balance_ton = COALESCE(balance_ton, 0) + ? WHERE id = ?",
            (amount, user_id),
        )

        c.execute("SELECT balance_ton FROM users WHERE id = ?", (user_id,))
        new_balance = round(c.fetchone()[0], 4)

        # Не даём уйти в минус при списании
        if new_balance < 0:
            conn.rollback()
            print(f"[add_balance] ОТКЛОНЕНО: недостаточно средств user={user_id} amount={amount}", flush=True)
            return jsonify({"error": "Insufficient balance"}), 400

        # Учёт депозита и реферальные 5% (только для пополнений)
        if reason == "deposit" and amount > 0:
            c.execute(
                "INSERT INTO deposits (user_id, amount) VALUES (?, ?)",
                (user_id, amount),
            )
            c.execute("SELECT referrer_id FROM users WHERE id = ?", (user_id,))
            user_row = c.fetchone()
            if user_row and user_row[0]:
                referrer_id = user_row[0]
                referral_bonus = round(amount * 0.05, 4)
                if referral_bonus > 0:
                    c.execute(
                        "UPDATE users SET balance_ton = COALESCE(balance_ton, 0) + ? WHERE id = ?",
                        (referral_bonus, referrer_id),
                    )
                    print(f"[add_balance] referral: user {user_id} deposited {amount}, "
                          f"referrer {referrer_id} earned {referral_bonus} TON (5%)", flush=True)

        conn.commit()
        print(f"[add_balance] OK user={user_id} amount={amount:+.4f} reason={reason} -> balance={new_balance}", flush=True)
        return jsonify({
            "success": True,
            "user_id": user_id,
            "amount": amount,
            "balance_ton": new_balance,
        })
    except Exception as e:
        print(f"[add_balance] error: {e}", flush=True)
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
        target_name = bleach.clean(str(data.get("target_name", "")).strip(), tags=[], strip=True)
        target_image = str(data.get("target_image", "")).strip()
        if start_price <= 0 or end_price <= 0:
            return jsonify({"error": "start_price and end_price must be > 0"}), 400
        if end_price <= start_price:
            return jsonify({"error": "Цель должна быть дороже начальной NFT"}), 400
        if not target_name:
            return jsonify({"error": "target_name is required"}), 400

        # Шанс успеха — нормирован к диапазону 0..1:
        #   (start_price / end_price), потолок 0.75 (75%).
        chance = min(start_price / end_price, 0.75)

        # Жёсткая проверка диапазона: 0 <= chance <= 1.
        if not (0.0 <= chance <= 1.0):
            return jsonify({"error": "chance is out of range"}), 400

        # Единственный источник правды — сервер.
        # success = random.random() < chance  (именно '<', никогда '>').
        success = random.random() < chance

        # Предмет цели. ⚠ Серверная валидация:
        # NFT зачисляется в инвентарь ТОЛЬКО при success == True.
        # Клиенту не доверяем — фронт больше НЕ вызывает /api/inventory/add
        # для апгрейда (там нет проверки success), иначе при проигрыше
        # игрок мог бы «выдать» себе предмет.
        item = None
        if success:
            conn = None
            try:
                conn = sqlite3.connect(DB_PATH)
                c = conn.cursor()
                item_id = str(uuid.uuid4())
                c.execute(
                    "INSERT INTO inventory (user_id, item_id, name, image, floor) VALUES (?, ?, ?, ?, ?)",
                    (user_id, item_id, target_name, target_image, end_price)
                )
                conn.commit()
            except Exception as e:
                print(f"[play_game upgrade] db error: {e}")
                return jsonify({"error": "Database error"}), 500
            finally:
                if conn:
                    conn.close()

            item = {
                "id": c.lastrowid,   # id записи в инвентаре (ключ для фронта)
                "name": target_name,
                "floor": end_price,
                "image": target_image
            }

        return jsonify({"success": success, "item": item, "user_id": user_id})

    # ── Для остальных game_type требуется bet_amount ─────────────────
    bet_amount = float(data.get("bet_amount", 0))
    if bet_amount <= 0:
        return jsonify({"error": "bet_amount must be > 0"}), 400

    if game_type == "crash":
        crash_point = generate_crash_point()
        # Обновляем задание daily_bet_5 (ставка от 1 TON)
        try:
            if bet_amount >= 1.0:
                update_task_progress(user_id, "daily_bet_5")
        except Exception as e:
            print(f"[play_game] task progress error: {e}", flush=True)
        return jsonify({"crash_point": crash_point, "user_id": user_id})

    elif game_type == "case":
        # ⚠ Сервер сам выбирает предмет, зачисляет в inventory и возвращает
        # результат. Клиенту не доверяем — фронт НЕ вызывает /api/inventory/add.
        # Это исключает рассинхрон и выдачу предмета без участия сервера.
        case_id = str(data.get("case_id", "")).strip()
        pool = CASE_POOLS.get(case_id, CASE_WOOD_POOL)
        item = pick_case_item_from_pool(pool)
        if not item:
            return jsonify({"error": "No item selected"}), 500

        conn = None
        try:
            conn = sqlite3.connect(DB_PATH)
            c = conn.cursor()
            item_id = str(uuid.uuid4())
            c.execute(
                "INSERT INTO inventory (user_id, item_id, name, image, floor) VALUES (?, ?, ?, ?, ?)",
                (user_id, item_id, item["name"], item["image"], item["price"])
            )
            conn.commit()
        except Exception as e:
            print(f"[play_game case] db error: {e}")
            return jsonify({"error": "Database error"}), 500
        finally:
            if conn:
                conn.close()

        return jsonify({
            "success": True,
            "item": {
                "id": c.lastrowid,
                "name": item["name"],
                "image": item["image"],
                "floor": item["price"],
            },
            "user_id": user_id
        })

    # Обновляем задание daily_case_open (открытие кейса)
    try:
        update_task_progress(user_id, "daily_case_open")
    except Exception as e:
        print(f"[play_game] case task progress error: {e}", flush=True)

    # Обновляем задание daily_bet_5 (ставка от 1 TON)
    try:
        if bet_amount >= 1.0:
            update_task_progress(user_id, "daily_bet_5")
    except Exception as e:
        print(f"[play_game] task progress error: {e}", flush=True)

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
    print(f"[Plinko] Result: {multiplier}x, slotIndex={slot_index}, bet={bet_amount}, win={win_amount}")

    # Обновляем задание daily_bet_5 (ставка от 1 TON)
    user_id = str(data.get("user_id", ""))
    if user_id:
        try:
            if bet_amount >= 1.0:
                update_task_progress(user_id, "daily_bet_5")
        except Exception as e:
            print(f"[plinko_drop] task progress error: {e}", flush=True)

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

    # Проверка initData — ВРЕМЕННО ОТКЛЮЧЕНА
    # init_data = data.get("initData", "")
    # if not verify_init_data(init_data):
    #     return jsonify({"error": "Forbidden: invalid initData"}), 403

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

            # Если выпал TON (type === 'ton') — начисляем на баланс, а не в инвентарь
            if item.get("type") == "ton":
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

        print(f"[Case] Free case rolled: item_id={item_id}, name={item['name']}, rarity={item.get('rarity', '?')}")

        # Обновляем задание daily_case_open (открытие кейса)
        try:
            update_task_progress(user_id, "daily_case_open")
        except Exception as e:
            print(f"[open_case/free] task progress error: {e}", flush=True)

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

        # Если выпал TON — начисляем на баланс, а не в инвентарь
        if item.get("type") == "ton":
            new_balance = round(balance - case_price + item["price"], 2)
            c.execute(
                "UPDATE users SET balance_ton = ? WHERE id = ?",
                (new_balance, user_id)
            )
        else:
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

    print(f"[Case] Paid case rolled: item_id={item_id}, name={item['name']}, rarity={item.get('rarity', '?')}, case_id={case_id}")

    # Обновляем задание daily_case_open (открытие кейса)
    try:
        update_task_progress(user_id, "daily_case_open")
    except Exception as e:
        print(f"[open_case] task progress error: {e}", flush=True)

    return jsonify({"success": True, "item": {**item, "id": item_id}})


# ── Inventory ──────────────────────────────────────────────────────────
@app.route("/api/inventory", methods=["GET"])
def get_inventory():
    # Проверка initData ОТКЛЮЧЕНА: без валидного заголовка X-Init-Data
    # инвентарь и апгрейдер не загружались (403 Forbidden).
    # Заголовок остаётся ОПЦИОНАЛЬНЫМ — если передан, он игнорируется.
    # init_data_header = request.headers.get("X-Init-Data", "")
    # if init_data_header and not verify_init_data(init_data_header):
    #     return jsonify({"error": "Forbidden: invalid initData"}), 403

    user_id = request.args.get("user_id", "6267608438")
    conn = None
    try:
        conn = sqlite3.connect(DB_PATH)
        c = conn.cursor()
        c.execute("SELECT id, item_id, name, image, floor, status, timestamp FROM inventory WHERE user_id = ?", (user_id,))
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
            "status": row[5],
            "timestamp": row[6]
        }
        for row in rows
    ]
    return jsonify(items)


@app.route("/api/inventory/add", methods=["POST"])
def inventory_add():
    """⚠ Эндпоинт НЕ ЗАЩИЩЁН — принимает любой user_id и item без игрового
       контекста. Может быть использован для накрутки. Рекомендация:
       Удалить после того, как весь флоу выдачи переведён на серверную
       авторитарную запись (play_game, open_case).

       Сейчас не удаляем, т.к. может использоваться старыми клиентами,
       но НИ ОДИН игровой эндпоинт (upgrade, case) больше не вызывает этот
       роут — выдача происходит только на сервере при success == True."""
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
    name = bleach.clean(item.get("name", "Unknown") if isinstance(item, dict) else "Unknown", tags=[], strip=True)
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


# ── Загрузка NFT-пула из my_nfts.json ─────────────────────────────────
NFT_POOL_PATH = os.path.join(os.path.dirname(__file__), "public", "my_nfts.json")
NFT_POOL = []
try:
    if os.path.exists(NFT_POOL_PATH):
        with open(NFT_POOL_PATH, "r", encoding="utf-8") as f:
            NFT_POOL = json.load(f)
        print(f"[NFT_POOL] Загружено {len(NFT_POOL)} предметов из {NFT_POOL_PATH}")
    else:
        print(f"[NFT_POOL] Файл {NFT_POOL_PATH} не найден — пул пуст")
except Exception as e:
    print(f"[NFT_POOL] Ошибка загрузки: {e}")


# ── Get Floor Price ─────────────────────────────────────────────────────
@app.route("/api/get_floor", methods=["GET"])
def get_floor():
    """Возвращает floor-цену предмета из my_nfts.json по имени коллекции."""
    collection = request.args.get("collection", "").strip().lower()
    if not collection:
        return jsonify({"error": "collection is required"}), 400

    for entry in NFT_POOL:
        entry_name = (entry.get("collection", "") or entry.get("name", "")).strip().lower()
        if entry_name == collection:
            floor = entry.get("floor", 0)
            return jsonify({
                "floor_price": floor,
                "price": floor,
                "collection": entry.get("collection", entry.get("name", "")),
            })

    return jsonify({"error": "Collection not found"}), 404


# ── Get Case Pool ───────────────────────────────────────────────────────────
@app.route("/api/get_case_pool", methods=["GET"])
def get_case_pool():
    """Возвращает реальный пул предметов для кейса (используется для UI витрины)."""
    case_id = request.args.get("case_id", "").strip()
    if not case_id or case_id not in CASE_POOLS:
        return jsonify({"error": "Case not found"}), 404
    return jsonify(CASE_POOLS[case_id])


# ── Auto-update NFT floors ─────────────────────────────────────────────────
def update_nft_floors():
    """Читает my_nfts.json, для каждого NFT запрашивает актуальную floor-цену
    через api.changes.tg и обновляет поле floor. При ошибке API оставляет старую цену."""
    nft_path = os.path.join(os.path.dirname(__file__), "public", "my_nfts.json")
    if not os.path.exists(nft_path):
        print("[NFT Update] Файл my_nfts.json не найден")
        return

    try:
        with open(nft_path, "r", encoding="utf-8") as f:
            nfts = json.load(f)
    except Exception as e:
        print(f"[NFT Update] Ошибка чтения JSON: {e}")
        return

    updated = 0
    for nft in nfts:
        name = nft.get("name", "").strip()
        if not name:
            continue
        slug = name.lower().replace(" ", "-")
        url = f"https://api.changes.tg/collection/{slug}"
        try:
            resp = requests.get(url, timeout=10)
            if resp.ok:
                data = resp.json()
                floor_price = data.get("floor_price")
                if floor_price is not None:
                    nft["floor"] = float(floor_price)
                    updated += 1
                    print(f"[NFT Update] {name}: floor = {floor_price}")
                else:
                    print(f"[NFT Update] {name}: нет floor_price в ответе")
            else:
                print(f"[NFT Update] {name}: API вернул {resp.status_code}")
        except Exception as e:
            print(f"[NFT Update] {name}: ошибка сети/API — {e}")

    try:
        with open(nft_path, "w", encoding="utf-8") as f:
            json.dump(nfts, f, indent=2, ensure_ascii=False)
        print(f"[NFT Update] Обновлено {updated} / {len(nfts)} предметов")
    except Exception as e:
        print(f"[NFT Update] Ошибка записи JSON: {e}")


# ── Buy NFT (Market) ─────────────────────────────────────────────────────
@app.route("/api/buy_nft", methods=["POST"])
def buy_nft():
    """Покупка NFT из маркета: списывает TON и добавляет предмет в инвентарь."""
    print(f"REQUEST: /api/buy_nft body={request.get_data(as_text=True)[:300]}", flush=True)
    data = request.get_json(force=True, silent=True)
    if not data:
        return jsonify({"error": "Invalid JSON body"}), 400

    # Проверка initData НЕОБЯЗАТЕЛЬНАЯ: если заголовка X-Init-Data нет — пропускаем
    init_data_header = request.headers.get("X-Init-Data", "")
    if init_data_header and not verify_init_data(init_data_header):
        return jsonify({"error": "Forbidden: invalid initData"}), 403

    user_id = str(data.get("user_id", "unknown"))
    item = data.get("item")

    if not user_id or user_id == "unknown":
        return jsonify({"error": "user_id is required"}), 400
    if not item:
        return jsonify({"error": "item is required"}), 400

    # Валидация цены и данных из my_nfts.json
    item_id = str(item.get("id", "")).strip()
    expected_item = None
    for pool_item in NFT_POOL:
        if str(pool_item.get("id", "")).strip() == item_id:
            expected_item = pool_item
            break

    if expected_item is None:
        return jsonify({"error": "Item not found in NFT pool"}), 400

    price = float(expected_item.get("floor", 0))
    if price <= 0:
        return jsonify({"error": "Invalid item price"}), 400

    # Используем данные из пула, а не от клиента
    name = bleach.clean(expected_item.get("name", "Unknown"), tags=[], strip=True)
    image = expected_item.get("image", "")
    floor = price

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
    # Данные берём из NFT_POOL (my_nfts.json), а не от клиента
    pool_item_id = expected_item.get("id", str(uuid.uuid4()))
    new_balance = round(balance - price, 2)

    try:
        c.execute(
            "INSERT INTO inventory (user_id, item_id, name, image, floor) VALUES (?, ?, ?, ?, ?)",
            (user_id, pool_item_id, name, image, floor)
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

        # 1. Проверяем, что NFT реально существует в инвентаре пользователя
        c.execute(
            "SELECT id, status FROM inventory WHERE id = ? AND user_id = ?",
            (inventory_id, user_id)
        )
        nft_row = c.fetchone()
        if nft_row is None:
            return jsonify({"error": "NFT не найден"}), 404

        # Не даём продать NFT, который на холде
        if nft_row[1] == 'hold':
            return jsonify({"error": "NFT на проверке, продажа недоступна"}), 400

        # 2. Удаляем NFT
        c.execute("DELETE FROM inventory WHERE id = ? AND user_id = ?",
                  (inventory_id, user_id))
        if c.rowcount == 0:
            # NFT уже удалён — не начисляем деньги
            conn.rollback()
            return jsonify({"error": "NFT не найден"}), 404

        # 3. Только после успешного удаления начисляем деньги
        c.execute("SELECT balance_ton FROM users WHERE id = ?", (user_id,))
        row = c.fetchone()
        balance = row[0] if row else 15.0

        new_balance = balance + price
        c.execute("INSERT INTO users (id, balance_ton) VALUES (?, ?) ON CONFLICT(id) DO UPDATE SET balance_ton = ?",
                  (user_id, new_balance, new_balance))

        conn.commit()
    except Exception as e:
        print(f"[sell_nft] error: {e}")
        if conn:
            conn.rollback()
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

    # Прямой доступ к api.telegram.org из этого окружения недоступен, поэтому
    # идём через тот же Cloudflare Worker-прокси, что и остальные методы
    # (sendMessage / getMe / getChatMember) — см. TG_API_BASE выше.
    url = f"{TG_API_BASE}/bot{TG_BOT_TOKEN}/createInvoiceLink"
    headers = {"Content-Type": "application/json"}

    # Прокси опционален: если нужен — задаётся через переменную окружения,
    # креды больше не захардкожены в коде.
    proxy_url = os.environ.get("TG_PROXY_URL", "").strip()
    proxies = {"http": proxy_url, "https": proxy_url} if proxy_url else None

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
    """Возвращает текущее состояние Crash-раунда (для джойна в середине раунда)."""
    with CRASH_LOCK:
        result = {
            "state": CRASH_STATE,
            "timer": CRASH_TIMER,
            "crash_point": CRASH_POINT,
            "start_time": CRASH_START_TIME,
            "rate": CRASH_RATE,
            "time_to_crash": round((CRASH_POINT - 1.0) / CRASH_RATE, 2) if CRASH_RATE > 0 else 0,
        }
        if CRASH_STATE == "flying":
            elapsed = (time.time() * 1000) - CRASH_START_TIME
            result["multiplier"] = round(1.0 + (elapsed / 1000) * CRASH_RATE, 4)
        return jsonify(result)



@app.route("/api/pvp_state", methods=["GET"])
def pvp_state():
    """Возвращает текущее состояние PvP (Hockey) для восстановления при сворачивании."""
    user_id = request.args.get("user_id", "").strip()
    if not user_id:
        return jsonify({"error": "Missing user_id"}), 400

    player_info = None
    with HOCKEY_LOCK:
        for p in HOCKEY_PLAYERS:
            if p.get("user_id") == user_id:
                player_info = {
                    "user_id": p["user_id"],
                    "username": p["username"],
                    "bet": p["bet"],
                }
                break

    return jsonify({
        "state": HOCKEY_STATE,
        "timer": HOCKEY_TIMER,
        "player": player_info,
        "players_count": len(HOCKEY_PLAYERS),
        "in_pool": player_info is not None,
    })

# ── Withdraw NFT (холд для проверки админом) ────────────────────────────
@app.route("/api/withdraw_nft", methods=["POST"])
def withdraw_nft():
    """
    Принимает заявку на вывод NFT:
    - Ставит статус 'hold' в БД (не удаляет!)
    - Отправляет уведомление админу в Telegram
    """
    data = request.get_json(force=True, silent=True)
    if not data:
        return jsonify({"error": "Invalid JSON body"}), 400

    user_id = str(data.get("user_id", "unknown"))
    inventory_id = data.get("inventory_id") or data.get("item_id")
    username = bleach.clean(str(data.get("username", "unknown")), tags=[], strip=True)
    nft_name = str(data.get("nft_name", "unknown"))
    nft_price = float(data.get("nft_price", 0))

    # 1. Обновляем статус NFT на 'hold' в БД
    if inventory_id:
        conn = None
        try:
            conn = sqlite3.connect(DB_PATH)
            c = conn.cursor()
            c.execute(
                "UPDATE inventory SET status = 'hold' WHERE id = ? AND user_id = ?",
                (inventory_id, user_id)
            )
            if c.rowcount == 0:
                print(f"[withdraw_nft] NFT {inventory_id} не найден у user={user_id}")
            conn.commit()
        except Exception as e:
            print(f"[withdraw_nft] DB error: {e}")
        finally:
            if conn:
                conn.close()

    # 2. Формируем текст уведомления
    text = (
        "🔔 ЗАЯВКА НА ВЫВОД NFT!\n\n"
        "👤 Юзер: @{} (ID: {})\n"
        "🎁 NFT: {}\n"
        "💰 Цена: {} TON\n"
        "🆔 ID заявки: {}\n\n"
        "⚠️ Зайдите в панель администратора, чтобы подтвердить или отклонить вывод."
    ).format(username, user_id, nft_name, nft_price, inventory_id or "—")

    try:
        bot_token = "8837626872:AAEEqnmT-hEKwMOhTfZ9LDLmOu7AHi88Pzw"
        url = f"https://stars.gleb0256149.workers.dev/bot{bot_token}/sendMessage"
        payload = {
            "chat_id": ADMIN_ID,
            "text": text,
        }
        resp = requests.post(url, json=payload, timeout=10)
        if not resp.ok:
            print(f"[withdraw_nft] Telegram API error: {resp.status_code} {resp.text}")
    except Exception as e:
        print(f"[withdraw_nft] Request failed: {e}")

    return jsonify({"success": True, "status": "hold"})


# ── Admin Panel ────────────────────────────────────────────────────────────

@app.route("/admin", methods=["GET"])
def admin_panel():
    """Отдаёт панель администратора (admin.html)."""
    user_id = request.args.get("user_id", "")
    if user_id != ADMIN_ID:
        return jsonify({"error": "Forbidden"}), 403
    return app.send_static_file("admin.html")


@app.route("/api/admin/requests", methods=["GET"])
def admin_requests():
    """Возвращает список всех NFT со статусом 'hold'."""
    user_id = request.args.get("user_id", "")
    if user_id != ADMIN_ID:
        return jsonify({"error": "Forbidden"}), 403

    conn = None
    try:
        conn = sqlite3.connect(DB_PATH)
        c = conn.cursor()
        c.execute(
            "SELECT id, user_id, name, image, floor, timestamp FROM inventory WHERE status = 'hold' ORDER BY timestamp DESC"
        )
        rows = c.fetchall()
    except Exception as e:
        print(f"[admin_requests] error: {e}")
        return jsonify([])
    finally:
        if conn:
            conn.close()

    items = [
        {
            "id": row[0],
            "user_id": row[1],
            "name": row[2],
            "image": row[3],
            "floor": row[4],
            "timestamp": row[5],
        }
        for row in rows
    ]
    return jsonify(items)


@app.route("/api/admin/action", methods=["POST"])
def admin_action():
    """Обрабатывает решение админа: approve (выдано) или reject (отказано)."""
    data = request.get_json(force=True, silent=True)
    if not data:
        return jsonify({"error": "Invalid JSON body"}), 400

    admin_id = data.get("admin_id", "")
    if admin_id != ADMIN_ID:
        return jsonify({"error": "Forbidden"}), 403

    inventory_id = data.get("inventory_id")
    action = data.get("action", "").strip().lower()

    if not inventory_id or action not in ("approve", "reject"):
        return jsonify({"error": "Invalid parameters"}), 400

    conn = None
    try:
        conn = sqlite3.connect(DB_PATH)
        c = conn.cursor()

        if action == "approve":
            c.execute("UPDATE inventory SET status = 'sold' WHERE id = ?", (inventory_id,))
            print(f"[admin_action] NFT {inventory_id} — ВЫДАНО (sold)", flush=True)
        elif action == "reject":
            c.execute("UPDATE inventory SET status = 'available' WHERE id = ?", (inventory_id,))
            print(f"[admin_action] NFT {inventory_id} — ОТКАЗАНО (available)", flush=True)

        conn.commit()
        return jsonify({"success": True, "status": "sold" if action == "approve" else "available"})
    except Exception as e:
        print(f"[admin_action] error: {e}")
        return jsonify({"error": "Database error"}), 500
    finally:
        if conn:
            conn.close()


# ── Turnover Leaderboard ──────────────────────────────────────────────
@app.route("/api/add_turnover", methods=["POST"])
def add_turnover():
    """Фиксирует ставку пользователя в таблице оборота."""
    data = request.get_json(force=True, silent=True)
    if not data:
        return jsonify({"error": "Invalid JSON body"}), 400

    user_id = str(data.get("user_id", "unknown"))
    username = bleach.clean(str(data.get("username", "Unknown")), tags=[], strip=True)
    amount = float(data.get("amount", 0))

    if amount <= 0:
        return jsonify({"error": "Amount must be > 0"}), 400

    # Защита от накрутки: суммы оборота выше 100 000 TON в базу не пишем
    if amount > 100000:
        print(f"[add_turnover] Отклонена аномальная сумма {amount} TON (защита от накрутки)")
        return jsonify({"error": "Amount exceeds 100000 TON limit"}), 400

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
        leaderboard = [
            {
                "username": row[0],
                "total": round(row[1], 2),
                "prize": LEADERBOARD_PRIZES.get(i + 1, 0.0),
            }
            for i, row in enumerate(rows)
        ]
        return jsonify(leaderboard)
    except Exception as e:
        print(f"[leaderboard_turnover] error: {e}")
        return jsonify([])
    finally:
        if conn:
            conn.close()


# ── Bet History & User Stats ───────────────────────────────────────────
@app.route("/api/add_bet_history", methods=["POST"])
def add_bet_history():
    """Записывает запись в историю ставок пользователя.

    kind: 'bet' (ставка по умолчанию) или 'win' (выигрыш для статистики).
    """
    data = request.get_json(force=True, silent=True)
    if not data:
        return jsonify({"error": "Invalid JSON body"}), 400

    user_id = str(data.get("user_id", "unknown"))
    game_type = str(data.get("game_type", "unknown"))
    bet_type = str(data.get("bet_type", "ton"))
    amount = float(data.get("amount", 0))
    item_name = str(data.get("item_name", "") or "")
    kind = str(data.get("kind", "bet"))

    if not user_id or user_id == "unknown":
        return jsonify({"error": "user_id is required"}), 400

    conn = None
    try:
        conn = sqlite3.connect(DB_PATH)
        c = conn.cursor()
        c.execute(
            "INSERT INTO bet_history (user_id, game_type, bet_type, amount, item_name, kind) VALUES (?, ?, ?, ?, ?, ?)",
            (user_id, game_type, bet_type, amount, item_name, kind),
        )
        conn.commit()
    except Exception as e:
        print(f"[add_bet_history] error: {e}")
        return jsonify({"error": "Database error"}), 500
    finally:
        if conn:
            conn.close()
    return jsonify({"success": True})


@app.route("/api/bet_history", methods=["GET"])
def bet_history():
    """Возвращает последние 20 ставок пользователя."""
    user_id = str(request.args.get("user_id", ""))
    if not user_id or user_id == "unknown":
        return jsonify({"error": "user_id is required"}), 400

    conn = None
    try:
        conn = sqlite3.connect(DB_PATH)
        c = conn.cursor()
        c.execute(
            """
            SELECT id, user_id, game_type, bet_type, amount, item_name, timestamp, kind
            FROM bet_history
            WHERE user_id = ?
            ORDER BY id DESC
            LIMIT 20
            """,
            (user_id,),
        )
        rows = c.fetchall()
        history = [
            {
                "id": r[0],
                "user_id": r[1],
                "game_type": r[2],
                "bet_type": r[3],
                "amount": r[4],
                "item_name": r[5] or "",
                "timestamp": r[6],
                "kind": r[7] or "bet",
            }
            for r in rows
        ]
        return jsonify(history)
    except Exception as e:
        print(f"[bet_history] error: {e}")
        return jsonify([])
    finally:
        if conn:
            conn.close()


@app.route("/api/user_stats", methods=["GET"])
def user_stats():
    """Возвращает статистику пользователя:
      - max_win — самый большой выигрыш (из записей kind='win');
      - rarest_item — самый дорогой предмет из инвентаря (редкий дроп).
    """
    user_id = str(request.args.get("user_id", ""))
    if not user_id or user_id == "unknown":
        return jsonify({"error": "user_id is required"}), 400

    conn = None
    try:
        conn = sqlite3.connect(DB_PATH)
        c = conn.cursor()

        c.execute(
            "SELECT COALESCE(MAX(amount), 0) FROM bet_history WHERE user_id = ? AND kind = 'win'",
            (user_id,),
        )
        max_win = float(c.fetchone()[0] or 0)

        c.execute(
            "SELECT name, image, floor FROM inventory WHERE user_id = ? ORDER BY floor DESC LIMIT 1",
            (user_id,),
        )
        row = c.fetchone()
        rarest_item = None
        if row:
            rarest_item = {"name": row[0], "image": row[1] or "", "price": row[2]}

        return jsonify({"max_win": round(max_win, 2), "rarest_item": rarest_item})
    except Exception as e:
        print(f"[user_stats] error: {e}")
        return jsonify({"error": "Database error"}), 500
    finally:
        if conn:
            conn.close()


def purge_expired_pvp_rooms():
    """Удаляет комнаты, где соперник не появился за PVP_WAIT_TIMEOUT секунд.

    Клиент сам возвращает ставку по своему таймеру (15 сек), а серверная
    очистка страхует: в устаревшую комнату не должен попасть следующий игрок,
    иначе получится матч с "фантомом".
    """
    now = time.time()
    with PVP_ROOMS_LOCK:
        for room_id, room in list(PVP_ROOMS.items()):
            if room['status'] == 'waiting' and now - room.get('created_at', now) >= PVP_WAIT_TIMEOUT:
                del PVP_ROOMS[room_id]
                socketio.emit('pvp_error', {'error': 'Соперник не найден'}, room=room_id, include_self=True)
                print(f"[PvP] Комната {room_id} удалена по таймауту ожидания")


# ── PvP WebSocket Handlers ────────────────────────────────────────────
@socketio.on('join_pvp')
def handle_join_pvp(data):
    """Принимает { user_id, username, bet }. Ищет комнату или создаёт новую."""
    user_id = str(data.get('user_id', ''))
    username = str(data.get('username', 'Unknown'))
    bet = float(data.get('bet', 0))

    if not user_id or bet <= 0:
        emit('pvp_error', {'error': 'Invalid data'})
        return

    # Сначала вычищаем просроченные комнаты ожидания, чтобы не попасть в них
    purge_expired_pvp_rooms()

    # Ищем комнату со статусом 'waiting' и < 2 игроков
    joined_room = None
    with PVP_ROOMS_LOCK:
        for room_id, room in list(PVP_ROOMS.items()):
            if room['status'] == 'waiting' and len(room['players']) < 2:
                # Проверяем, что такой же юзер не в комнате
                if any(p['user_id'] == user_id for p in room['players']):
                    continue
                joined_room = room_id
                break

        if joined_room:
            room = PVP_ROOMS[joined_room]
            player_num = len(room['players']) + 1
            player = {
                'user_id': user_id,
                'username': username,
                'bet': bet,
                'color': '#f43f5e' if player_num == 1 else '#3b82f6',
                'sid': request.sid,
            }
            room['players'].append(player)
            room['status'] = 'playing'

            # Подключаем сокет к комнате
            join_room(joined_room)

            # Уведомляем ВСЕХ в комнате (обоих игроков)
            emit('pvp_started', {
                'room_id': joined_room,
                'players': [{
                    'user_id': p['user_id'],
                    'username': p['username'],
                    'bet': p['bet'],
                    'color': p['color'],
                } for p in room['players']],
                'total_pot': sum(p['bet'] for p in room['players']),
            }, room=joined_room)

            print(f"[PvP] Матч создан: комната {joined_room}, игроки: {[p['username'] for p in room['players']]}")
        else:
            # Создаём новую комнату
            new_room_id = str(uuid.uuid4())
            player = {
                'user_id': user_id,
                'username': username,
                'bet': bet,
                'color': '#f43f5e',
                'sid': request.sid,
            }
            PVP_ROOMS[new_room_id] = {
                'players': [player],
                'status': 'waiting',
                'created_at': time.time(),
            }
            join_room(new_room_id)
            emit('pvp_waiting', {
                'room_id': new_room_id,
                'message': 'Ожидание соперника...',
            })
            print(f"[PvP] Комната создана: {new_room_id}, игрок: {username}")
@socketio.on('pvp_create')
def handle_pvp_create(data):
    """Принимает { bet }. Использует request.sid как user_id (как и клиент PvP2Page.tsx).
    НЕ добавляет ботов — только реальные игроки.
    """
    bet = float(data.get('bet', 0))
    user_id = request.sid
    username = f'Player_{user_id[:8]}'

    if bet <= 0:
        emit('pvp_error', {'error': 'Invalid bet'})
        return

    purge_expired_pvp_rooms()

    joined_room = None
    with PVP_ROOMS_LOCK:
        # Ищем комнату ожидания с 1 игроком
        for room_id, room in list(PVP_ROOMS.items()):
            if room['status'] == 'waiting' and len(room['players']) < 2:
                if any(p['user_id'] == user_id for p in room['players']):
                    continue
                joined_room = room_id
                break

        if joined_room:
            # Второй реальный игрок найден — начинаем матч
            room = PVP_ROOMS[joined_room]
            player_num = len(room['players']) + 1
            player = {
                'user_id': user_id,
                'username': username,
                'bet': bet,
                'color': '#f43f5e' if player_num == 1 else '#3b82f6',
                'sid': request.sid,
            }
            room['players'].append(player)
            room['status'] = 'playing'

            join_room(joined_room)

            emit('pvp_started', {
                'room_id': joined_room,
                'players': [{
                    'user_id': p['user_id'],
                    'username': p['username'],
                    'bet': p['bet'],
                    'color': p['color'],
                } for p in room['players']],
                'total_pot': sum(p['bet'] for p in room['players']),
            }, room=joined_room)

            print(f"[PvP2] Матч создан: комната {joined_room}, игроки: {[p['username'] for p in room['players']]}")
        else:
            # Первый игрок — создаём комнату ожидания
            new_room_id = str(uuid.uuid4())
            player = {
                'user_id': user_id,
                'username': username,
                'bet': bet,
                'color': '#f43f5e',
                'sid': request.sid,
            }
            PVP_ROOMS[new_room_id] = {
                'players': [player],
                'status': 'waiting',
                'created_at': time.time(),
            }
            join_room(new_room_id)
            emit('pvp_waiting', {
                'room_id': new_room_id,
                'message': 'Ожидание соперника...',
            })
            print(f"[PvP2] Комната создана: {new_room_id}, игрок: {username}")


@socketio.on('spin_pvp')
def handle_spin_pvp(data):
    """Принимает { room_id }. Генерирует случайного победителя."""
    room_id = data.get('room_id')
    with PVP_ROOMS_LOCK:
        if not room_id or room_id not in PVP_ROOMS:
            emit('pvp_error', {'error': 'Room not found'})
            return

        room = PVP_ROOMS[room_id]
        if len(room['players']) < 2:
            emit('pvp_error', {'error': 'Not enough players'})
            return

        # Случайный победитель
        winner = random.choice(room['players'])
        total_pot = sum(p['bet'] for p in room['players'])

        emit('pvp_result', {
            'winner_id': winner['user_id'],
            'winner_name': winner['username'],
            'total_pot': total_pot,
        }, room=room_id)

        print(f"[PvP] Результат: комната {room_id}, победил {winner['username']}, банк {total_pot}")

        # Обновляем задание daily_pvp_win (победа в PvP со ставкой от 2 TON)
        try:
            if winner['bet'] >= 2.0:
                update_task_progress(winner['user_id'], "daily_pvp_win")
        except Exception as e:
            print(f"[PvP] task progress error: {e}", flush=True)

        # Удаляем комнату после завершения
        del PVP_ROOMS[room_id]


# ── Crash WebSocket Handlers ───────────────────────────────────────────
@socketio.on('crash_bet')
def handle_crash_bet(data):
    # Принимает { user_id, username, bet, auto_cashout }. Добавляет игрока в CRASH_PLAYERS
    # и рассылает всем обновлённый список ставок.
    global CRASH_PLAYERS
    user_id = str(data.get('user_id', ''))
    username = str(data.get('username', 'Игрок'))
    bet = float(data.get('bet', 0))
    auto_cashout = data.get('auto_cashout', None)
    if auto_cashout is not None:
        try:
            auto_cashout = float(auto_cashout)
        except (ValueError, TypeError):
            auto_cashout = None

    if not user_id or bet <= 0:
        emit('crash_error', {'error': 'Invalid bet data'})
        return

    with CRASH_LOCK:
        # Если игрок уже в списке — обновляем его ставку вместо дубля
        CRASH_PLAYERS = [p for p in CRASH_PLAYERS if p['user_id'] != user_id]
        CRASH_PLAYERS.append({
            'user_id': user_id,
            'username': username,
            'bet': bet,
            'sid': request.sid,
            'auto_cashout': auto_cashout,
            'cashed_out': False,
            'multiplier': None,
        })
        players_snapshot = [
            {'user_id': p['user_id'], 'username': p['username'], 'bet': p['bet']}
            for p in CRASH_PLAYERS
        ]

    # Отправляем подтверждение ставки конкретному клиенту
    emit('crash_bet_result', {'success': True, 'bet': bet})
    print(f"[Crash] Подтверждение ставки отправлено {username} ({user_id})")

    # Обновляем задание daily_bet_5 (ставка от 1 TON)
    try:
        if bet >= 1.0:
            update_task_progress(user_id, "daily_bet_5")
    except Exception as e:
        print(f"[Crash] task progress error: {e}", flush=True)

    socketio.emit('crash_players_update', {'players': players_snapshot})
    print(f"[Crash] Ставка {username} ({user_id}): {bet} TON. Игроков в пуле: {len(CRASH_PLAYERS)}")


@socketio.on('crash_cashout')
def handle_crash_cashout(data):
    """Принимает { user_id, multiplier }. Начисляет выигрыш в БД,
    помечает игрока как cashed_out в CRASH_PLAYERS и рассылает обновление."""
    global CRASH_PLAYERS
    user_id = str(data.get('user_id', ''))
    multiplier = float(data.get('multiplier', 1.0))

    if not user_id or multiplier < 1.0:
        emit('crash_error', {'error': 'Invalid cashout data'})
        return

    bet_amount = 0
    username = 'Игрок'
    found = False

    with CRASH_LOCK:
        for p in CRASH_PLAYERS:
            if p['user_id'] == user_id:
                bet_amount = p['bet']
                username = p['username']
                p['cashed_out'] = True
                p['multiplier'] = multiplier
                found = True
                break

    if not found:
        emit('crash_error', {'error': 'Bet not found'})
        return

    if bet_amount <= 0:
        return

    win_amount = bet_amount * multiplier

    # ── Начисление выигрыша в БД ──
    conn = None
    try:
        conn = sqlite3.connect(DB_PATH)
        c = conn.cursor()
        c.execute("SELECT balance_ton FROM users WHERE id = ?", (user_id,))
        row = c.fetchone()
        balance_before = row[0] if row else 0

        c.execute(
            "UPDATE users SET balance_ton = COALESCE(balance_ton, 0) + ? WHERE id = ?",
            (win_amount, user_id)
        )
        c.execute("SELECT balance_ton FROM users WHERE id = ?", (user_id,))
        balance_after = c.fetchone()[0]
        conn.commit()
        print(f"[CrashCashout] {username} ({user_id}): {bet_amount} -> {win_amount} TON ({multiplier}x). Баланс: {balance_before} -> {balance_after}")
    except Exception as e:
        print(f"[CrashCashout] DB error: {e}")
        if conn:
            conn.rollback()
        emit('crash_error', {'error': 'Internal error'})
        return
    finally:
        if conn:
            conn.close()

    # ── Рассылаем обновлённый список игроков ──
    with CRASH_LOCK:
        players_snapshot = [
            {
                'user_id': p['user_id'],
                'username': p['username'],
                'bet': p['bet'],
                'multiplier': p.get('multiplier'),
                'cashed_out': p.get('cashed_out', False),
            }
            for p in CRASH_PLAYERS
        ]

    socketio.emit('crash_players_update', {'players': players_snapshot})

    # ── Отправляем результат конкретному клиенту ──
    emit('crash_cashout_result', {
        'success': True,
        'win_amount': round(win_amount, 2),
        'multiplier': multiplier,
        'new_balance': round(balance_after, 2),
    })
    print(f"[CrashCashout] Успех: {username} ({user_id}) забрал {win_amount:.2f} TON по {multiplier}x")

    # Обновляем задание daily_crash_win_5x (выигрыш x5+ со ставкой от 5 TON)
    try:
        if multiplier >= 5.0 and bet_amount >= 5.0:
            update_task_progress(user_id, "daily_crash_win_5x")
    except Exception as e:
        print(f"[CrashCashout] task progress error: {e}", flush=True)


# ── Hockey WebSocket Handlers ───────────────────────────────────────────
@socketio.on('hockey_bet')
def handle_hockey_bet(data):
    """Принимает { user_id, username, bet }. Проверяет баланс, списывает ставку в БД,
    добавляет игрока в HOCKEY_PLAYERS и рассылает обновлённый список."""
    global HOCKEY_PLAYERS, ACTIVE_HOCKEY_BETS
    user_id = str(data.get('user_id', ''))
    username = str(data.get('username', 'Игрок'))
    # Сохраняем реальный username игрока (клиент шлёт user?.username || first_name).
    # Легаси-клиенты могли слать 'You' — заменяем на нейтральный ник.
    if not username or username.strip().lower() == 'you':
        username = 'Игрок'
    bet = float(data.get('bet', 0))

    if not user_id or bet <= 0:
        emit('hockey_error', {'error': 'Invalid bet data'})
        return

    # ── Проверка баланса и списание в БД ──
    conn = None
    try:
        conn = sqlite3.connect(DB_PATH)
        c = conn.cursor()
        c.execute("SELECT balance_ton FROM users WHERE id = ?", (user_id,))
        row = c.fetchone()
        if not row:
            emit('hockey_error', {'error': 'User not found'})
            return
        balance_before = row[0]
        print(f"[Hockey] Баланс ДО: user={user_id} balance={balance_before} bet={bet}")

        if balance_before < bet:
            print(f"[Hockey] ОТКЛОНЕНО: недостаточно средств user={user_id} balance={balance_before} bet={bet}")
            emit('hockey_error', {'error': 'nssufficient balance'})
            return

        # Списываем ставку
        c.execute("UPDATE users SET balance_ton = COALESCE(balance_ton, 0) - ? WHERE id = ?", (bet, user_id))
        c.execute("SELECT balance_ton FROM users WHERE id = ?", (user_id,))
        balance_after = c.fetchone()[0]
        print(f"[Hockey] Баланс ПОСЛЕ: user={user_id} balance={balance_after} bet={bet}")
        conn.commit()
    except Exception as e:
        print(f"[Hockey] DB error in handle_hockey_bet: {e}")
        if conn:
            conn.rollback()
        emit('hockey_error', {'error': 'nternal error'})
        return
    finally:
        if conn:
            conn.close()

    # ── Добавление в in-memory список и рассылка ──
    with HOCKEY_LOCK:
        HOCKEY_PLAYERS = [p for p in HOCKEY_PLAYERS if p['user_id'] != user_id]
        HOCKEY_PLAYERS.append({
            'user_id': user_id,
            'username': username,
            'bet': bet,
            'sid': request.sid,
        })
        ACTIVE_HOCKEY_BETS[user_id] = bet
        players_snapshot = [
            {'user_id': p['user_id'], 'username': p['username'], 'bet': p['bet'], 'color': '#a855f7'}
            for p in HOCKEY_PLAYERS
        ]

    socketio.emit('hockey_players_update', {'players': players_snapshot})
    socketio.emit('pvp_players_update', {'players': players_snapshot})
    # Отправляем подтверждение ставки конкретному игроку
    emit('hockey_bet_result', {'success': True, 'bet': bet})
    print(f"[Hockey] Ставка {username} ({user_id}): {bet} TON. Игроков в пуле: {len(HOCKEY_PLAYERS)}")

    # Обновляем задание daily_bet_5 (ставка от 1 TON)
    try:
        if bet >= 1.0:
            update_task_progress(user_id, "daily_bet_5")
    except Exception as e:
        print(f"[Hockey] task progress error: {e}", flush=True)


@socketio.on('connect')
def handle_connect():
    """Восстанавливает игрока в HOCKEY_PLAYERS при переподключении, если у него была
    активная ставка (user_id передаётся query-параметром сокета)."""
    user_id = request.args.get('user_id', '')
    if not user_id or user_id not in ACTIVE_HOCKEY_BETS:
        # Даже без user_id отправляем новому клиенту актуальный список игроков
        with HOCKEY_LOCK:
            players_snapshot = [
                {'user_id': p['user_id'], 'username': p['username'], 'bet': p['bet'], 'color': '#a855f7'}
                for p in HOCKEY_PLAYERS
            ]
        emit('hockey_players_update', {'players': players_snapshot})
        return

    restored = False
    with HOCKEY_LOCK:
        # Проверяем, есть ли игрок уже в пуле
        found = False
        for p in HOCKEY_PLAYERS:
            if p['user_id'] == user_id:
                p['sid'] = request.sid  # обновляем SID для точечных сообщений
                found = True
                break

        if not found:
            # Игрока нет в пуле — восстанавливаем из ACTIVE_HOCKEY_BETS
            bet = ACTIVE_HOCKEY_BETS.get(user_id, 0)
            if bet > 0:
                # Достаём username из БД
                username = 'Игрок'
                conn = None
                try:
                    conn = sqlite3.connect(DB_PATH)
                    c = conn.cursor()
                    c.execute("SELECT username, first_name FROM users WHERE id = ?", (user_id,))
                    row = c.fetchone()
                    if row:
                        username = row[0] or row[1] or 'Игрок'
                except Exception as e:
                    print(f"[Hockey] DB error fetching username for restore: {e}")
                finally:
                    if conn:
                        conn.close()

                HOCKEY_PLAYERS.append({
                    'user_id': user_id,
                    'username': username,
                    'bet': bet,
                    'sid': request.sid,
                })
                restored = True
                print(f"[Hockey] Игрок {username} ({user_id}) восстановлен при реконнекте. Ставка: {bet} TON")

        players_snapshot = [
            {'user_id': p['user_id'], 'username': p['username'], 'bet': p['bet'], 'color': '#a855f7'}
            for p in HOCKEY_PLAYERS
        ]

    # Если игрок был восстановлен — шлём обновление всем
    if restored:
        socketio.emit('hockey_players_update', {'players': players_snapshot})
        socketio.emit('pvp_players_update', {'players': players_snapshot})
    else:
        # Если просто переподключился — шлём новому клиенту актуальный список
        emit('hockey_players_update', {'players': players_snapshot})


@socketio.on('pvp_leave')
def handle_pvp_leave(data):
    """Выход из лобби Hockey: возвращает ставку в БД, удаляет игрока из HOCKEY_PLAYERS
    и рассылает всем свежий список."""
    global HOCKEY_PLAYERS, ACTIVE_HOCKEY_BETS
    data = data or {}
    user_id = str(data.get('user_id', ''))
    if not user_id:
        return

    # Сначала находим ставку игрока под блокировкой
    bet_to_refund = 0
    with HOCKEY_LOCK:
        for p in HOCKEY_PLAYERS:
            if p.get('user_id') == user_id:
                bet_to_refund = p.get('bet', 0)
                break
        before = len(HOCKEY_PLAYERS)
        HOCKEY_PLAYERS = [p for p in HOCKEY_PLAYERS if p.get('user_id') != user_id]
        removed = len(HOCKEY_PLAYERS) != before
        players_snapshot = [
            {'user_id': p['user_id'], 'username': p['username'], 'bet': p['bet'], 'color': '#a855f7'}
            for p in HOCKEY_PLAYERS
        ]

    # Возвращаем ставку в БД (только если игрок реально был в пуле)
    if bet_to_refund > 0 and removed:
        conn = None
        try:
            conn = sqlite3.connect(DB_PATH)
            c = conn.cursor()
            c.execute("SELECT balance_ton FROM users WHERE id = ?", (user_id,))
            row = c.fetchone()
            balance_before = row[0] if row else 0
            print(f"[Hockey] Возврат ставки user={user_id} сумма={bet_to_refund} баланс ДО={balance_before}")
            c.execute(
                "UPDATE users SET balance_ton = COALESCE(balance_ton, 0) + ? WHERE id = ?",
                (bet_to_refund, user_id)
            )
            c.execute("SELECT balance_ton FROM users WHERE id = ?", (user_id,))
            balance_after = c.fetchone()[0]
            print(f"[Hockey] Возврат ставки user={user_id} баланс ПОСЛЕ={balance_after}")
            conn.commit()
        except Exception as e:
            print(f"[Hockey] DB error refunding bet: {e}")
            if conn:
                conn.rollback()
        finally:
            if conn:
                conn.close()

    # Рассылаем актуальный список ВСЕМ клиентам, чтобы лобби обновлялось мгновенно
    socketio.emit('hockey_players_update', {'players': players_snapshot})
    socketio.emit('pvp_players_update', {'players': players_snapshot})
    if removed:
        ACTIVE_HOCKEY_BETS.pop(user_id, None)
        print(f"[Hockey] Игрок {user_id} вышел из лобби. Осталось в пуле: {len(HOCKEY_PLAYERS)}")


@socketio.on('pvp_cashout')
def handle_pvp_cashout(data):
    """Забор выигрыша во время раунда Hockey: начисляет выигрыш, удаляет игрока
    из HOCKEY_PLAYERS и рассылает обновление."""
    global HOCKEY_PLAYERS, ACTIVE_HOCKEY_BETS
    data = data or {}
    user_id = str(data.get('user_id', ''))
    if not user_id:
        return

    win_amount = 0
    with HOCKEY_LOCK:
        for p in HOCKEY_PLAYERS:
            if p.get('user_id') == user_id:
                win_amount = p.get('bet', 0)
                break
        before = len(HOCKEY_PLAYERS)
        HOCKEY_PLAYERS = [p for p in HOCKEY_PLAYERS if p.get('user_id') != user_id]
        removed = len(HOCKEY_PLAYERS) != before
        players_snapshot = [
            {'user_id': p['user_id'], 'username': p['username'], 'bet': p['bet'], 'color': '#a855f7'}
            for p in HOCKEY_PLAYERS
        ]

    if win_amount > 0 and removed:
        conn = None
        try:
            conn = sqlite3.connect(DB_PATH)
            c = conn.cursor()
            c.execute("SELECT balance_ton FROM users WHERE id = ?", (user_id,))
            row = c.fetchone()
            balance_before = row[0] if row else 0
            print(f"[Hockey] Кэшаут user={user_id} сумма={win_amount} баланс ДО={balance_before}")
            c.execute(
                "UPDATE users SET balance_ton = COALESCE(balance_ton, 0) + ? WHERE id = ?",
                (win_amount, user_id)
            )
            c.execute("SELECT balance_ton FROM users WHERE id = ?", (user_id,))
            balance_after = c.fetchone()[0]
            print(f"[Hockey] Кэшаут user={user_id} баланс ПОСЛЕ={balance_after}")
            conn.commit()

            # Уведомляем конкретного игрока об успешном кэшауте
            socketio.emit('pvp_cashout_result', {
                'success': True,
                'user_id': user_id,
                'win_amount': win_amount,
                'balance_ton': balance_after,
            })
        except Exception as e:
            print(f"[Hockey] DB error during cashout: {e}")
            if conn:
                conn.rollback()
            socketio.emit('pvp_cashout_result', {
                'success': False,
                'user_id': user_id,
                'win_amount': 0,
            })
        finally:
            if conn:
                conn.close()
    elif not removed:
        socketio.emit('pvp_cashout_result', {
            'success': False,
            'user_id': user_id,
            'win_amount': 0,
            'error': 'Player not found in pool',
        })

    # Рассылаем актуальный список ВСЕМ клиентам
    socketio.emit('hockey_players_update', {'players': players_snapshot})
    socketio.emit('pvp_players_update', {'players': players_snapshot})
    if removed:
        ACTIVE_HOCKEY_BETS.pop(user_id, None)
        print(f"[Hockey] Кэшаут игрока {user_id}. Осталось в пуле: {len(HOCKEY_PLAYERS)}")


@socketio.on('disconnect')
def handle_disconnect():
    """При отключении сокета НЕ удаляем игрока из пулов — ставка остаётся.
    Игрок удаляется только по явному событию (pvp_leave, crash_cashout, crash_ended).
    Это нужно, чтобы при сворачивании вкладки Telegram WebSocket не стирал ставку."""
    print(f"Client disconnected: {request.sid}")

# ── Запуск фоновой задачи сброса лидерборда ───────────────────────────
def start_leaderboard_reset_worker():
    """Запускает фоновый поток для автоматического сброса лидерборда."""
    thread = threading.Thread(target=check_and_reset_leaderboard, daemon=True)
    thread.start()
    print("[Server] Фоновый поток сброса лидерборда запущен.")


start_leaderboard_reset_worker()

# ── Hockey Game Loop (фоновый поток, глобальные раунды) ─────────────────
def hockey_game_loop():
    """Фоновый поток: глобальные раунды Hockey PvP каждые ~20 секунд (15 waiting + 5 playing)."""
    global HOCKEY_STATE, HOCKEY_TIMER, HOCKEY_PLAYERS, HOCKEY_START_TIME, ACTIVE_HOCKEY_BETS
    print("[HockeyLoop] Поток запущен.")
    while True:
        try:
            with HOCKEY_LOCK:
                if HOCKEY_STATE == "waiting":
                    HOCKEY_TIMER -= 1
                    socketio.emit('hockey_timer', {'timer': max(HOCKEY_TIMER, 0)})

                    if HOCKEY_TIMER <= 0:
                        HOCKEY_TIMER = 15  # сброс для следующего раунда
                        # Раунд стартует только при двух и более игроках (PvP).
                        # Меньше двух — раунд НЕ стартует, ставки остаются в пуле на следующий цикл.
                        if len(HOCKEY_PLAYERS) >= 2:
                            # ── Стартуем раунд ──
                            HOCKEY_STATE = "playing"
                            HOCKEY_START_TIME = time.time()

                            total_bet = sum(p['bet'] for p in HOCKEY_PLAYERS)
                            current_x = 0.0
                            shapes = []
                            for p in HOCKEY_PLAYERS:
                                pW = max(FIELD_W * (p['bet'] / total_bet), 1)
                                import random as rnd
                                shapes.append({
                                    'x': current_x,
                                    'y': 0,
                                    'w': pW,
                                    'h': FIELD_H,
                                    'hue': rnd.uniform(0, 360),
                                    'bet': p['bet'],
                                    'playerId': p['user_id'],
                                    'winner': False,
                                })
                                current_x += pW

                            socketio.emit('hockey_started', {
                                'players': [{
                                    'user_id': p['user_id'],
                                    'username': p['username'],
                                    'bet': p['bet'],
                                    'color': '#f43f5e' if i == 0 else '#3b82f6',
                                } for i, p in enumerate(HOCKEY_PLAYERS)],
                                'shapes': shapes,
                                'total_pot': total_bet,
                            })
                            print(f"[Hockey] Раунд стартовал! Игроков: {len(HOCKEY_PLAYERS)}, банк: {total_bet}")
                        else:
                            # Недостаточно игроков — ждём следующего цикла, ставки в пуле сохраняем
                            print(f"[Hockey] Игроков меньше двух ({len(HOCKEY_PLAYERS)}), ждём следующий цикл")

                elif HOCKEY_STATE == "playing":
                    elapsed = time.time() - HOCKEY_START_TIME
                    if elapsed >= 5.0:
                        # ── Раунд завершён ──
                        winner = random.choice(HOCKEY_PLAYERS)
                        total_pot = sum(p['bet'] for p in HOCKEY_PLAYERS)
                        # Комиссия казино 2.5%: победитель получает банк за вычетом комиссии
                        commission = round(total_pot * CASINO_COMMISSION_RATE, 2)
                        # Победитель получает банк за вычетом комиссии: total_pot * 0.975 (2.5%)
                        prize = round(total_pot * (1 - CASINO_COMMISSION_RATE), 2)

                        # ── Начисляем выигрыш победителю в БД ──
                        winner_conn = None
                        try:
                            winner_conn = sqlite3.connect(DB_PATH)
                            wc = winner_conn.cursor()
                            wc.execute("SELECT balance_ton FROM users WHERE id = ?", (winner['user_id'],))
                            w_row = wc.fetchone()
                            balance_before = w_row[0] if w_row else 0
                            print(f"[Hockey] ПОБЕДИТЕЛЬ {winner['username']} ({winner['user_id']}): "
                                  f"баланс ДО={balance_before}, приз={prize}")
                            wc.execute(
                                "UPDATE users SET balance_ton = COALESCE(balance_ton, 0) + ? WHERE id = ?",
                                (prize, winner['user_id'])
                            )
                            wc.execute("SELECT balance_ton FROM users WHERE id = ?", (winner['user_id'],))
                            balance_after = wc.fetchone()[0]
                            print(f"[Hockey] ПОБЕДИТЕЛЬ {winner['username']} ({winner['user_id']}): "
                                  f"баланс ПОСЛЕ={balance_after}")
                            winner_conn.commit()
                        except Exception as db_err:
                            print(f"[Hockey] DB error crediting winner: {db_err}")
                            if winner_conn:
                                winner_conn.rollback()
                        finally:
                            if winner_conn:
                                winner_conn.close()

                        socketio.emit('hockey_result', {
                            'winner_id': winner['user_id'],
                            'winner_name': winner['username'],
                            'total_pot': prize,             # выплата победителю (с учётом комиссии)
                            'commission': commission,       # 2.5% уходит казино
                        })
                        HOCKEY_STATE = "waiting"
                        HOCKEY_PLAYERS = []
                        ACTIVE_HOCKEY_BETS.clear()
                        print(f"[Hockey] Раунд завершён. Победил {winner['username']}, "
                              f"банк {total_pot}, комиссия {commission}, выплата {prize}")
        except Exception as e:
            print(f"[HockeyLoop] Ошибка: {e}")
        time.sleep(1)


# ── Запуск фонового потока Crash ─────────────────────────────────────────
def pvp_room_cleanup_loop():
    """Фоновый поток: раз в 2 секунды чистит просроченные комнаты ожидания PvP."""
    while True:
        time.sleep(2)
        try:
            purge_expired_pvp_rooms()
        except Exception as e:
            print(f"[PvP] Ошибка очистки комнат: {e}")


pvp_cleanup_thread = threading.Thread(target=pvp_room_cleanup_loop, daemon=True)
pvp_cleanup_thread.start()
print("[Server] Фоновый поток очистки PvP-комнат запущен.")

crash_thread = threading.Thread(target=crash_game_loop, daemon=True)
crash_thread.start()
print("[Server] Фоновый поток Crash запущен.")

hockey_thread = threading.Thread(target=hockey_game_loop, daemon=True)
hockey_thread.start()
print("[Server] Фоновый поток Hockey запущен.")


# ── Фоновый поток обновления floor-цен ────────────────────────────────────
def update_floors_loop():
    while True:
        try:
            update_nft_floors()
        except Exception as e:
            print(f"[NFT Update] Ошибка: {e}")
        time.sleep(3600)  # раз в час


nft_update_thread = threading.Thread(target=update_floors_loop, daemon=True)
nft_update_thread.start()
print("[Server] Фоновый поток обновления floor-цен запущен.")



# ── Serve React frontend ─────────────────────────────────────────────
@app.route('/')
def serve_index():
    return app.send_static_file('index.html')


if __name__ == "__main__":
    port = int(os.environ.get("PORT", 8000))
    debug = os.environ.get("DEBUG", "false").lower() == "true"
    socketio.run(app, host="0.0.0.0", port=port, debug=debug, allow_unsafe_werkzeug=True)
