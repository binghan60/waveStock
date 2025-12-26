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

// 👇 [關鍵修正] 掃描式解析邏輯 (比 Regex 更聰明)
function parseStockData(text) {
  // 1. 先把文字依照 "換行" 切割成陣列
  // Engine 2 通常會把標題跟數值放在同一行，或是緊接的下一行
  const lines = text
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l)

  const result = {}

  // 1. 全域搜尋股票代號 (這最簡單)
  const codeMatch = text.match(/(\d{4})/)
  if (codeMatch) result.code = codeMatch[1]

  // 定義要抓取的欄位關鍵字
  const targets = [
    { key: 'support', keywords: ['支撐', '支撑'], isRange: true }, // isRange: 可能有 "-" 或 "~"
    { key: 'shortTermProfit', keywords: ['短線', '短期', '短太', '短矩'], isRange: false },
    { key: 'waveProfit', keywords: ['波段'], isRange: false },
    { key: 'swapRef', keywords: ['換股', '換殻', '换股'], isRange: false },
  ]

  // 2. 逐行掃描
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]

    // 檢查這一行有沒有包含我們的關鍵字
    targets.forEach((target) => {
      // 如果已經抓到了就跳過
      if (result[target.key]) return

      // 檢查關鍵字是否存在於這一行
      if (target.keywords.some((k) => line.includes(k))) {
        // 策略 A: 數字就在同一行 (例如: "支撐 120-130")
        let value = extractNumber(line, target.isRange)

        // 策略 B: 數字在下一行 (例如: "支撐" (換行) "120")
        if (!value && i + 1 < lines.length) {
          value = extractNumber(lines[i + 1], target.isRange)
        }

        if (value) {
          result[target.key] = value
        }
      }
    })
  }

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
