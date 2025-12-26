// apiRoutes.js
import express from 'express'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import axios from 'axios'

const router = express.Router()
router.use(express.json())

// --- 檔案資料庫設定 ---
const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const DB_FILE = path.join(__dirname, 'stocks.json')

// 讀取資料
function loadStocks() {
  if (!fs.existsSync(DB_FILE)) return []
  const data = fs.readFileSync(DB_FILE, 'utf-8')
  return data ? JSON.parse(data) : []
}

// 寫入資料
function saveStocks(data) {
  fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2), 'utf-8')
}

// --- 證交所爬蟲邏輯 ---
async function fetchStockData(stockIds) {
  // 1. 網址組裝 (維持之前的邏輯)
  const queryParts = stockIds.map((id) => {
    let prefix = 'tse'
    if ((id.startsWith('6') || id.startsWith('8')) && id.length > 2) {
      if (!['6505', '6415', '6669'].includes(id)) prefix = 'otc'
    }
    return `${prefix}_${id}.tw`
  })

  const ex_ch = queryParts.join('|')
  const baseUrl = 'https://mis.twse.com.tw/stock/api/getStockInfo.jsp'
  // 注意：實際請求時需加上 timestamp 以免被快取
  const url = `${baseUrl}?json=1&delay=0&ex_ch=${ex_ch}&_=${Date.now()}`

  try {
    const response = await axios.get(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
      timeout: 6000,
    })
    console.log(response.data)
    if (!response.data.msgArray) return []

    // 2. 解析資料 (配合你提供的圖片與 JSON)
    return response.data.msgArray.map((msg) => {
      // --- 核心修正：價格判斷邏輯 ---
      let currentPrice = msg.z // 嘗試取得 'z' 當盤成交價

      // 如果成交價是 "-" (如你 JSON 中的情況)，嘗試從最佳買價(b)或賣價(a)取得
      if (currentPrice === '-') {
        // msg.b 格式: "591.0000_590.0000_..."，我們取第一個
        if (msg.b && msg.b !== '-') {
          currentPrice = msg.b.split('_')[0]
        } else if (msg.a && msg.a !== '-') {
          currentPrice = msg.a.split('_')[0] // 取最佳賣價
        } else {
          currentPrice = msg.y // 真的都沒有，就用昨收價
        }
      }

      return {
        symbol: msg.c, // 股票代號
        name: msg.n, // 公司簡稱
        currentPrice: currentPrice, // 處理過後的價格
        yesterdayClose: msg.y, // 昨收 (用來算漲跌顏色)
        volume: msg.v, // 累積成交量
        time: msg.t, // 最近成交時刻 HH:MM:SS
      }
    })
  } catch (error) {
    console.error('TWSE Fetch Error:', error.message)
    return []
  }
}
// --- API 路由 ---

router.get('/dashboard', async (req, res) => {
  try {
    const stocks = loadStocks()
    if (stocks.length === 0) {
      return res.json([])
    }

    // 取得所有代號
    const symbols = stocks.map((s) => s.symbol)

    // 去證交所抓價格
    const prices = await fetchStockData(symbols)

    // 合併資料：把 DB 的日期跟 API 的股價合在一起
    const result = stocks.map((stock) => {
      const priceData = prices.find((p) => p.symbol === stock.symbol)
      return {
        ...stock, // 包含 id, createdAt
        market: priceData || null, // 包含 currentPrice, yesterdayClose
      }
    })

    res.json(result)
  } catch (e) {
    console.error(e)
    res.status(500).json({ error: 'Server Error' })
  }
})

router.post('/stocks', (req, res) => {
  const { symbol } = req.body
  if (!symbol) return res.status(400).json({ error: 'Empty symbol' })

  const stocks = loadStocks()
  if (stocks.find((s) => s.symbol === symbol)) {
    return res.status(400).json({ error: '已存在' })
  }

  const newStock = {
    id: Date.now(),
    symbol: symbol,
    createdAt: new Date().toISOString(),
  }

  stocks.push(newStock)
  saveStocks(stocks)
  res.json({ success: true })
})

router.delete('/stocks/:id', (req, res) => {
  const id = parseInt(req.params.id)
  let stocks = loadStocks()
  stocks = stocks.filter((s) => s.id !== id)
  saveStocks(stocks)
  res.json({ success: true })
})

router.patch('/stocks/:id/extend', (req, res) => {
  const id = parseInt(req.params.id)
  const stocks = loadStocks()
  const stock = stocks.find((s) => s.id === id)

  if (stock) {
    stock.createdAt = new Date().toISOString()
    saveStocks(stocks)
    res.json({ success: true })
  } else {
    res.status(404).json({ error: 'Not found' })
  }
})

export default router
