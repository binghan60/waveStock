import * as line from '@line/bot-sdk'
import express from 'express'
import 'dotenv/config'
import axios from 'axios'
import FormData from 'form-data'
import sharp from 'sharp' // 記得要留著 sharp 用來壓縮

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

    const replyText = `📊 分析結果
──────────────
🎫 代號：${stockData.code}
🛡️ 支撐：${stockData.support || '無資料'}
💰 短線：${stockData.shortTermProfit || '無資料'}
🌊 波段：${stockData.waveProfit || '無資料'}
🔄 換股：${stockData.swapRef || '無資料'}
──────────────`

    return client.replyMessage(event.replyToken, { type: 'text', text: replyText })
  } catch (error) {
    console.error('❌ Error:', error.message)
    return client.replyMessage(event.replyToken, { type: 'text', text: '系統忙碌中，請稍後再試。' })
  }
}

function parseStockData(text) {
  // 1. 基本清理：移除空白、修正錯字
  const cleanText = text.replace(/O/g, '0').replace(/o/g, '0').replace(/l/g, '1').replace(/I/g, '1').replace(/\s+/g, '\n') // 把所有空白變成換行，確保分行正確

  // 將文字轉成陣列，移除空行
  const lines = cleanText
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l)

  const result = {}

  // --- 1. 抓股票代號 (全域搜尋) ---
  const codeMatch = text.match(/(\d{4})/)
  if (codeMatch) result.code = codeMatch[1]

  // --- 2. 抓取數值 (雙欄排版策略) ---

  // 我們知道圖片的順序是固定的：支撐 -> 短線 -> 波段 -> 換股
  // 而 OCR 讀出來的順序是：[所有標題] -> [換股參考] -> [數值1] -> [數值2] -> [數值3] -> [數值4]

  // 步驟 A: 找到「換股參考」這一行在哪裡
  // 關鍵字包含：換股、換殻、换股
  const lastLabelIndex = lines.findIndex((l) => /[換换挽]股/.test(l))

  if (lastLabelIndex !== -1) {
    // 步驟 B: 從「換股參考」的下一行開始，抓出接著出現的 4 個數字
    const foundNumbers = []

    for (let i = lastLabelIndex + 1; i < lines.length; i++) {
      const line = lines[i]

      // 檢查是否為純數字 (例如 "177", "210.5")，排除日期 ("2025/...")
      // Regex 解釋: ^ 開始, \d+ 數字, (\.\d+)? 小數點可有可無, $ 結束
      if (/^\d+(\.\d+)?$/.test(line)) {
        foundNumbers.push(line)
      }

      // 如果已經抓到 4 個數字，就停止掃描
      if (foundNumbers.length >= 4) break
    }

    // 步驟 C: 依序填入 (因為我們知道順序是固定的)
    if (foundNumbers.length >= 4) {
      result.support = foundNumbers[0] // 177
      result.shortTermProfit = foundNumbers[1] // 210
      result.waveProfit = foundNumbers[2] // 244
      result.swapRef = foundNumbers[3] // 171

      return result // 成功抓取，直接回傳
    }
  }

  // --- 3. (備用方案) 如果上面的方法失敗，嘗試舊的「逐行抓取」邏輯 ---
  // 這預防萬一 OCR 讀取順序變回「標題:數值」的形式
  console.log('⚠️ 雙欄模式未命中，嘗試備用邏輯...')

  // (這裡保留簡單的備用 regex，以防萬一)
  const supportMatch = text.match(/支[^0-9\n]*(\d+(?:\.\d+)?)/)
  if (supportMatch) result.support = supportMatch[1]

  const shortMatch = text.match(/[短矩][^0-9\n]*(\d+(?:\.\d+)?)/)
  if (shortMatch) result.shortTermProfit = shortMatch[1]

  const waveMatch = text.match(/波[^0-9\n]*(\d+(?:\.\d+)?)/)
  if (waveMatch) result.waveProfit = waveMatch[1]

  const swapMatch = text.match(/[換挽换][^0-9\n]*(\d+(?:\.\d+)?)/)
  if (swapMatch) result.swapRef = swapMatch[1]

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
