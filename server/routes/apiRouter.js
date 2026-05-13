import 'dotenv/config'
import express from 'express'
import RecognizedStock from '../models/RecognizedStock.js'
import StockHitLog from '../models/StockHitLog.js'
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


/**
 * 核心邏輯 A：檢查股價是否觸及目標，並寫入 Log
 * @returns {Promise<Array>} 回傳此次檢查觸發的新紀錄列表
 */
async function checkAndLogStockHits(stockDataList) {
  const symbols = stockDataList.map((s) => s.symbol)
  const stocksInDb = await RecognizedStock.find({ code: { $in: symbols } })

  const startOfToday = new Date()
  startOfToday.setHours(0, 0, 0, 0)
  // 產生今天的日期字串 (YYYY-MM-DD)，用於資料庫唯一索引去重
  const dateStr = startOfToday.toISOString().split('T')[0]

  const newHits = []

  for (const stockInfo of stockDataList) {
    // 取得當前價格 (已經由 stockService 處理過漲跌停邏輯)
    const price = parseFloat(stockInfo.currentPrice)

    // 如果連現價都沒有，那就真的沒辦法比對了，跳過
    if (!price || isNaN(price) || price <= 0) continue

    const code = stockInfo.symbol

    // 處理最高價與最低價：如果 API 回傳無效 (例如漲停鎖死時 h 為 '-')，就用現價遞補
    let currentHigh = parseFloat(stockInfo.high)
    let currentLow = parseFloat(stockInfo.low)

    if (isNaN(currentHigh) || currentHigh <= 0) currentHigh = price
    if (isNaN(currentLow) || currentLow <= 0) currentLow = price

    const dbStock = stocksInDb.find((s) => s.code === code)
    if (!dbStock) continue

    // 0. 判斷漲跌停狀態
    let status = ''
    const yesterdayClose = parseFloat(stockInfo.yesterdayClose)
    if (yesterdayClose && yesterdayClose > 0) {
      const diffPercent = (price - yesterdayClose) / yesterdayClose
      if (diffPercent >= 0.095) status = '(🔥漲停)'
      else if (diffPercent <= -0.095) status = '(💚跌停)'
    }

    // 1. 先收集所有「潛在」觸發項目 (不立即寫入 DB)
    const potentialHits = []

    const checkCondition = (type, targetValStr, compareVal, compareType) => {
      if (!targetValStr) return
      const threshold = parseTargetPrice(targetValStr, type)
      if (threshold === null) return

      const isHit = compareType === 'gte' ? compareVal >= threshold : compareVal <= threshold
      if (isHit) {
        potentialHits.push({ type, threshold, compareVal })
      }
    }

    checkCondition('support', dbStock.support, currentLow, 'lte')
    checkCondition('swap', dbStock.swapRef, currentLow, 'lte')
    checkCondition('shortTerm', dbStock.shortTermProfit, currentHigh, 'gte')
    checkCondition('wave', dbStock.waveProfit, currentHigh, 'gte')

    // 2. 過濾邏輯
    const hasShortTerm = potentialHits.some((h) => h.type === 'shortTerm')
    const hasWave = potentialHits.some((h) => h.type === 'wave')
    const hasSupport = potentialHits.some((h) => h.type === 'support')
    const hasSwap = potentialHits.some((h) => h.type === 'swap')

    let finalHits = potentialHits
    
    // 如果同時有 shortTerm 和 wave，只保留 wave
    if (hasShortTerm && hasWave) {
      finalHits = finalHits.filter((h) => h.type !== 'shortTerm')
    }
    
    // 如果同時有 support 和 swap，只保留 swap
    if (hasSupport && hasSwap) {
      finalHits = finalHits.filter((h) => h.type !== 'support')
    }

    // 3. 寫入 DB 並準備回傳
    for (const hit of finalHits) {
      try {
        // [防護 1] 先查詢是否已存在 (解決索引建立失敗時的重複問題)
        const existLog = await StockHitLog.findOne({
          stockId: dbStock._id,
          type: hit.type,
          dateStr: dateStr
        })

        if (existLog) {
          // 今天已經紀錄過了，跳過
          continue
        }

        // [防護 2] 嘗試寫入 (利用 Unique Index 防止並發重複)
        await StockHitLog.create({
          stockId: dbStock._id,
          code: dbStock.code,
          type: hit.type,
          targetPrice: hit.threshold,
          triggerPrice: hit.compareVal,
          dateStr: dateStr 
        })

        newHits.push({
          type: hit.type,
          code: dbStock.code,
          name: stockInfo.name || '',
          price: hit.compareVal,
          target: hit.threshold,
          status: status,
        })

      } catch (err) {
        // 如果錯誤代碼是 11000 (Duplicate Key Error)，代表今天已經紀錄過了，直接忽略
        if (err.code === 11000) {
          // console.log(`ℹ️ [${code}] ${hit.type} 今天已觸發過 (並發攔截)，跳過。`)
        } else {
          console.error(`❌ 寫入 StockHitLog 失敗:`, err)
        }
      }
    }
  }

  return newHits
}

/**
 * 核心邏輯 B：整合觸發紀錄並發送推播 (Flex Message 版本)
 */
async function sendAggregatedPush(hits) {
  if (!hits || hits.length === 0) return

  const TARGET_PUSH_ID = 'Cb5fef09fce454530cf37458c468196c0'
  const TYPE_NAME_MAP = {
    shortTerm: '💰 短線獲利',
    wave: '🌊 波段獲利',
    support: '🛡️ 支撐',
    swap: '🔄 換股操作',
  }

  // 分組整理
  const grouped = {
    shortTerm: [],
    wave: [],
    support: [],
    swap: [],
  }

  hits.forEach((hit) => {
    if (grouped[hit.type]) {
      grouped[hit.type].push(hit)
    }
  })

  // 建構 Flex Message 內容 (Bubble -> Body -> Vertical Box)
  const contents = []

  // 標題區塊
  contents.push({
    type: 'text',
    text: '🔔 觸及通知匯總',
    weight: 'bold',
    size: 'xl',
    margin: 'md',
    color: '#FFFFFF' // 深色模式文字
  })
  contents.push({ type: 'separator', margin: 'md', color: '#333333' })

  // 依序檢查四種類型
  for (const type of ['shortTerm', 'wave', 'support', 'swap']) {
    const list = grouped[type]
    if (list.length > 0) {
      // 類型標題 (例如：🌊 波段獲利)
      contents.push({
        type: 'text',
        text: TYPE_NAME_MAP[type],
        weight: 'bold',
        size: 'md',
        color: '#FFD700', // 金色標題
        margin: 'lg',
      })

      // 列表內容
      list.forEach((item) => {
        const statusText = item.status || ''
        
        // 決定價格區塊的樣式屬性
        const priceBoxProps = {
          type: 'box',
          layout: 'vertical',
          cornerRadius: 'sm',
          paddingStart: 'sm',
          paddingEnd: 'sm',
          height: '24px',
          justifyContent: 'center',
          flex: 0,
          contents: [
            {
              type: 'text',
              text: String(item.price), // 強制轉字串
              size: 'sm',
              color: '#FFFFFF',
              align: 'center',
              weight: 'bold'
            }
          ]
        }

        // 只有在漲跌停時才設定背景色
        if (statusText.includes('漲停')) {
          priceBoxProps.backgroundColor = '#FF0000'
        } else if (statusText.includes('跌停')) {
          priceBoxProps.backgroundColor = '#008000'
        }

        // 整列
        contents.push({
          type: 'box',
          layout: 'horizontal',
          contents: [
            // 左側：股票名稱代號
            {
              type: 'text',
              text: `${item.code} ${item.name}`,
              size: 'md',
              color: '#FFFFFF',
              gravity: 'center',
              flex: 1, 
            },
            // 右側：價格 (動態屬性)
            priceBoxProps
          ],
          paddingTop: 'md',
          paddingBottom: 'md',
          alignItems: 'center'
        })
        
        // 分隔線
        contents.push({ type: 'separator', color: '#333333' })
      })
    }
  }

  // 封裝成 Flex Message
  const flexMessage = {
    type: 'flex',
    altText: '🔔 股票觸及通知',
    contents: {
      type: 'bubble',
      styles: {
        body: {
          backgroundColor: '#191919' // 深色背景
        }
      },
      body: {
        type: 'box',
        layout: 'vertical',
        contents: contents,
      },
    },
  }

  try {
    await client.pushMessage(TARGET_PUSH_ID, flexMessage)
    console.log(`📨 已推播 Flex Message 給 ${TARGET_PUSH_ID}，共包含 ${hits.length} 筆紀錄`)
  } catch (err) {
    console.error('❌ Flex Message 推播失敗:', err.message)
    if (err.originalError && err.originalError.response && err.originalError.response.data) {
        console.error('詳細錯誤:', JSON.stringify(err.originalError.response.data, null, 2))
    }

    // Fallback: 轉為純文字推播，確保訊息不漏接
    let fallbackText = '🔔 觸及通知 (純文字備案)\n'
    for (const type of ['shortTerm', 'wave', 'support', 'swap']) {
        const list = grouped[type]
        if (list.length > 0) {
            fallbackText += `\n【${TYPE_NAME_MAP[type]}】\n`
            list.forEach(item => {
                fallbackText += `${item.code} ${item.name} ${item.price} ${item.status || ''}\n`
            })
        }
    }
    
    try {
        await client.pushMessage(TARGET_PUSH_ID, { type: 'text', text: fallbackText.trim() })
        console.log('⚠️ 已改用純文字推播')
    } catch (textErr) {
        console.error('❌ 純文字推播也失敗:', textErr.message)
    }
  }
}

// 新增：專門用來獲取股價的 API
router.post('/stock-prices', async (req, res) => {
  try {
    const { symbols } = req.body

    if (!symbols || !Array.isArray(symbols) || symbols.length === 0) {
      return res.json([])
    }

    const prices = await fetchStockData(symbols)

    // 🔥 在獲取股價的同時，異步執行檢查邏輯 (不阻塞 API 回傳)
    // checkAndLogStockHits(prices)
    //   .then((hits) => sendAggregatedPush(hits))
    //   .catch((err) => {
    //     console.error('❌ 檢查股價狀態失敗:', err)
    //   })
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
    // 1. 取得圖片辨識的股票 (MongoDB) - 移除 30 天限制，顯示全部
    const recognizedStocks = await RecognizedStock.find({})
      .sort({ createdAt: -1 })
      .limit(200) // 增加限制到 200 避免過多，但移除日期限制

    // 2. 獲取所有相關的觸及歷史紀錄
    const stockIds = recognizedStocks.map((s) => s._id)
    const allHitLogs = await StockHitLog.find({ stockId: { $in: stockIds } }).sort({ happenedAt: -1 })

    // 3. 將歷史紀錄按 stockId 分組
    const logsByStockId = allHitLogs.reduce((acc, log) => {
      const stockIdStr = log.stockId.toString()
      if (!acc[stockIdStr]) {
        acc[stockIdStr] = []
      }
      acc[stockIdStr].push(log)
      return acc
    }, {})

    // 4. 合併股票資料，並動態產生 isSuccess 狀態
    const recognizedResult = recognizedStocks.map((stock) => {
      const stockObject = stock.toObject()
      const history = logsByStockId[stock._id.toString()] || []

      // --- 動態狀態產生邏輯 ---
      let derivedIsSuccess = null
      let successDate = null
      let updatedAt = stockObject.updatedAt // 預設為文件更新時間

      // 篩選出決定狀態的事件 (成功或失敗)，並按時間排序
      const statusEvents = history.filter((h) => h.type === 'shortTerm' || h.type === 'swap').sort((a, b) => new Date(b.happenedAt) - new Date(a.happenedAt))

      if (statusEvents.length > 0) {
        const latestEvent = statusEvents[0]
        if (latestEvent.type === 'shortTerm') {
          derivedIsSuccess = true
          successDate = latestEvent.happenedAt // 設置成功日期
        } else if (latestEvent.type === 'swap') {
          derivedIsSuccess = false
          updatedAt = latestEvent.happenedAt // 用失敗日期覆蓋更新日期，以供前端顯示
        }
      }

      return {
        ...stockObject,
        market: null, // 前端會自行呼叫 /stock-prices 獲取價格
        hitHistory: history, // 附加完整的觸及歷史
        isSuccess: derivedIsSuccess, // 附加動態計算的狀態
        successDate: successDate, // 附加成功日期
        updatedAt: updatedAt, // 附加預設或被覆蓋的更新日期
      }
    })

    // 5. 回傳最終結果
    res.json({
      recognizedStocks: recognizedResult,
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
    const allowedFields = ['support', 'shortTermProfit', 'waveProfit', 'swapRef', 'source', 'isFavorite', 'currentPrice']
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

const parseTargetPrice = (valStr, type) => {
  if (!valStr) return null

  // 取出所有數字
  const numbers = valStr
    .toString()
    .split(/[~,\- ]/)
    .map((v) => parseFloat(v))
    .filter((n) => !isNaN(n))

  if (numbers.length === 0) return null

  // 根據類型決定取哪一個邊界
  if (type === 'support' || type === 'swap') {
    // 📉 看跌 (支撐/換股)：取 Max (寬鬆判定)
    return Math.max(...numbers)
  } else {
    // 📈 看漲 (短線/波段)：取 Min (寬鬆判定)
    return Math.min(...numbers)
  }
}

// ==========================================
// 🚀 合併後的主要 API
// ==========================================
router.post('/check-stock-status', async (req, res) => {
  try {
    console.log('🎯 [排程啟動] 開始檢查所有股票狀態 (支撐/短線/波段/換股)...')

    // 1. 找出所有設定了目標的股票
    const stocks = await RecognizedStock.find({
      $or: [{ support: { $ne: null } }, { shortTermProfit: { $ne: null } }, { waveProfit: { $ne: null } }, { swapRef: { $ne: null } }],
    })

    if (stocks.length === 0) {
      return res.json({ success: true, message: '沒有設定目標的股票', results: [] })
    }

    const chunks = chunkArray(stocks, 10)
    let allHits = []

    console.log(`📊 共 ${stocks.length} 支股票，分為 ${chunks.length} 組檢查`)

    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i]
      const chunkSymbols = chunk.map((s) => s.code)

      try {
        const stockDataList = await fetchStockData(chunkSymbols)
        const chunkHits = await checkAndLogStockHits(stockDataList)
        allHits = allHits.concat(chunkHits)
      } catch (err) {
        console.error(`❌ 第 ${i + 1} 組查詢失敗:`, err.message)
      }

      if (i < chunks.length - 1) await new Promise((r) => setTimeout(r, 1000))
    }

    console.log(`🎉 檢查完成！新增 ${allHits.length} 筆觸價紀錄。`)

    // 最後一次性發送整合推播
    if (allHits.length > 0) {
      await sendAggregatedPush(allHits)
    }

    res.json({
      success: true,
      message: '檢查完成',
      newLogCount: allHits.length,
    })
  } catch (error) {
    console.error('❌ 系統錯誤:', error)
    res.status(500).json({ success: false, message: error.message })
  }
})
export default router
