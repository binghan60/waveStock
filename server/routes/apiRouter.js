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

// --- 快取系統 ---
const stockPriceCache = new Map()
const CACHE_TTL = 30000 // 30秒快取時間
let lastRequestTime = 0
const MIN_REQUEST_INTERVAL = 3000 // 最小請求間隔 3秒

// 清理過期快取
function cleanExpiredCache() {
  const now = Date.now()
  for (const [key, value] of stockPriceCache.entries()) {
    if (now - value.timestamp > CACHE_TTL) {
      stockPriceCache.delete(key)
    }
  }
}

// 定期清理快取（每分鐘）
setInterval(cleanExpiredCache, 60000)

// 判斷是否為交易時段
function isTradingHours() {
  const now = new Date()
  const taipei = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Taipei' }))
  const day = taipei.getDay() // 0=週日, 6=週六
  const hour = taipei.getHours()
  const minute = taipei.getMinutes()
  const time = hour * 60 + minute // 轉換為分鐘數

  // 週末不交易
  if (day === 0 || day === 6) return false

  // 交易時間：09:00-13:30 (540-810分鐘)
  const marketOpen = 9 * 60 // 09:00
  const marketClose = 13 * 60 + 30 // 13:30

  return time >= marketOpen && time <= marketClose
}

// 取得建議的快取時間（根據交易時段）
function getRecommendedCacheTTL() {
  if (isTradingHours()) {
    return 2500 // 交易時段：2.5秒
  } else {
    const now = new Date()
    const taipei = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Taipei' }))
    const hour = taipei.getHours()

    // 盤後時段 13:30-18:00：2分鐘
    if (hour >= 13 && hour < 18) {
      return 120000
    }
    // 非交易時段：5分鐘
    return 300000
  }
}

// --- 證交所爬蟲邏輯（加入錯誤重試）---
async function fetchStockDataWithRetry(stockIds, retryCount = 0) {
  const baseUrl = 'https://mis.twse.com.tw/stock/api/getStockInfo.jsp'
  const MAX_RETRIES = 2
  const RETRY_DELAY = 1000 // 1秒

  // 1️⃣ 組合查詢字串
  const queryParams = stockIds.map((id) => `tse_${id}.tw|otc_${id}.tw`).join('|')
  const url = `${baseUrl}?json=1&ex_ch=${queryParams}&_=${Date.now()}`

  try {
    const response = await axios.get(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
      timeout: 10000,
    })
    const msgArray = response.data.msgArray

    if (!msgArray || msgArray.length === 0) {
      console.log('⚠️ API 回傳空資料')
      return []
    }

    // 2️⃣ 處理回傳資料
    const results = msgArray
      .filter((msg) => msg.c && msg.c !== '' && msg.n && msg.n !== '')
      .map((msg) => {
        let currentPrice = msg.z

        if (currentPrice === '-') {
          if (msg.b && msg.b !== '-') {
            currentPrice = msg.b.split('_')[0]
          } else if (msg.a && msg.a !== '-') {
            currentPrice = msg.a.split('_')[0]
          } else {
            currentPrice = msg.y
          }
        }

        return {
          symbol: msg.c,
          name: msg.n,
          currentPrice: currentPrice,
          yesterdayClose: msg.y,
          volume: msg.v,
          time: msg.t,
          fullKey: msg.ch,
        }
      })

    return results
  } catch (error) {
    console.error(`❌ 批量查詢失敗 (嘗試 ${retryCount + 1}/${MAX_RETRIES + 1})`, error.message)

    // 如果還有重試次數，則延遲後重試
    if (retryCount < MAX_RETRIES) {
      await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY * (retryCount + 1)))
      return fetchStockDataWithRetry(stockIds, retryCount + 1)
    }

    return []
  }
}

// 主要的股票數據獲取函數（帶快取和節流）
async function fetchStockData(stockIds) {
  if (!stockIds || stockIds.length === 0) return []

  // 生成快取鍵（排序後確保一致性）
  const cacheKey = stockIds.sort().join(',')

  // 1️⃣ 檢查快取
  const cached = stockPriceCache.get(cacheKey)
  const recommendedTTL = getRecommendedCacheTTL()

  if (cached && Date.now() - cached.timestamp < recommendedTTL) {
    console.log(`✅ 使用快取數據 (剩餘 ${Math.round((recommendedTTL - (Date.now() - cached.timestamp)) / 1000)}秒)`)
    return cached.data
  }

  // 2️⃣ 請求節流保護
  const now = Date.now()
  const timeSinceLastRequest = now - lastRequestTime

  if (timeSinceLastRequest < MIN_REQUEST_INTERVAL) {
    const waitTime = MIN_REQUEST_INTERVAL - timeSinceLastRequest
    console.log(`⏱️ 請求節流：等待 ${waitTime}ms`)
    await new Promise((resolve) => setTimeout(resolve, waitTime))
  }

  // 3️⃣ 呼叫 API（帶重試機制）
  console.log(`🌐 呼叫證交所 API (${stockIds.length} 支股票)`)
  lastRequestTime = Date.now()
  const data = await fetchStockDataWithRetry(stockIds)

  // 4️⃣ 存入快取
  stockPriceCache.set(cacheKey, {
    data,
    timestamp: Date.now(),
  })

  // 5️⃣ 限制快取大小
  if (stockPriceCache.size > 50) {
    const firstKey = stockPriceCache.keys().next().value
    stockPriceCache.delete(firstKey)
  }

  return data
} // --- API 路由 ---

// 新增：專門用來獲取股價的 API
router.post('/stock-prices', async (req, res) => {
  try {
    const { symbols } = req.body

    if (!symbols || !Array.isArray(symbols) || symbols.length === 0) {
      return res.json([])
    }

    const prices = await fetchStockData(symbols)
    res.json(prices)
  } catch (e) {
    console.error('Fetch Stock Prices Error:', e)
    res.status(500).json({ error: 'Server Error' })
  }
})

// 新增：系統狀態監控 API
router.get('/system-status', (req, res) => {
  const cacheStats = {
    cacheSize: stockPriceCache.size,
    cacheKeys: Array.from(stockPriceCache.keys()),
    cacheDetails: Array.from(stockPriceCache.entries()).map(([key, value]) => ({
      key,
      age: Math.round((Date.now() - value.timestamp) / 1000),
      itemCount: value.data.length,
    })),
  }

  const tradingStatus = {
    isTradingHours: isTradingHours(),
    recommendedCacheTTL: getRecommendedCacheTTL(),
    timeSinceLastRequest: lastRequestTime ? Date.now() - lastRequestTime : null,
  }

  res.json({
    cache: cacheStats,
    trading: tradingStatus,
    timestamp: new Date().toISOString(),
  })
})

router.get('/dashboard', async (req, res) => {
  try {
    // 取得圖片辨識的股票 (MongoDB) - 只取 30 天內的
    const thirtyDaysAgo = new Date()
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)

    const recognizedStocks = await RecognizedStock.find({
      createdAt: { $gte: thirtyDaysAgo },
    })
      .sort({ createdAt: -1 })
      .limit(100)

    // 合併範例股票和真實辨識股票
    const allRecognizedStocks = [...recognizedStocks.map((s) => s.toObject())]
    // 只回傳辨識股票資料，不包含 manualStocks
    const recognizedResult = allRecognizedStocks.map((stock) => ({
      ...stock,
      market: null, // 前端會自行呼叫 /stock-prices 獲取價格
    }))

    // 回傳辨識股票資料
    res.json({
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

const chunkArray = (arr, size) => {
  return Array.from({ length: Math.ceil(arr.length / size) }, (v, i) => arr.slice(i * size, i * size + size))
}

// 檢查股票是否觸及短線目標
router.post('/check-targets', async (req, res) => {
  try {
    console.log('🎯 開始檢查所有股票是否觸及短線目標 (使用即時行情)...')

    // 1. 找出所有未達標且有設定目標的股票
    const stocks = await RecognizedStock.find({
      isSuccess: null,
      shortTermProfit: { $exists: true, $ne: null },
    })
console.log(stocks)
    if (stocks.length === 0) {
      return res.json({ success: true, message: '沒有待檢查的股票', checked: 0, updated: 0 })
    }

    console.log(`📊 找到 ${stocks.length} 支待檢查的股票`)

    let updatedCount = 0
    const results = []

    // 2. 將股票分組，每組 20 支 (MIS API URL 有長度限制)
    // 注意：這裡預設為上市(tse)，若你的 DB 有區分上櫃，需動態組出 'otc_xxxx.tw'
    const chunks = chunkArray(stocks, 20)

    for (const chunk of chunks) {
      // 3. 組合查詢字串：tse_2330.tw|tse_2317.tw|...
      const queryStr = chunk.map((s) => `tse_${s.code}.tw`).join('|')
      const url = `https://mis.twse.com.tw/stock/api/getStockInfo.jsp?ex_ch=${queryStr}`

      try {
        // 加入 Timestamp 防止 cache
        const response = await axios.get(`${url}&_=${Date.now()}`, {
          headers: { 'User-Agent': 'Mozilla/5.0' }, // 加上 User-Agent 比較保險
        })

        const msgArray = response.data.msgArray || []

        // 4. 遍歷回傳的即時資料
        for (const stockInfo of msgArray) {
          if (!stockInfo.h || stockInfo.h === '-') continue // 剛開盤可能沒最高價

          const code = stockInfo.c // 股票代號
          const currentHigh = parseFloat(stockInfo.h) // 當日最高價 (High)
          const currentPrice = parseFloat(stockInfo.z) // 目前成交價 (Recent)

          // 找到對應的 DB 資料
          const dbStock = stocks.find((s) => s.code === code)
          if (!dbStock) continue

          const targetPrice = parseFloat(dbStock.shortTermProfit)

          console.log(`🔍 ${code} 當日最高: ${currentHigh} / 目標: ${targetPrice}`)

          let isSuccess = false
          let reason = ''

          // 5. 判斷邏輯
          if (currentHigh >= targetPrice) {
            isSuccess = true
            reason = `最高價 ${currentHigh} 已觸及目標 ${targetPrice}`
            console.log(`✅ ${code} 達標！`)

            // 更新 DB
            dbStock.isSuccess = true
            await dbStock.save()
            updatedCount++
          } else {
            reason = `尚未觸及 (最高: ${currentHigh})`
          }

          results.push({
            code,
            success: isSuccess,
            highPrice: currentHigh,
            currentPrice, // 多回傳一個現價供參考
            targetPrice,
            reason,
          })
        }
      } catch (err) {
        console.error(`❌ 批次查詢失敗:`, err.message)
      }

      // 每批次中間休息 1 秒，雖然 MIS 較寬鬆，但還是禮貌性 delay
      await new Promise((r) => setTimeout(r, 1000))
    }

    console.log(`🎉 檢查完成！更新 ${updatedCount} 支`)

    res.json({
      success: true,
      message: '檢查完成',
      checked: stocks.length,
      updated: updatedCount,
      results,
    })
  } catch (error) {
    console.error('❌ 系統錯誤:', error.message)
    res.status(500).json({ success: false, message: error.message })
  }
})
export default router
