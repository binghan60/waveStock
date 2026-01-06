import axios from 'axios'

// --- 快取與狀態變數 ---
const stockPriceCache = new Map()
let lastRequestTime = 0
const MIN_REQUEST_INTERVAL = 3000 // 最小請求間隔 3秒

// --- 輔助函式 ---

// 判斷是否為交易時段
export function isTradingHours() {
  const now = new Date()
  // 建立台北時間物件
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
export function getRecommendedCacheTTL() {
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

// 清理過期快取 (每分鐘執行)
setInterval(() => {
  const now = Date.now()
  for (const [key, value] of stockPriceCache.entries()) {
    // 簡單清理：超過5分鐘未更新的快取就清除
    if (now - value.timestamp > 300000) {
      stockPriceCache.delete(key)
    }
  }
}, 60000)

// --- 核心爬蟲邏輯 ---

async function fetchStockDataWithRetry(stockIds, retryCount = 0) {
  const baseUrl = 'https://mis.twse.com.tw/stock/api/getStockInfo.jsp'
  const MAX_RETRIES = 2
  const RETRY_DELAY = 1000

  // 1️⃣ 組合查詢字串
  // 支援單一字串或陣列
  const ids = Array.isArray(stockIds) ? stockIds : [stockIds]
  if (ids.length === 0) return []

  const queryParams = ids.map((id) => `tse_${id}.tw|otc_${id}.tw`).join('|')
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
        const isValid = (val) => val && val !== '-' && !isNaN(parseFloat(val)) && parseFloat(val) > 0

        let currentPrice = msg.z

        // 如果成交價無效 (e.g. '-' 或 '0.00')
        if (!isValid(currentPrice)) {
          // 輔助函式：從 "0.0000_103.5000_..." 字串中找出第一個有效價格
          const findFirstValidPrice = (rawStr) => {
            if (!rawStr || rawStr === '-') return null
            const parts = rawStr.split('_')
            for (const part of parts) {
              if (isValid(part)) return part
            }
            return null
          }

          const bidPrice = findFirstValidPrice(msg.b)
          const askPrice = findFirstValidPrice(msg.a)

          if (bidPrice) {
            currentPrice = bidPrice
          } else if (askPrice) {
            currentPrice = askPrice
          } else {
            // [DEBUG] 這裡是用昨收價的最後防線，我們印出來看看為什麼前面的都失敗了
            // 只針對特定格式 (例如 b 有值但沒被用) 印 Log，避免洗版
            if ((msg.b && msg.b !== '-') || (msg.a && msg.a !== '-')) {
              console.log(`⚠️ [${msg.c}] 價格解析異常 (使用昨收):`, {
                z: msg.z,
                b_raw: msg.b,
                a_raw: msg.a,
                parsed_bid: findFirstValidPrice(msg.b),
                parsed_ask: findFirstValidPrice(msg.a)
              })
            }
            currentPrice = msg.y // 真的沒有才用昨收
          }
        }

        return {
          symbol: msg.c,
          name: msg.n,
          currentPrice: currentPrice,
          high: msg.h,
          low: msg.l,
          yesterdayClose: msg.y,
          volume: msg.v,
          time: msg.t,
          fullKey: msg.ch,
        }
      })

    return results
  } catch (error) {
    console.error(`❌ 批量查詢失敗 (嘗試 ${retryCount + 1}/${MAX_RETRIES + 1})`, error.message)

    if (retryCount < MAX_RETRIES) {
      await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY * (retryCount + 1)))
      return fetchStockDataWithRetry(stockIds, retryCount + 1)
    }

    return []
  }
}

// --- 公開方法 ---

// 主要的股票數據獲取函數（帶快取和節流）
export async function fetchStockData(stockIds) {
  if (!stockIds || (Array.isArray(stockIds) && stockIds.length === 0)) return []

  const ids = Array.isArray(stockIds) ? stockIds : [stockIds]

  // 生成快取鍵
  const cacheKey = ids.sort().join(',')

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

  // 3️⃣ 呼叫 API
  console.log(`🌐 呼叫證交所 API (${ids.length} 支股票)`)
  lastRequestTime = Date.now()
  const data = await fetchStockDataWithRetry(ids)

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
}

// 取得系統狀態 (供 API 使用)
export function getSystemStatus() {
  return {
    cache: {
      cacheSize: stockPriceCache.size,
      cacheKeys: Array.from(stockPriceCache.keys()),
      cacheDetails: Array.from(stockPriceCache.entries()).map(([key, value]) => ({
        key,
        age: Math.round((Date.now() - value.timestamp) / 1000),
        itemCount: value.data.length,
      })),
    },
    trading: {
      isTradingHours: isTradingHours(),
      recommendedCacheTTL: getRecommendedCacheTTL(),
      timeSinceLastRequest: lastRequestTime ? Date.now() - lastRequestTime : null,
    },
  }
}
