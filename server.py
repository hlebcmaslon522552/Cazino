from flask import Flask, request, jsonify
from flask_cors import CORS
import sqlite3
import os
import requests

BOT_TOKEN = "8837626872:AAEEqnmT-hEKwMOhTfZ9LDLmOu7AHi88Pzw"

app = Flask(__name__)
CORS(app)  # Разрешаем запросы с фронтенда

# Путь к файлу базы данных в корне проекта (не зависит от текущей директории запуска)
DB_FILE = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'test.db')


def init_db():
    """Создаёт таблицу users (если её нет) и добавляет тестового пользователя."""
    conn = sqlite3.connect(DB_FILE)
    try:
        cursor = conn.cursor()
        # Создаем таблицу пользователей
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS users (
                id TEXT PRIMARY KEY,
                balance_ton REAL DEFAULT 100.0
            )
        ''')
        # Создаем тестового юзера (твой ID)
        cursor.execute(
            'INSERT OR IGNORE INTO users (id, balance_ton) VALUES (?, ?)',
            ('6267608438', 100.0),
        )
        conn.commit()
    finally:
        conn.close()


@app.route('/')
def home():
    return jsonify({"status": "ok", "message": "Casino Backend is running!"})


@app.route('/api/balance', methods=['GET'])
def get_balance():
    user_id = request.args.get('user_id', '6267608438')  # Если ID не передан, берем дефолтный
    conn = sqlite3.connect(DB_FILE)
    try:
        cursor = conn.cursor()
        cursor.execute('SELECT balance_ton FROM users WHERE id = ?', (user_id,))
        result = cursor.fetchone()
    finally:
        conn.close()

    if result:
        return jsonify({"balance": result[0]})
    return jsonify({"error": "User not found"}), 404


@app.route('/api/create_invoice', methods=['POST'])
def create_invoice():
    """Создаёт инвойс для оплаты Telegram Stars."""
    data = request.get_json()
    if not data:
        return jsonify({"error": "Invalid JSON"}), 400

    user_id = data.get('user_id', '')
    amount = data.get('amount', 0)

    if not isinstance(amount, int) or amount < 1:
        return jsonify({"error": "Amount must be a positive integer"}), 400

    payload_str = f"topup_{user_id}_{amount}"
    url = f"https://api.telegram.org/bot{BOT_TOKEN}/createInvoiceLink"

    payload = {
        "title": "Пополнение баланса",
        "description": f"Покупка {amount} Stars",
        "payload": payload_str,
        "currency": "XTR",
        "prices": [{"label": "Stars", "amount": amount}]
    }

    try:
        resp = requests.post(url, json=payload, timeout=15)
        resp.raise_for_status()
        result = resp.json()
        if result.get("ok"):
            return jsonify({"invoiceLink": result["result"]})
        else:
            return jsonify({"error": result.get("description", "Telegram API error")}), 400
    except requests.exceptions.RequestException as e:
        return jsonify({"error": f"Telegram API request failed: {str(e)}"}), 502


if __name__ == '__main__':
    init_db()
    print("Сервер запущен на http://0.0.0.0:8000")
    app.run(host='0.0.0.0', port=8000, debug=True)