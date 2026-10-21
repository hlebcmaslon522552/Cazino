from flask import Flask, request, jsonify
from flask_cors import CORS
import sqlite3
import os

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


if __name__ == '__main__':
    init_db()
    print("Сервер запущен на http://0.0.0.0:8000")
    app.run(host='0.0.0.0', port=8000, debug=True)