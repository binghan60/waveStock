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

async function handleImageMessage(event, client) {
  try {
    console.log('📥 下載圖片...')
    const stream = await client.getMessageContent(event.message.id)
    const imageBuffer = await streamToBuffer(stream)

    console.log('🔧 壓縮圖片中...')
    // [關鍵優化] 使用 Sharp 壓縮圖片
    // 1. resize: 寬度 1024 (夠清楚且檔案小)
    // 2. jpeg: 轉成 jpeg 格式，品質 80%
    const compressedBuffer = await sharp(imageBuffer).resize({ width: 1024, withoutEnlargement: true }).toFormat('jpeg', { quality: 80 }).toBuffer()

    console.log(`📉 圖片大小優化: ${(imageBuffer.length / 1024).toFixed(1)}KB -> ${(compressedBuffer.length / 1024).toFixed(1)}KB`)

    // 轉成 Base64
    const base64Image = `data:image/jpeg;base64,${compressedBuffer.toString('base64')}`

    console.log('🚀 呼叫 OCR.space API...')

    const formData = new FormData()
    formData.append('base64Image', base64Image)
    formData.append('language', 'cht') // 繁體中文
    formData.append('isOverlayRequired', 'false')
    formData.append('scale', 'true')
    formData.append('OCREngine', '1')

    // 設定 Axios Timeout 為 25秒 (避免無限等待)
    const response = await axios.post('https://api.ocr.space/parse/image', formData, {
      headers: {
        ...formData.getHeaders(),
        apikey: OCR_API_KEY,
      },
      maxContentLength: Infinity,
      maxBodyLength: Infinity,
      timeout: 25000,
    })

    const apiResult = response.data

    // 檢查是否有 API 錯誤訊息
    if (apiResult.IsErroredOnProcessing) {
      console.error('OCR API Error:', apiResult.ErrorMessage)
      // 如果是用 helloworld key，常常會出現 rate limit error
      if (typeof apiResult.ErrorMessage === 'string' && apiResult.ErrorMessage.includes('limit')) {
        return client.replyMessage(event.replyToken, { type: 'text', text: '⚠️ 測試 Key 用量已達上限，請稍後再試。' })
      }
      throw new Error(String(apiResult.ErrorMessage))
    }

    // 取得結果
    const text = apiResult.ParsedResults?.[0]?.ParsedText || ''

    console.log('✅ API 回傳成功')
    // console.log('📜 文字:', text); // debug 用

    const stockData = parseStockData(text)

    if (!stockData.code) {
      return client.replyMessage(event.replyToken, {
        type: 'text',
        text: '⚠️ 辨識失敗：找不到股票代號',
      })
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
    // 詳細印出 Axios 錯誤，方便除錯
    if (error.response) {
      console.error('❌ API Server Error:', error.response.status, error.response.data)
    } else if (error.request) {
      console.error('❌ API No Response (Timeout):', error.message)
    } else {
      console.error('❌ Error:', error.message)
    }

    return client.replyMessage(event.replyToken, {
      type: 'text',
      text: '系統忙碌中 (API 超時或錯誤)，請稍後再試。',
    })
  }
}

// 解析邏輯
function parseStockData(text) {
  const cleanText = text.replace(/\s+/g, ' ').replace(/O/g, '0').replace(/o/g, '0').replace(/l/g, '1').replace(/I/g, '1')

  const result = {}

  const codeMatch = cleanText.match(/(\d{4})/)
  if (codeMatch) result.code = codeMatch[1]

  const supportMatch = cleanText.match(/支撐[^0-9]*([\d\.\-~]+)/)
  if (supportMatch) result.support = supportMatch[1]

  const shortMatch = cleanText.match(/[短矩]線?[^0-9]*([\d\.]+)/)
  if (shortMatch) result.shortTermProfit = shortMatch[1]

  const waveMatch = cleanText.match(/波段[^0-9]*([\d\.]+)/)
  if (waveMatch) result.waveProfit = waveMatch[1]

  const swapMatch = cleanText.match(/[換挽换][^0-9\n]*([\d\.]+)/)
  if (swapMatch) result.swapRef = swapMatch[1]

  return result
}

function streamToBuffer(stream) {
  return new Promise((resolve, reject) => {
    const chunks = []
    stream.on('data', (chunk) => chunks.push(chunk))
    stream.on('error', reject)
    stream.on('end', () => resolve(Buffer.concat(chunks)))
  })
}
