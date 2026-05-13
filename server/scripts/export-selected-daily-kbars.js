import 'dotenv/config'
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import dns from 'node:dns/promises'
import mongoose from 'mongoose'
import RecognizedStock from '../models/RecognizedStock.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const serverRoot = path.resolve(__dirname, '..')
const projectRoot = path.resolve(serverRoot, '..')

const stockDbPath = process.env.STOCK_DATA_DB_PATH
  ? path.resolve(process.env.STOCK_DATA_DB_PATH)
  : path.join(projectRoot, 'stock_data.db')
const outputPath = process.env.DAILY_KBARS_JSON_PATH
  ? path.resolve(process.env.DAILY_KBARS_JSON_PATH)
  : path.join(serverRoot, 'data', 'teacher-selected-daily-kbars.json')

const run = async () => {
  if (!process.env.MONGODB_URI) {
    throw new Error('Missing MONGODB_URI in server/.env')
  }
  if (!fs.existsSync(stockDbPath)) {
    throw new Error(`Cannot find SQLite database: ${stockDbPath}`)
  }

  dns.setServers(['1.1.1.1'])
  await mongoose.connect(process.env.MONGODB_URI)

  const recommendations = await RecognizedStock.find({ source: 'system' })
    .sort({ createdAt: 1 })
    .lean()

  const codeSet = new Set(
    recommendations
      .map((stock) => stock.code?.toString().trim())
      .filter(Boolean)
  )
  const codes = [...codeSet].sort((a, b) => a.localeCompare(b, 'en'))

  if (codes.length === 0) {
    throw new Error('No teacher-selected stocks found in MongoDB')
  }

  const pythonScript = String.raw`
import json
import sqlite3
import sys

db_path = sys.argv[1]
payload = json.loads(sys.argv[2])
codes = payload["codes"]

conn = sqlite3.connect(db_path)
conn.row_factory = sqlite3.Row
cur = conn.cursor()

placeholders = ",".join(["?"] * len(codes))
stock_rows = cur.execute(
    f"SELECT code, name, exchange FROM stocks WHERE code IN ({placeholders}) ORDER BY code",
    codes,
).fetchall()
kbar_rows = cur.execute(
    f"""
    SELECT code, date, open, high, low, close, volume, amount
    FROM daily_kbars
    WHERE code IN ({placeholders})
    ORDER BY code, date
    """,
    codes,
).fetchall()

stocks = {row["code"]: dict(row) for row in stock_rows}
kbars_by_code = {code: [] for code in codes}
for row in kbar_rows:
    kbars_by_code.setdefault(row["code"], []).append({
        "date": row["date"],
        "open": row["open"],
        "high": row["high"],
        "low": row["low"],
        "close": row["close"],
        "volume": row["volume"],
        "amount": row["amount"],
    })

missing_codes = [code for code in codes if len(kbars_by_code.get(code, [])) == 0]

print(json.dumps({
    "stocks": stocks,
    "kbarsByCode": kbars_by_code,
    "missingCodes": missing_codes,
    "totalRows": len(kbar_rows),
}, ensure_ascii=False, separators=(",", ":")))
conn.close()
`

  const python = spawnSync(
    'python',
    ['-c', pythonScript, stockDbPath, JSON.stringify({ codes })],
    {
      encoding: 'utf8',
      maxBuffer: 1024 * 1024 * 200,
      env: { ...process.env, PYTHONUTF8: '1' },
    }
  )

  if (python.error) {
    throw python.error
  }
  if (python.status !== 0) {
    throw new Error(python.stderr || 'Python SQLite export failed')
  }

  const sqliteData = JSON.parse(python.stdout)
  const recommendationPayload = recommendations.map((stock) => ({
    id: stock._id.toString(),
    code: stock.code,
    support: stock.support,
    shortTermProfit: stock.shortTermProfit,
    waveProfit: stock.waveProfit,
    swapRef: stock.swapRef,
    currentPrice: stock.currentPrice,
    source: stock.source,
    isFavorite: stock.isFavorite,
    createdAt: stock.createdAt,
    updatedAt: stock.updatedAt,
  }))

  const output = {
    generatedAt: new Date().toISOString(),
    source: {
      mongoCollection: 'recognizedstocks',
      sqliteDatabase: path.basename(stockDbPath),
      sqliteTables: ['stocks', 'daily_kbars'],
    },
    summary: {
      recommendationCount: recommendationPayload.length,
      stockCount: codes.length,
      dailyKbarCount: sqliteData.totalRows,
      missingCodeCount: sqliteData.missingCodes.length,
      firstDate: null,
      lastDate: null,
    },
    codes,
    missingCodes: sqliteData.missingCodes,
    stocks: sqliteData.stocks,
    recommendations: recommendationPayload,
    kbarsByCode: sqliteData.kbarsByCode,
  }

  const allDates = Object.values(output.kbarsByCode)
    .flatMap((rows) => rows.length > 0 ? [rows[0].date, rows[rows.length - 1].date] : [])
    .sort()
  output.summary.firstDate = allDates[0] || null
  output.summary.lastDate = allDates[allDates.length - 1] || null

  fs.mkdirSync(path.dirname(outputPath), { recursive: true })
  fs.writeFileSync(outputPath, `${JSON.stringify(output, null, 2)}\n`, 'utf8')

  console.log(`Exported ${output.summary.dailyKbarCount} daily K rows`)
  console.log(`Teacher-selected stocks: ${output.summary.stockCount}`)
  console.log(`Recommendations: ${output.summary.recommendationCount}`)
  console.log(`Date range: ${output.summary.firstDate} ~ ${output.summary.lastDate}`)
  if (output.missingCodes.length > 0) {
    console.log(`Missing daily K codes: ${output.missingCodes.join(', ')}`)
  }
  console.log(`Output: ${outputPath}`)
}

run()
  .catch((error) => {
    console.error(error)
    process.exitCode = 1
  })
  .finally(async () => {
    if (mongoose.connection.readyState !== 0) {
      await mongoose.disconnect()
    }
  })
