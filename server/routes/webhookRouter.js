import * as line from '@line/bot-sdk'
import express from 'express'
import 'dotenv/config'
import Tesseract from 'tesseract.js'
import sharp from 'sharp'
import path from 'path' // 新增
import fs from 'fs' // 新增
import { fileURLToPath } from 'url' // 新增

// 👇 1. 定義 __dirname (ESM 必備，用來定位 tess_bin 資料夾)
const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

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

// 事件分發器
async function handleEvent(event, client) {
  const sourceType = event.source.type
  let groupId

  if (sourceType === 'user') {
    groupId = event.source.userId
  } else if (sourceType === 'group') {
    groupId = event.source.groupId
  } else if (sourceType === 'room') {
    groupId = event.source.roomId
  }

  // 1. 文字訊息處理
  if (event.type === 'message' && event.message.type === 'text') {
    return handleTextMessage(event, groupId, client)
  }

  // 2. 圖片訊息處理
  if (event.type === 'message' && event.message.type === 'image') {
    return handleImageMessage(event, client)
  }

  // 3. 加入/追蹤事件處理
  if (event.type === 'join' || event.type === 'follow') {
    return handleJoinEvent(event, groupId, client)
  }

  return Promise.resolve(null)
}

// 文字訊息邏輯
async function handleTextMessage(event, groupId, client) {
  const msg = event.message.text.trim()
  await client.replyMessage(event.replyToken, {
    type: 'text',
    text: msg,
  })
  return Promise.resolve(null)
}

// 歡迎訊息邏輯
async function handleJoinEvent(event, groupId, client) {
  const welcomeMessage = `🎉 歡迎使用！請傳送股票分析圖給我，我會幫您辨識資訊。`
  return client.replyMessage(event.replyToken, {
    type: 'text',
    text: welcomeMessage,
  })
}

// ---------------------------------------------------------
// 👇 核心功能：圖片辨識邏輯 (改為讀取本地 tess_bin)
// ---------------------------------------------------------
async function handleImageMessage(event, client) {
  try {
    // 1. 取得圖片串流
    const stream = await client.getMessageContent(event.message.id)
    const imageBuffer = await streamToBuffer(stream)

    // 2. 圖片前處理
    const processedBuffer = await preprocessImage(imageBuffer)

    // 👇 [關鍵修改] 定義核心檔案路徑
    // 假設 tess_bin 跟這支程式碼在同一層 (例如都在 server/ 資料夾下)
    let localCorePath = path.join(__dirname, 'tess_bin', 'tesseract-core.wasm.js')

    // 安全檢查：如果找不到，嘗試往上一層找 (預防部署結構差異)
    if (!fs.existsSync(localCorePath)) {
      console.warn(`⚠️ 注意：在 ${localCorePath} 找不到核心，嘗試上一層...`)
      localCorePath = path.join(__dirname, '../tess_bin', 'tesseract-core.wasm.js')
    }

    console.log(`⏳ OCR 引擎啟動 (Local Mode)，使用核心: ${localCorePath}`)

    // 3. Tesseract OCR 辨識
    const {
      data: { text },
    } = await Tesseract.recognize(processedBuffer, 'chi_tra+eng', {
      // 👇 [關鍵 1] 強制使用本地檔案，不依賴 CDN，也不依賴 node_modules
      corePath: localCorePath,

      // 👇 [關鍵 2] Vercel 唯讀環境，必須設為 /tmp
      cachePath: '/tmp',

      logger: (m) => {
        if (m.status === 'recognizing text' && (m.progress * 100) % 20 === 0) {
          console.log(`OCR Progress: ${(m.progress * 100).toFixed(0)}%`)
        }
      },
    })

    console.log('📜 [OCR 原始結果]:', text.replace(/\n/g, ' '))

    // 4. 解析資料
    const stockData = parseStockData(text)

    if (!stockData.code) {
      return client.replyMessage(event.replyToken, {
        type: 'text',
        text: '⚠️ 辨識失敗：找不到股票代號，請確認圖片清晰度。',
      })
    }

    const replyText = `📊 分析結果
──────────────
🎫 代號：${stockData.code}
🛡️ 支撐：${stockData.support || '無資料'}
💰 短線：${stockData.shortTermProfit || '無資料'}
🌊 波段：${stockData.waveProfit || '無資料'}
🔄 換股：${stockData.swapRef || '無資料'}
──────────────
(此為自動辨識結果，僅供參考)`

    return client.replyMessage(event.replyToken, { type: 'text', text: replyText })
  } catch (error) {
    console.error('❌ OCR Error:', error)
    // 印出當前目錄，方便除錯路徑問題
    console.error('Current CWD:', process.cwd())
    return client.replyMessage(event.replyToken, {
      type: 'text',
      text: '圖片辨識發生錯誤，請稍後再試。',
    })
  }
}

// [工具] 圖片前處理 (Sharp)
async function preprocessImage(buffer) {
  return sharp(buffer).resize({ width: 1500 }).grayscale().normalize().threshold(160).toBuffer()
}

// [工具] 文字解析 (強效容錯版 Regex)
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

// [工具] Stream 轉 Buffer
function streamToBuffer(stream) {
  return new Promise((resolve, reject) => {
    const chunks = []
    stream.on('data', (chunk) => chunks.push(chunk))
    stream.on('error', reject)
    stream.on('end', () => resolve(Buffer.concat(chunks)))
  })
}
