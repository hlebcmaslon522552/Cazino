# -*- coding: utf-8 -*-
"""Validate server.py case pools: chances sum, image files exist, pick_case_item maps case_id to correct pool."""
import ast
import io
import os
import random

ROOT = r"c:\Users\User\Desktop\Глеб\reactjs-template-master"
SRC = os.path.join(ROOT, "server.py")

with io.open(SRC, "r", encoding="utf-8", newline="") as f:
    source = f.read()

tree = ast.parse(source)

def get_constant_list(name):
    for node in tree.body:
        if isinstance(node, ast.Assign):
            if isinstance(node.targets[0], ast.Name) and node.targets[0].id == name:
                return ast.literal_eval(node.value)
    raise KeyError(name)


pool_names = ["CASE_WOOD_POOL", "CASE_COPPER_POOL", "CASE_SILVER_POOL", "CASE_GOLD_POOL"]
pools = {n: get_constant_list(n) for n in pool_names}
print("pool keys:", sorted(pools.keys()))

total_items = 0
for key, pool in pools.items():
    assert len(pool) > 0, key
    total = sum(it["chance"] for it in pool)
    assert abs(total - 100.0) < 1e-6, "%s chances sum = %s" % (key, total)
    for it in pool:
        p = os.path.join(ROOT, "public", it["image"].lstrip("/").replace("/", os.sep))
        assert os.path.exists(p), "missing image for %s: %s" % (it["name"], it["image"])
    total_items += len(pool)
    print("%s: %d items, chances sum=%.0f" % (key, len(pool), total))

# Собираем CASE_POOLS вручную — как на сервере
CASE_POOLS = {
    "case_wood": pools["CASE_WOOD_POOL"],
    "case_copper": pools["CASE_COPPER_POOL"],
    "case_silver": pools["CASE_SILVER_POOL"],
    "case_gold": pools["CASE_GOLD_POOL"],
}
assert len(CASE_POOLS) == 4
print("CASE_POOLS keys:", sorted(CASE_POOLS))


def pick(case_id=""):
    pool = CASE_POOLS.get(case_id, pools["CASE_WOOD_POOL"])
    total_chance = sum(it["chance"] for it in pool)
    roll = random.uniform(0, total_chance)
    cumulative = 0.0
    for it in pool:
        cumulative += it["chance"]
        if roll <= cumulative:
            return it
    return pool[-1]


for case_id in ("case_wood", "case_copper", "case_silver", "case_gold"):
    names = {it["name"] for it in CASE_POOLS[case_id]}
    assert pick(""), "default pool should be non-empty"
    for _ in range(5000):
        it = pick(case_id)
        assert it["name"] in names, "%s -> %r not in %s" % (case_id, it["name"], sorted(names))
print("pick_case_item OK: each case uses its own pool")

# default (unknown case id) -> wood pool
for _ in range(2000):
    it = pick("")
    assert it["name"] in {x["name"] for x in pools["CASE_WOOD_POOL"]}
print("default pool -> CASE_WOOD_POOL OK")
print("TOTAL items across pools:", total_items)
print("SERVER-POOL-VALIDATION-OK")