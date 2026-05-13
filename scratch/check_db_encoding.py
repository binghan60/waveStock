import sqlite3
import json

conn = sqlite3.connect("stock_data.db")
conn.row_factory = sqlite3.Row
cur = conn.cursor()

row = cur.execute("SELECT code, name FROM stocks LIMIT 10").fetchall()
for r in row:
    print(f"{r['code']}: {r['name']}")
conn.close()
