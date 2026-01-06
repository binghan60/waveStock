import 'dotenv/config'
import express from 'express'
import RecognizedStock from '../models/RecognizedStock.js'
import StockHitLog from '../models/StockHitLog.js'
import { fetchStockData, getSystemStatus } from '../services/stockService.js'
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
      const existLog = await StockHitLog.findOne({
        stockId: dbStock._id,
        type: hit.type,
        happenedAt: { $gte: startOfToday },
      })

      if (!existLog) {
        console.log(`✅ [${code}] ${hit.type} 觸發！現價 ${hit.compareVal} 門檻 ${hit.threshold}`)

        await StockHitLog.create({
          stockId: dbStock._id,
          code: dbStock.code,
          type: hit.type,
          targetPrice: hit.threshold,
          triggerPrice: hit.compareVal,
        })

        newHits.push({
          type: hit.type,
          code: dbStock.code,
          name: stockInfo.name || '',
          price: hit.compareVal,
          target: hit.threshold,
          status: status, // 加入漲跌停狀態
        })
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
  })
  contents.push({ type: 'separator', margin: 'md' })

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
        color: '#1DB446',
        margin: 'lg',
      })

      // 列表內容
      list.forEach((item) => {
        // 處理漲跌停標籤
        let statusTag = null
        const statusText = item.status || ''

        if (statusText.includes('漲停')) {
          statusTag = {
            type: 'text',
            text: '漲',
            size: 'xs',
            color: '#FFFFFF',
            weight: 'bold',
            align: 'center',
            gravity: 'center'
          }
        } else if (statusText.includes('跌停')) {
          statusTag = {
            type: 'text',
            text: '跌',
            size: 'xs',
            color: '#FFFFFF',
            weight: 'bold',
            align: 'center',
            gravity: 'center'
          }
        }

        // 右側區塊：價格 + (標籤)
        const rightContents = []
        
        // 價格
        rightContents.push({
          type: 'text',
          text: `${item.price}`,
          size: 'sm',
          color: '#111111',
          align: 'end',
          gravity: 'center',
          flex: 0 // 不自動伸縮，依內容寬度
        })

        // 如果有標籤，加一個 Box 包紅/綠底色
        if (statusTag) {
          rightContents.push({
            type: 'box',
            layout: 'vertical',
            backgroundColor: statusText.includes('漲停') ? '#FF0000' : '#008000',
            cornerRadius: 'xs',
            paddingStart: 'xs',
            paddingEnd: 'xs',
            margin: 'sm',
            height: '20px',
            justifyContent: 'center',
            contents: [statusTag]
          })
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
              size: 'sm',
              color: '#111111',
              gravity: 'center',
              flex: 1, // 佔據剩餘空間
            },
            // 右側：價格與標籤容器
            {
              type: 'box',
              layout: 'horizontal',
              contents: rightContents,
              flex: 0, // 依內容寬度，確保靠右
              alignItems: 'center',
              justifyContent: 'flex-end'
            }
          ],
          paddingTop: 'sm',
          paddingBottom: 'sm',
        })
        
        // 分隔線
        contents.push({ type: 'separator' })
      })
    }
  }

  // 封裝成 Flex Message
  const flexMessage = {
    type: 'flex',
    altText: '🔔 股票觸及通知',
    contents: {
      type: 'bubble',
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
    console.error('❌ 推播失敗:', err.message)
    // 如果 Flex 失敗 (可能是格式錯)，fallback 到純文字
    // 但通常只要結構對就不會錯
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
    checkAndLogStockHits(prices)
      .then((hits) => sendAggregatedPush(hits))
      .catch((err) => {
        console.error('❌ 檢查股價狀態失敗:', err)
      })
console.log(prices.find(x=>x.symbol == 2313))
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

router.get('/dashboard', async (req, res) => {
  try {
    // 1. 取得圖片辨識的股票 (MongoDB) - 只取 30 天內的
    const thirtyDaysAgo = new Date()
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)
    const recognizedStocks = await RecognizedStock.find({
      createdAt: { $gte: thirtyDaysAgo },
    })
      .sort({ createdAt: -1 })
      .limit(100)

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
