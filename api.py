# api.py — Локальный мок-API для React-приложения (работает с заглушками)
# Не связан с папкой nft_bot.
#
# Запуск:
#   pip install fastapi uvicorn
#   python api.py

import json
import logging
from typing import Optional

import uvicorn
from fastapi import FastAPI, Header, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

logging.basicConfig(level=logging.INFO, format="%(asctime)s | %(levelname)s | %(message)s")
log = logging.getLogger("Mock-API")

app = FastAPI(title="React Mock API")

# CORS — разрешаем всё для разработки
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ======================= Мок-данные =======================

MOCK_INVENTORY = [
    {
        "id": 1,
        "model": "Plush Pepe",
        "image": "https://nft.fragment.com/gift/plushpepe-1.large.jpg",
        "floor": 5500.0,
    },
    {
        "id": 2,
        "model": "Hex Pot",
        "image": "https://nft.fragment.com/gift/hexpot-1.large.jpg",
        "floor": 28.4,
    },
    {
        "id": 3,
        "model": "Loot Bag",
        "image": "https://nft.fragment.com/gift/lootbag-1.large.jpg",
        "floor": 88.0,
    },
]

MOCK_BALANCE_TON = 15.0
MOCK_BALANCE_STARS = 500


# ======================= Модели запросов =======================

class SellRequest(BaseModel):
    item_id: int


# ======================= Эндпоинты =======================

@app.get("/api/balance")
def get_balance(x_init_data: str = Header(default="")):
    log.info("GET /api/balance — init_data length: %s", len(x_init_data))
    return {
        "balance_ton": MOCK_BALANCE_TON,
        "balance_stars": MOCK_BALANCE_STARS,
        "inventory_count": len(MOCK_INVENTORY),
    }


@app.get("/api/inventory")
def get_inventory(x_init_data: str = Header(default="")):
    log.info("GET /api/inventory — init_data length: %s", len(x_init_data))
    return MOCK_INVENTORY


@app.post("/api/sell_nft")
def sell_nft(req: SellRequest, x_init_data: str = Header(default="")):
    log.info("POST /api/sell_nft — item_id=%s", req.item_id)
    # Ищем предмет в мок-данных
    item = next((i for i in MOCK_INVENTORY if i["id"] == req.item_id), None)
    if item is None:
        raise HTTPException(status_code=404, detail="Предмет не найден")

    new_balance = round(MOCK_BALANCE_TON + item["floor"], 2)
    return {"success": True, "new_balance": new_balance}


@app.get("/health")
def health():
    return {"status": "ok"}


# ======================= Запуск =======================

if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=8000)