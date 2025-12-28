import * as line from '@line/bot-sdk'
import express from 'express'
import 'dotenv/config'
import axios from 'axios'
import FormData from 'form-data'
import sharp from 'sharp' // 記得要留著 sharp 用來壓縮
import RecognizedStock from '../models/RecognizedStock.js'

// 如果你還沒申請 Key，暫時用 'helloworld' (這是官方測試 Key，但不保證穩定)
// 強烈建議去 https://ocr.space/ocrapi 申請一個 (免費且只需填 Email)
const OCR_API_KEY = process.env.OCR_API_KEY // 建議申請一個，或暫時用 'helloworld'

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
    try {
      const thirtyDaysAgo = new Date()
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)

      // 查詢 30 天內是否已經有相同的股票代號
      const existingStock = await RecognizedStock.findOne({
        code: stockData.code,
        createdAt: { $gte: thirtyDaysAgo },
      }).sort({ createdAt: -1 })

      if (existingStock) {
        existingStock.support = stockData.support
        existingStock.shortTermProfit = stockData.shortTermProfit
        existingStock.waveProfit = stockData.waveProfit
        existingStock.swapRef = stockData.swapRef
        existingStock.updatedAt = new Date()

        await existingStock.save()
      } else {
        // 超過 30 天或沒有該股票，新增一筆
        const recognizedStock = new RecognizedStock({
          code: stockData.code,
          support: stockData.support,
          shortTermProfit: stockData.shortTermProfit,
          waveProfit: stockData.waveProfit,
          swapRef: stockData.swapRef,
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

    const replyText = `📊 分析結果
──────────────
🎫 代號：${stockData.code}
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

function parseStockData(text) {
  // 1. 基本字元清理 (統一符號)
  const cleanText = text
    .replace(/O/g, '0')
    .replace(/o/g, '0')
    .replace(/l/g, '1')
    .replace(/I/g, '1')
    .replace(/~/g, '-') // 波浪號轉減號
    .replace(/—/g, '-') // 長破折號轉減號
    .replace(/\s+/g, '\n') // 統一換行

  const result = {}

  // --- A. 抓取股票代號 (全域搜尋) ---
  const codeMatch = cleanText.match(/(\d{4})/)
  if (codeMatch) result.code = codeMatch[1]

  // --- B. 鎖定「操作策略」區塊 ---
  // 我們只看 'STRATEGY' 或 '操作策略' 之後的文字，避免抓到上方的 SMA、收盤價或日期
  let strategyIndex = cleanText.search(/STRATEGY|操作策略|支撐區間/i)
  if (strategyIndex === -1) strategyIndex = 0 // 找不到就全搜

  let content = cleanText.substring(strategyIndex)

  // --- C. 清除特定雜訊 (這是防呆的關鍵) ---
  // 1. 移除日期格式 (如 2025/12/04, 2025/124)，避免被當成股價
  content = content.replace(/\d{4}\/\d{1,2}\/?\d{0,2}/g, '')
  // 2. 移除盈虧比 (如 1:4.5)，避免被切成 1 和 4.5
  content = content.replace(/\d+\s*[:：]\s*\d+(\.\d+)?/g, '')
  // 3. 移除成交量 (如 34051張)
  content = content.replace(/\d+張/g, '')

  // --- D. 提取數值邏輯 ---

  // 1. 優先抓取「支撐區間」(特徵：兩個數字中間有減號)
  // Regex: 數字(含小數) - 數字(含小數)
  const rangeRegex = /(\d{2,}(\.\d+)?\s*[-]\s*\d{2,}(\.\d+)?)/
  const supportMatch = content.match(rangeRegex)

  if (supportMatch) {
    result.support = supportMatch[0].replace(/\s/g, '') // 移除中間空白
    // 抓到後，從內容中移除這段文字，避免後續重複抓取
    content = content.replace(supportMatch[0], '')
  }

  // 2. 抓取剩餘的所有「獨立數字」
  // Regex: 抓取任何大於 10 的數字 (過濾掉個位數雜訊，如 '1' 或 '4')
  // 這裡假設剩下的數字順序依序為：短線 -> 波段 -> 換股
  const allNumbers = []
  const numRegex = /(\d{2,}(\.\d+)?)/g
  let match
  while ((match = numRegex.exec(content)) !== null) {
    const val = parseFloat(match[0])
    // 額外過濾：股價通常不會是年份 (如 2025)，除非是台積電
    // 如果日期 Regex 沒濾乾淨，這裡做最後一道防線
    if (val !== 2024 && val !== 2025 && val !== 2026) {
      allNumbers.push(match[0])
    }
  }

  // --- E. 填入結果 ---

  // 如果剛剛沒抓到區間，就勉強用第一個數字當支撐 (防呆)
  if (!result.support && allNumbers.length > 0) {
    result.support = allNumbers.shift()
  }

  // 依序填入剩餘的目標價
  if (allNumbers.length >= 1) result.shortTermProfit = allNumbers[0]
  if (allNumbers.length >= 2) result.waveProfit = allNumbers[1]
  if (allNumbers.length >= 3) result.swapRef = allNumbers[2]

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
