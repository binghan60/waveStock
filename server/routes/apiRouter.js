import 'dotenv/config'
import express from 'express'
import RecognizedStock from '../models/RecognizedStock.js'
import { fetchStockData, getSystemStatus } from '../services/stockService.js'
import { getBacktestChart, getBacktestSummary, getBacktestTrades, getBacktestAll } from '../services/backtestService.js'
import * as line from '@line/bot-sdk'

const router = express.Router()
router.use(express.json())

// LINE Bot Client 初始化
const lineConfig = {
  channelAccessToken: process.env.CHANNEL_ACCESS_TOKEN,
  channelSecret: process.env.CHANNEL_SECRET,
}
const client = new line.Client(lineConfig)

// --- API 路由 ---

// 新增：推播訊息 API
router.post('/push-message', async (req, res) => {
  try {
    const expectedSecret = process.env.CRON_SECRET
    const providedSecret = (req.get('authorization') || '').replace(/^Bearer\s+/i, '')
    if (!expectedSecret || providedSecret !== expectedSecret) {
      return res.status(401).json({ error: 'Unauthorized' })
    }

    const { to, message } = req.body

    if (!to || !message) {
      return res.status(400).json({ error: '缺少 to 或 message 參數' })
    }

    await client.pushMessage(to, {
      type: 'text',
      text: message,
    })

    res.json({ success: true, message: '推播成功' })
  } catch (error) {
    console.error('❌ Push Message Error:', error.message)
    res.status(500).json({ error: '推播失敗', details: error.message })
  }
})


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
  res.json({
    ...getSystemStatus(),
    timestamp: new Date().toISOString(),
  })
})

router.get('/backtest/summary', (req, res) => {
  try {
    res.json(getBacktestSummary(req.query))
  } catch (error) {
    console.error('Backtest Summary Error:', error)
    res.status(500).json({ error: 'Backtest summary failed', details: error.message })
  }
})

router.get('/backtest/trades', (req, res) => {
  try {
    res.json(getBacktestTrades(req.query))
  } catch (error) {
    console.error('Backtest Trades Error:', error)
    res.status(500).json({ error: 'Backtest trades failed', details: error.message })
  }
})

router.get('/backtest/chart', (req, res) => {
  try {
    res.json(getBacktestChart(req.query))
  } catch (error) {
    console.error('Backtest Chart Error:', error)
    res.status(500).json({ error: 'Backtest chart failed', details: error.message })
  }
})

router.get('/backtest/all', (req, res) => {
  try {
    res.json(getBacktestAll(req.query))
  } catch (error) {
    console.error('Backtest All Error:', error)
    res.status(500).json({ error: 'Backtest all failed', details: error.message })
  }
})

router.get('/dashboard', async (req, res) => {
  try {
    // 取得圖片辨識的股票 (MongoDB)
    const recognizedStocks = await RecognizedStock.find({})
      .sort({ createdAt: -1 })
      .limit(200)

    res.json({
      recognizedStocks: recognizedStocks.map((stock) => ({
        ...stock.toObject(),
        market: null,
      })),
    })
  } catch (e) {
    console.error(e)
    res.status(500).json({ error: 'Server Error' })
  }
})

// ==================== 辨識股票相關 API ====================

// 📋 取得所有辨識過的股票（移除 30 天限制）
router.get('/recognized-stocks', async (req, res) => {
  try {
    const { source, isFavorite, limit = 200 } = req.query

    const query = {}
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
    const allowedFields = ['support', 'shortTermProfit', 'waveProfit', 'swapRef', 'source', 'isFavorite', 'currentPrice', 'isSuccess']
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
