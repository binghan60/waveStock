import sqlite3

conn = sqlite3.connect("stock_data.db")
cur = conn.cursor()

row = cur.execute("SELECT code, name FROM stocks WHERE code = '1519'").fetchone()
if row:
    code, name = row
    print(f"Code: {code}")
    print(f"Name (raw): {name}")
    try:
        if isinstance(name, str):
            print(f"Name (hex): {name.encode('utf-8').hex()}")
        else:
            print(f"Name (hex): {name.hex()}")
    except Exception as e:
        print(f"Error hex: {e}")

conn.close()
