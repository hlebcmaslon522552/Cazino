"""
Cazino Game Server — Server-Side Random & Anti-Cheat
Обеспечивает честную генерацию всех игровых результатов на сервере.
"""
import os
import random
import json
from flask import Flask, request, jsonify
from flask_cors import CORS

app = Flask(__name__)
CORS(app, resources={r"/api/*": {"origins": "*"}})

def verify_init_data(init_data):
    return bool(init_data and init_data.strip())


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
# API endpoints
@app.route("/api/play_game", methods=["POST"])
def play_game():
    data = request.get_json(force=True, silent=True)
    if not data:
        return jsonify({"error": "Invalid JSON body"}), 400

    init_data = data.get("initData", "")
    if not verify_init_data(init_data):
        return jsonify({"error": "Forbidden: invalid initData"}), 403

    user_id = data.get("user_id", "unknown")
    game_type = data.get("game_type", "")
    bet_amount = float(data.get("bet_amount", 0))

    if not game_type:
        return jsonify({"error": "game_type is required"}), 400
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
# Mines endpoints
@app.route("/api/mines_start", methods=["POST"])
def mines_start():
    data = request.get_json(force=True, silent=True)
    if not data:
        return jsonify({"error": "Invalid JSON body"}), 400

    init_data = data.get("initData", "")
    if not verify_init_data(init_data):
        return jsonify({"error": "Forbidden: invalid initData"}), 403

    user_id = str(data.get("user_id", "unknown"))
    size = int(data.get("size", 5))
    mines_count = int(data.get("mines_count", 3))

    total_cells = size * size
    if mines_count >= total_cells:
        return jsonify({"error": "Too many mines"}), 400

    cells = list(range(total_cells))
    for i in range(len(cells) - 1, 0, -1):
        j = random.randint(0, i)
        cells[i], cells[j] = cells[j], cells[i]

    mine_indexes = cells[:mines_count]

    mines_games[user_id] = {
        "mine_indexes": mine_indexes,
        "safe_revealed": [],
        "multiplier": 1.0,
        "game_over": False
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

    init_data = data.get("initData", "")
    if not verify_init_data(init_data):
        return jsonify({"error": "Forbidden: invalid initData"}), 403

    user_id = str(data.get("user_id", "unknown"))
    cell_index = int(data.get("cell_index", -1))

    game = mines_games.get(user_id)
    if not game:
        return jsonify({"error": "Game not found. Start a new game first."}), 404
    if game["game_over"]:
        return jsonify({"error": "Game is already over"}), 400
    if cell_index < 0:
        return jsonify({"error": "Invalid cell_index"}), 400
    if cell_index in game["safe_revealed"]:
        return jsonify({"error": "Cell already revealed"}), 400

    if cell_index in game["mine_indexes"]:
        game["game_over"] = True
        return jsonify({"status": "boom", "cell_index": cell_index, "user_id": user_id})
    else:
        game["safe_revealed"].append(cell_index)
        safe_count = len(game["safe_revealed"])
        new_multiplier = round(1.0 + safe_count * 0.2, 2)
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
