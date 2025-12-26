import * as line from '@line/bot-sdk'
import express from 'express'
import 'dotenv/config'
import Tesseract from 'tesseract.js' // 新增: 引入 OCR
import sharp from 'sharp' // 新增: 引入圖片處理

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

  // 2. 圖片訊息處理 (新增功能)
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

  // 這裡可以加入其他文字指令邏輯
  await client.replyMessage(event.replyToken, {
    type: 'text',
    text: msg, // 目前設定為回聲機器人 (Echo)
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
// 👇 核心功能：圖片辨識邏輯 (已整合測試成功的參數)
// ---------------------------------------------------------
async function handleImageMessage(event, client) {
  try {
    // 1. 取得圖片串流
    const stream = await client.getMessageContent(event.message.id)
    const imageBuffer = await streamToBuffer(stream)

    // 2. 圖片前處理
    const processedBuffer = await preprocessImage(imageBuffer)

    console.log('⏳ OCR 引擎啟動中 (Vercel Mode)...');

    // 3. Tesseract OCR 辨識 (Vercel 專用設定)
    const { data: { text } } = await Tesseract.recognize(
      processedBuffer,
      'chi_tra+eng', 
      { 
        // 👇 [關鍵 1] 核心 WASM 檔：指向 CDN
        // 這解決了 "ENOENT ... .wasm" 找不到檔案的問題
        corePath: 'https://cdn.jsdelivr.net/npm/tesseract.js-core@5.1.0/tesseract-core.wasm.js',

        // 👇 [關鍵 2] 移除 workerPath 設定
        // 讓 Node.js 自動去 node_modules 找本地 worker，解決 "ERR_WORKER_PATH" 錯誤
        
        // 👇 [關鍵 3] 設定快取與日誌路徑為 /tmp
        // Vercel 只有 /tmp 可寫入，不設這個會因為無法下載語言包而報錯
        cachePath: '/tmp',
        
        logger: m => {
          if (m.status === 'recognizing text' && (m.progress * 100) % 20 === 0) {
            console.log(`OCR Progress: ${(m.progress * 100).toFixed(0)}%`)
          }
        }
      }
    )

    console.log('📜 [OCR 原始結果]:', text.replace(/\n/g, ' ')) 

    // 4. 解析資料
    const stockData = parseStockData(text)

    // (後面邏輯不變...)
    if (!stockData.code) {
        return client.replyMessage(event.replyToken, {
            type: 'text',
            text: '⚠️ 辨識失敗：找不到股票代號，請確認圖片清晰度。'
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
    return client.replyMessage(event.replyToken, { 
        type: 'text', 
        text: '圖片辨識發生錯誤，請稍後再試。' 
    })
  }
}
// [工具] 圖片前處理 (Sharp)
async function preprocessImage(buffer) {
  return sharp(buffer)
    .resize({ width: 1500 }) // 放大至 1500px (測試驗證過較佳)
    .grayscale() // 轉灰階
    .normalize() // 拉高對比
    .threshold(160) // 二值化 (測試驗證過較佳)
    .toBuffer()
}

// [工具] 文字解析 (強效容錯版 Regex)
function parseStockData(text) {
  // 1. 預先修正常見 OCR 錯誤 (例如 l->1, O->0)
  let cleanText = text.replace(/\s+/g, ' ').replace(/O/g, '0').replace(/o/g, '0').replace(/l/g, '1').replace(/I/g, '1')

  const result = {}

  // 1. 股票代號
  const codeMatch = cleanText.match(/(\d{4})/)
  if (codeMatch) result.code = codeMatch[1]

  // 2. 數值解析 (容錯寫法)

  // 支撐區間
  const supportMatch = cleanText.match(/支[^0-9\n]*([\d\.\-~]+)/)
  if (supportMatch) result.support = supportMatch[1]

  // 短期停利 / 短線 (關鍵修正：同時支援 "短期" 與 "短線"，並容錯 "矩")
  const shortMatch = cleanText.match(/[短矩][^0-9\n]*([\d\.]+)/)
  if (shortMatch) result.shortTermProfit = shortMatch[1]

  // 波段停利
  const waveMatch = cleanText.match(/波[^0-9\n]*([\d\.]+)/)
  if (waveMatch) result.waveProfit = waveMatch[1]

  // 換股參考 (容錯 "挽", "换")
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
