import * as line from '@line/bot-sdk'
import express from 'express'
import 'dotenv/config'
import axios from 'axios'
import FormData from 'form-data'
import sharp from 'sharp' // 記得要留著 sharp 用來壓縮
import RecognizedStock from '../models/RecognizedStock.js'
import { fetchStockData } from '../services/stockService.js'

const OCR_API_KEY = process.env.OCR_API_KEY

export default (config) => {
  const router = express.Router()
  const client = new line.Client(config)

  router.post('/', async (req, res) => {
    try {
      const events = req.body.events
      const results = await Promise.all(events.map((event) => handleEvent(event, client)))
      res.json(results)
    } catch (err) {
      console.error('Webhook Error:', err)
      res.status(500).end()
    }
  })

  return router
}

async function handleEvent(event, client) {
  if (event.type === 'message' && event.message.type === 'text') {
    return client.replyMessage(event.replyToken, { type: 'text', text: event.message.text })
  }

  if (event.type === 'message' && event.message.type === 'image') {
    return handleImageMessage(event, client)
  }

  if (event.type === 'join' || event.type === 'follow') {
    return client.replyMessage(event.replyToken, { type: 'text', text: '🎉 歡迎使用！' })
  }

  return Promise.resolve(null)
}

// 👇 修改 handleImageMessage 裡的 API 設定
async function handleImageMessage(event, client) {
  try {
    console.log('📥 下載圖片...')
    const stream = await client.getMessageContent(event.message.id)
    const imageBuffer = await streamToBuffer(stream)

    console.log('🔧 壓縮圖片中...')
    const compressedBuffer = await sharp(imageBuffer)
      .resize({ width: 1024, withoutEnlargement: true }) // 稍微放大一點點確保清晰
      .toFormat('jpeg', { quality: 90 }) // 品質調高一點
      .toBuffer()

    // 轉 Base64
    const base64Image = `data:image/jpeg;base64,${compressedBuffer.toString('base64')}`

    console.log('🚀 呼叫 OCR.space API (Engine 2)...')

    const formData = new FormData()
    formData.append('base64Image', base64Image)
    formData.append('language', 'cht')
    formData.append('isOverlayRequired', 'false')
    formData.append('scale', 'true')
    // ✅ [關鍵修正] 改用 Engine 2 (對數字/表格辨識超強)
    formData.append('OCREngine', '2')

    const response = await axios.post('https://api.ocr.space/parse/image', formData, {
      headers: { ...formData.getHeaders(), apikey: OCR_API_KEY },
      timeout: 25000,
    })

    const apiResult = response.data
    if (apiResult.IsErroredOnProcessing) {
      throw new Error(String(apiResult.ErrorMessage))
    }

    const text = apiResult.ParsedResults?.[0]?.ParsedText || ''

    console.log('📜 [OCR 原始文字]:\n', text) // 建議觀察一下 Log，看 Engine 2 的排版

    // 使用新的掃描式解析
    const stockData = parseStockData(text)

    if (!stockData.code) {
      return client.replyMessage(event.replyToken, { type: 'text', text: '⚠️ 辨識失敗：找不到股票代號' })
    }

    // 💾 儲存到資料庫
    let currentPrice = null
    try {
      // 🔥 獲取當下股價
      console.log('📈 正在獲取股價...')
      const stockInfoList = await fetchStockData(stockData.code)
      if (stockInfoList && stockInfoList.length > 0) {
        // 保留一位小數的格式化邏輯
        const rawPrice = stockInfoList[0].currentPrice
        if (rawPrice && !isNaN(parseFloat(rawPrice))) {
          currentPrice = parseFloat(rawPrice).toFixed(1)
        } else {
          currentPrice = rawPrice
        }
        console.log(`✅ 成功獲取股價: ${currentPrice}`)
      }

      const thirtyDaysAgo = new Date()
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)

      // 查詢 30 天內是否已經有相同的股票代號
      const existingStock = await RecognizedStock.findOne({
        code: stockData.code,
        createdAt: { $gte: thirtyDaysAgo },
      }).sort({ createdAt: -1 })

      if (existingStock) {
        // 更新現有記錄
        existingStock.support = stockData.support
        existingStock.shortTermProfit = stockData.shortTermProfit
        existingStock.waveProfit = stockData.waveProfit
        existingStock.swapRef = stockData.swapRef
        existingStock.currentPrice = currentPrice // 記錄當下股價
        existingStock.isSuccess = null // 預留欄位，先給 null
        existingStock.updatedAt = new Date()

        await existingStock.save()
        console.log('✅ 股票資料已更新到資料庫:', stockData.code)
      } else {
        // 超過 30 天或沒有該股票，新增一筆
        const recognizedStock = new RecognizedStock({
          code: stockData.code,
          support: stockData.support,
          shortTermProfit: stockData.shortTermProfit,
          waveProfit: stockData.waveProfit,
          swapRef: stockData.swapRef,
          currentPrice: currentPrice, // 記錄當下股價
          isSuccess: null, // 預留欄位，先給 null
          source: 'system',
          isFavorite: false,
        })

        await recognizedStock.save()
        console.log('✅ 股票資料已新增到資料庫:', stockData.code)
      }
    } catch (dbError) {
      console.error('❌ 資料庫儲存失敗:', dbError.message)
      // 即使儲存失敗，仍然回覆使用者辨識結果
    }

    // 獲取當下股價用於顯示
    let displayPrice = currentPrice || '無法取得'

    const replyText = `📊 分析結果
──────────────
🎫 代號：${stockData.code}
💵 現價：${displayPrice}
🛡️ 支撐：${stockData.support || '無資料'}
💰 短線：${stockData.shortTermProfit || '無資料'}
🌊 波段：${stockData.waveProfit || '無資料'}
🔄 換股：${stockData.swapRef || '無資料'}
立即前往儀表板查看
https://wave-stock.vercel.app/
──────────────`

    return client.replyMessage(event.replyToken, { type: 'text', text: replyText })
  } catch (error) {
    console.error('❌ Error:', error.message)
    return client.replyMessage(event.replyToken, { type: 'text', text: '系統忙碌中，請稍後再試。' })
  }
}

/**
 * 解析 OCR 文字 (加入價格錨點過濾，排除成交量與均線干擾)
 */
/**
 * 解析 OCR 文字 (V3 最終版：加入截斷邏輯與單位過濾)
 */
function parseStockData(text) {
  // 1. 基本字元清理
  const cleanText = text
    .replace(/O/g, '0')
    .replace(/o/g, '0')
    .replace(/l/g, '1')
    .replace(/I/g, '1')
    .replace(/~/g, '-')
    .replace(/—/g, '-') // 長破折號
    .replace(/,/g, '') // 移除數字逗號
    .replace(/\s+/g, '\n')

  const result = {}

  // --- A. 抓取股票代號 ---
  const codeMatch = cleanText.match(/(\d{4})/)
  if (codeMatch) result.code = codeMatch[1]

  // --- B. 鎖定區塊並清理顯著雜訊 ---
  let strategyIndex = cleanText.search(/STRATEGY|操作策略|支撐區間/i)
  if (strategyIndex === -1) strategyIndex = 0

  let content = cleanText.substring(strategyIndex)

  // 🔥 V3 新增：強力雜訊過濾
  content = content
    .replace(/\d+\s*[Kk]/g, '') // 🚫 移除 "50K", "100k" (成交量座標)
    .replace(/MA\d+\s*\d+/gi, '') // 🚫 移除 MA5, MA10
    .replace(/SMA\d+\s*\d+/gi, '') // 🚫 移除 SMA
    .replace(/量\s*\d+/g, '') // 🚫 移除 "量 5500"
    .replace(/\d{4}\/\d{1,2}\/?\d{0,2}/g, '') // 🚫 移除日期
    .replace(/\d+\s*[:：]\s*\d+(\.\d+)?/g, '') // 🚫 移除盈虧比

  // --- C. 核心邏輯：定位「支撐區間」並截斷前文 ---

  // 找尋 "數字-數字" (例如 68-70)
  const rangeRegex = /(\d{2,}(\.\d+)?)\s*[-]\s*(\d{2,}(\.\d+)?)/
  const supportMatch = content.match(rangeRegex)

  let anchorPrice = 0 // 錨點價格

  if (supportMatch) {
    result.support = supportMatch[0].replace(/\s/g, '') // 68-70

    // 計算平均價 (例如 69)
    const min = parseFloat(supportMatch[1])
    const max = parseFloat(supportMatch[3])
    anchorPrice = (min + max) / 2

    // ⚡️⚡️ 關鍵修正 ⚡️⚡️
    // 我們假設：短線、波段、換股這些數字，一定在「支撐區間」的「後面」
    // 所以我們直接把「支撐區間」及其之前的文字全部丟掉！
    // 這樣可以 100% 杜絕前面的 Y軸(50.0)、成交量(50K) 跑來亂
    const cutIndex = supportMatch.index + supportMatch[0].length
    content = content.substring(cutIndex)
  }

  // --- D. 抓取剩餘數字 (這時候 content 已經很乾淨了) ---

  const potentialNumbers = []
  // 這裡改用比較嚴格的 Regex，排除掉個位數 (防止抓到雜訊)
  const numRegex = /(\d{2,}(\.\d+)?)/g
  let match

  while ((match = numRegex.exec(content)) !== null) {
    const val = parseFloat(match[0])

    // 過濾: 年份
    if (val > 2023 && val < 2030) continue

    // 過濾: 錨點檢查 (如果剛剛有抓到支撐)
    if (anchorPrice > 0) {
      // 容許範圍：0.5倍 ~ 4倍
      // 8111為例: 錨點69。 50(太小? 其實50還算合理，但50K已被上面K過濾掉)
      // 如果 50 沒被 K 過濾掉，這裡通常也會因為「截斷邏輯」而被丟棄了
      if (val > anchorPrice * 4 || val < anchorPrice * 0.5) {
        continue
      }
    } else {
      // 沒錨點時的最後防線
      if (val > 5000) continue
    }

    potentialNumbers.push(match[0])
  }

  // --- E. 依序填入 ---

  // 萬一沒抓到支撐 (極少見)，用第一個數字頂替
  if (!result.support && potentialNumbers.length > 0) {
    result.support = potentialNumbers.shift()
  }

  if (potentialNumbers.length >= 1) result.shortTermProfit = potentialNumbers[0]
  if (potentialNumbers.length >= 2) result.waveProfit = potentialNumbers[1]
  if (potentialNumbers.length >= 3) result.swapRef = potentialNumbers[2]

  return result
}
// [工具] 從字串中提取數字或範圍
function extractNumber(str, isRange) {
  // 1. 移除干擾字元 (把 O 變 0, l 變 1, 移除空白)
  let clean = str.replace(/\s/g, '').replace(/O/g, '0').replace(/o/g, '0').replace(/l/g, '1').replace(/I/g, '1').replace(/~/g, '-') // 把波浪號統一轉成減號

  if (isRange) {
    // 抓取範圍：數字 + (減號) + 數字，例如 170-180 或 170.5-180.5
    const match = clean.match(/(\d+(?:\.\d+)?[-]\d+(?:\.\d+)?)/)
    if (match) return match[1]

    // 如果抓不到範圍，試著抓單一數字
    const single = clean.match(/(\d+(?:\.\d+)?)/)
    // 過濾掉太小的數字 (例如把 '支撐' 後面的雜訊當成數字)
    if (single && parseFloat(single[1]) > 10) return single[1]
  } else {
    // 抓取單一數字 (例如 1300 -> 可能是 130.0 或 1300)
    // 我們假設股票價格通常有小數點，或者長度適中
    // 這裡使用較寬鬆的抓法：抓出所有連續數字
    const match = clean.match(/[:：]?(\d+(?:\.\d+)?)/)

    // 這裡做一個簡單的防呆：如果是 "短線" 抓到 "1300"，很有可能是 "130.0" 漏了小數點
    // 但因為不知道股價位階，我們先原樣回傳，靠使用者自行判斷
    if (match) return match[1]
  }
  return null
}
function streamToBuffer(stream) {
  return new Promise((resolve, reject) => {
    const chunks = []
    stream.on('data', (chunk) => chunks.push(chunk))
    stream.on('error', reject)
    stream.on('end', () => resolve(Buffer.concat(chunks)))
  })
}
