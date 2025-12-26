import * as line from '@line/bot-sdk'
import express from 'express'
import 'dotenv/config'
import Tesseract from 'tesseract.js'
import sharp from 'sharp'

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

// ✅ 使用本地檔案路徑
async function handleImageMessage(event, client) {
  try {
    const stream = await client.getMessageContent(event.message.id)
    const imageBuffer = await streamToBuffer(stream)
    const processedBuffer = await preprocessImage(imageBuffer)

    console.log('⏳ OCR 引擎啟動 (Local Files Mode)...')

    const {
      data: { text },
    } = await Tesseract.recognize(processedBuffer, 'chi_tra+eng', {
      // ✅ 使用專案內的本地檔案
      workerPath: '/tesseract/worker.min.js',
      corePath: '/tesseract',
      
      // 語言包還是用 CDN (因為檔案太大)
      langPath: 'https://cdn.jsdelivr.net/npm/tesseract.js-core@5/lang-data',
      
      // Vercel 的暫存路徑
      cachePath: '/tmp',

      logger: (m) => {
        if (m.status === 'recognizing text' && m.progress === 1) {
          console.log('✅ OCR 完成')
        }
      },
    })

    console.log('📜 [OCR 成功]:', text.substring(0, 50).replace(/\n/g, ' ') + '...')
    const stockData = parseStockData(text)

    if (!stockData.code) {
      return client.replyMessage(event.replyToken, { 
        type: 'text', 
        text: '⚠️ 辨識失敗：找不到股票代號' 
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
    console.error('❌ OCR Critical Error:', error)
    return client.replyMessage(event.replyToken, { 
      type: 'text', 
      text: '系統忙碌中，請稍後再試。' 
    })
  }
}

// --- 工具函式 ---

async function preprocessImage(buffer) {
  return sharp(buffer)
    .resize({ width: 1000 })
    .grayscale()
    .normalize()
    .threshold(160)
    .toBuffer()
}

function parseStockData(text) {
  let cleanText = text
    .replace(/\s+/g, ' ')
    .replace(/O/g, '0')
    .replace(/o/g, '0')
    .replace(/l/g, '1')
    .replace(/I/g, '1')
    
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