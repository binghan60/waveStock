import * as line from '@line/bot-sdk'
import express from 'express'
import 'dotenv/config'
import Tesseract from 'tesseract.js'
import sharp from 'sharp'

// 定義 Tesseract 版本 (確保 CDN 與核心版本一致)
const TESSERACT_VERSION = '5.1.0'

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
  // ... (其他事件判斷保持不變)
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

// 👇 核心修正：使用 CDN 解決找不到檔案的問題
async function handleImageMessage(event, client) {
  try {
    const stream = await client.getMessageContent(event.message.id)
    const imageBuffer = await streamToBuffer(stream)
    const processedBuffer = await preprocessImage(imageBuffer)

    console.log('⏳ OCR 引擎啟動 (Hybrid CDN Mode)...')

    const {
      data: { text },
    } = await Tesseract.recognize(processedBuffer, 'chi_tra+eng', {
      // ✅ [關鍵修正 1] 強制核心去 CDN 下載
      // 這會讓它不要去 node_modules 找那個不存在的 .wasm 檔
      corePath: `https://cdn.jsdelivr.net/npm/tesseract.js-core@${TESSERACT_VERSION}/tesseract-core.wasm.js`,

      // ✅ [關鍵修正 2] 絕對不要設定 workerPath
      // 讓 Node.js 自動使用 node_modules 裡的 worker，解決 "ERR_WORKER_PATH"

      // ✅ [關鍵修正 3] 語言包快取路徑
      cachePath: '/tmp',

      logger: (m) => {
        // 只印出重要進度，避免 log 太多導致 Vercel 變慢
        if (m.status === 'recognizing text' && (m.progress * 100) % 50 === 0) {
          console.log(`OCR Progress: ${(m.progress * 100).toFixed(0)}%`)
        }
      },
    })

    console.log('📜 [OCR 成功]:', text.substring(0, 50).replace(/\n/g, ' ') + '...')
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
    console.error('❌ OCR Critical Error:', error)
    return client.replyMessage(event.replyToken, { type: 'text', text: '系統忙碌中，請稍後再試。' })
  }
}

// --- 工具函式 ---

async function preprocessImage(buffer) {
  return sharp(buffer)
    .resize({ width: 1000 }) // ⚠️ 改為 1000 以節省記憶體並加快速度，避免 Timeout
    .grayscale()
    .normalize()
    .threshold(160)
    .toBuffer()
}

function parseStockData(text) {
  let cleanText = text.replace(/\s+/g, ' ').replace(/O/g, '0').replace(/o/g, '0').replace(/l/g, '1').replace(/I/g, '1')
  const result = {}
  const codeMatch = cleanText.match(/(\d{4})/)
  if (codeMatch) result.code = codeMatch[1]
  const supportMatch = cleanText.match(/支[^0-9\n]*([\d\.\-~]+)/)
  if (supportMatch) result.support = supportMatch[1]
  const shortMatch = cleanText.match(/[短矩][^0-9\n]*([\d\.]+)/)
  if (shortMatch) result.shortTermProfit = shortMatch[1]
  const waveMatch = cleanText.match(/波[^0-9\n]*([\d\.]+)/)
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
