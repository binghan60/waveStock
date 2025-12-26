// apiRoutes.js
import express from 'express'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import axios from 'axios'
import RecognizedStock from '../models/RecognizedStock.js'

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
  const baseUrl = 'https://mis.twse.com.tw/stock/api/getStockInfo.jsp'
  const results = []

  // 對每個股票代號進行查詢
  for (const id of stockIds) {
    try {
      // 1️⃣ 先嘗試上市 (tse)
      let ex_ch = `tse_${id}.tw`
      let url = `${baseUrl}?json=1&ex_ch=${ex_ch}&_=${Date.now()}`

      let response = await axios.get(url, {
        headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
        timeout: 6000,
      })

      // 2️⃣ 如果 msgArray 是空的或股票代號為空，嘗試上櫃 (otc)
      if (!response.data.msgArray || response.data.msgArray.length === 0 || !response.data.msgArray[0].c || response.data.msgArray[0].c === '') {
        ex_ch = `otc_${id}.tw`
        url = `${baseUrl}?json=1&ex_ch=${ex_ch}&_=${Date.now()}`

        response = await axios.get(url, {
          headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
          timeout: 6000,
        })
      }

      // 3️⃣ 解析資料（檢查 msgArray 存在且股票代號不為空）
      if (response.data.msgArray && response.data.msgArray.length > 0 && response.data.msgArray[0].c && response.data.msgArray[0].c !== '') {
        const msg = response.data.msgArray[0]

        // 價格判斷邏輯
        let currentPrice = msg.z // 當盤成交價

        if (currentPrice === '-') {
          // 如果沒有成交價，嘗試從委買價或委賣價取得
          if (msg.b && msg.b !== '-') {
            currentPrice = msg.b.split('_')[0] // 最佳買價
          } else if (msg.a && msg.a !== '-') {
            currentPrice = msg.a.split('_')[0] // 最佳賣價
          } else {
            currentPrice = msg.y // 使用昨收價
          }
        }

        results.push({
          symbol: msg.c, // 股票代號
          name: msg.n, // 公司簡稱
          currentPrice: currentPrice, // 處理過後的價格
          yesterdayClose: msg.y, // 昨收
          volume: msg.v, // 累積成交量
          time: msg.t, // 最近成交時刻
        })
      } else {
        console.log(`⚠️ ${id}: 上市和上櫃都查不到資料`)
      }
    } catch (error) {
      console.error(`❌ ${id}: 查詢失敗`, error.message)
    }
  }

  return results
}
// --- API 路由 ---

router.get('/dashboard', async (req, res) => {
  try {
    // 1. 取得手動新增的股票 (stocks.json)
    const stocks = loadStocks()

    // 2. 取得圖片辨識的股票 (MongoDB) - 只取 30 天內的
    const thirtyDaysAgo = new Date()
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)

    const recognizedStocks = await RecognizedStock.find({
      createdAt: { $gte: thirtyDaysAgo },
    })
      .sort({ createdAt: -1 })
      .limit(100)

    // 3. 收集所有需要查詢價格的股票代號
    const manualSymbols = stocks.map((s) => s.symbol)
    const recognizedSymbols = recognizedStocks.map((s) => s.code)
    const allSymbols = [...new Set([...manualSymbols, ...recognizedSymbols])] // 去重

    // 4. 如果沒有任何股票，回傳空物件
    if (allSymbols.length === 0) {
      return res.json({
        manualStocks: [],
        recognizedStocks: [],
      })
    }
    // 5. 去證交所抓價格
    const prices = await fetchStockData(allSymbols)
    // 6. 合併手動新增的股票資料
    const manualResult = stocks.map((stock) => {
      const priceData = prices.find((p) => p.symbol === stock.symbol)
      return {
        ...stock, // 包含 id, createdAt, type
        market: priceData || null, // 包含 currentPrice, yesterdayClose
      }
    })

    // 7. 合併圖片辨識的股票資料
    const recognizedResult = recognizedStocks.map((stock) => {
      const priceData = prices.find((p) => p.symbol === stock.code)
      return {
        ...stock.toObject(), // 轉換 MongoDB 物件
        market: priceData || null, // 包含即時價格資訊
      }
    })

    // 8. 回傳分類後的資料
    res.json({
      manualStocks: manualResult,
      recognizedStocks: recognizedResult,
    })
  } catch (e) {
    console.error(e)
    res.status(500).json({ error: 'Server Error' })
  }
})

router.post('/stocks', (req, res) => {
  // 接收 type 參數，如果沒傳預設就是 'manual'
  const { symbol, type = 'manual' } = req.body

  if (!symbol) return res.status(400).json({ error: 'Empty symbol' })

  const stocks = loadStocks()

  // 檢查是否已存在
  const exists = stocks.find((s) => s.symbol === symbol)
  if (exists) {
    return res.status(400).json({ error: '已存在' })
  }

  const newStock = {
    id: Date.now(),
    symbol: symbol.toUpperCase(),
    type: type, // ✨ 核心修改：紀錄來源 (auto / manual)
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

// ==================== 辨識股票相關 API ====================

// 📋 取得所有辨識過的股票（只顯示 30 天內的）
router.get('/recognized-stocks', async (req, res) => {
  try {
    const { source, isFavorite, limit = 100 } = req.query

    // 計算 30 天前的日期
    const thirtyDaysAgo = new Date()
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)

    const query = {
      createdAt: { $gte: thirtyDaysAgo }, // 只取 30 天內的
    }
    if (source) query.source = source
    if (isFavorite !== undefined) query.isFavorite = isFavorite === 'true'

    const stocks = await RecognizedStock.find(query).sort({ createdAt: -1 }).limit(parseInt(limit))

    res.json(stocks)
  } catch (error) {
    console.error('❌ 查詢辨識股票失敗:', error)
    res.status(500).json({ error: 'Server Error' })
  }
})

// 🔍 根據股票代號查詢辨識記錄
router.get('/recognized-stocks/:code', async (req, res) => {
  try {
    const { code } = req.params
    const stocks = await RecognizedStock.find({ code }).sort({ createdAt: -1 })

    if (stocks.length === 0) {
      return res.status(404).json({ error: '找不到該股票代號的辨識記錄' })
    }

    res.json(stocks)
  } catch (error) {
    console.error('❌ 查詢股票代號失敗:', error)
    res.status(500).json({ error: 'Server Error' })
  }
})

// ⭐ 切換自選股狀態
router.patch('/recognized-stocks/:id/favorite', async (req, res) => {
  try {
    const { id } = req.params
    const { isFavorite } = req.body

    const stock = await RecognizedStock.findByIdAndUpdate(id, { isFavorite: isFavorite !== undefined ? isFavorite : true }, { new: true })

    if (!stock) {
      return res.status(404).json({ error: '找不到該辨識記錄' })
    }

    res.json({ success: true, stock })
  } catch (error) {
    console.error('❌ 更新自選股狀態失敗:', error)
    res.status(500).json({ error: 'Server Error' })
  }
})

// 🔄 更新辨識股票資料
router.patch('/recognized-stocks/:id', async (req, res) => {
  try {
    const { id } = req.params
    const updates = req.body

    // 允許更新的欄位
    const allowedFields = ['support', 'shortTermProfit', 'waveProfit', 'swapRef', 'source', 'isFavorite']
    const updateData = {}

    allowedFields.forEach((field) => {
      if (updates[field] !== undefined) {
        updateData[field] = updates[field]
      }
    })

    const stock = await RecognizedStock.findByIdAndUpdate(id, updateData, { new: true, runValidators: true })

    if (!stock) {
      return res.status(404).json({ error: '找不到該辨識記錄' })
    }

    res.json({ success: true, stock })
  } catch (error) {
    console.error('❌ 更新辨識股票失敗:', error)
    res.status(500).json({ error: 'Server Error' })
  }
})

// 🗑️ 刪除辨識記錄
router.delete('/recognized-stocks/:id', async (req, res) => {
  try {
    const { id } = req.params
    const stock = await RecognizedStock.findByIdAndDelete(id)

    if (!stock) {
      return res.status(404).json({ error: '找不到該辨識記錄' })
    }

    res.json({ success: true })
  } catch (error) {
    console.error('❌ 刪除辨識記錄失敗:', error)
    res.status(500).json({ error: 'Server Error' })
  }
})

// 📊 取得統計資訊
router.get('/recognized-stocks/stats/summary', async (req, res) => {
  try {
    const total = await RecognizedStock.countDocuments()
    const systemRecommended = await RecognizedStock.countDocuments({ source: 'system' })
    const userSelected = await RecognizedStock.countDocuments({ source: 'user' })
    const favorites = await RecognizedStock.countDocuments({ isFavorite: true })

    res.json({
      total,
      systemRecommended,
      userSelected,
      favorites,
    })
  } catch (error) {
    console.error('❌ 取得統計失敗:', error)
    res.status(500).json({ error: 'Server Error' })
  }
})

export default router
