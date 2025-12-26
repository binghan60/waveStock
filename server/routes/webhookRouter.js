import * as line from '@line/bot-sdk'
import express from 'express'
import 'dotenv/config'
import axios from 'axios' // 新增: 用來打 API
import FormData from 'form-data' // 新增: 用來包裝圖片

// 填入你的 OCR.space API Key
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

// 👇👇👇 改用 API 的核心邏輯 👇👇👇
async function handleImageMessage(event, client) {
  try {
    console.log('📥 下載圖片...')
    const stream = await client.getMessageContent(event.message.id)
    const imageBuffer = await streamToBuffer(stream)

    // 轉成 Base64 字串
    const base64Image = `data:image/jpeg;base64,${imageBuffer.toString('base64')}`

    console.log('🚀 呼叫 OCR.space API...')

    // 準備 Form Data
    const formData = new FormData()
    formData.append('base64Image', base64Image)
    formData.append('language', 'cht') // 設定繁體中文
    formData.append('isOverlayRequired', 'false')
    formData.append('scale', 'true') // 自動縮放以提高準確度
    formData.append('OCREngine', '1') // 引擎 1 通常對中文支援較好

    // 發送請求
    const response = await axios.post('https://api.ocr.space/parse/image', formData, {
      headers: {
        ...formData.getHeaders(),
        apikey: OCR_API_KEY,
      },
      maxContentLength: Infinity,
      maxBodyLength: Infinity,
    })

    const apiResult = response.data

    // 檢查 API 是否成功
    if (apiResult.IsErroredOnProcessing) {
      console.error('OCR API Error:', apiResult.ErrorMessage)
      throw new Error(apiResult.ErrorMessage)
    }

    // 取得辨識文字
    // OCR.space 可能回傳多個 ParsedResults，通常取第一個
    const text = apiResult.ParsedResults?.[0]?.ParsedText || ''

    console.log('✅ API 辨識完成')
    console.log('📜 原始文字:', text.substring(0, 50).replace(/\n/g, ' ') + '...')

    // 解析資料 (使用原本的邏輯)
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
    console.error('❌ Error:', error.message)
    return client.replyMessage(event.replyToken, {
      type: 'text',
      text: '系統忙碌中，請稍後再試。',
    })
  }
}

// 解析邏輯 (保持不變)
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
