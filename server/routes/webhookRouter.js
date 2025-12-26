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

// 👇👇👇 修正重點 👇👇👇
async function handleImageMessage(event, client) {
  let worker = null
  try {
    console.log('📥 下載圖片...')
    const stream = await client.getMessageContent(event.message.id)
    const imageBuffer = await streamToBuffer(stream)

    console.log('🔧 圖片前處理...')
    const processedBuffer = await preprocessImage(imageBuffer)

    console.log('⏳ 初始化 OCR Worker (Local Script + CDN Core)...')

    // [修正] 不設定 workerPath，讓它自己去 node_modules 找 (解決 ERR_WORKER_PATH)
    // 只設定 corePath，解決 WASM 找不到的問題 (解決 ENOENT)
    worker = await Tesseract.createWorker('chi_tra+eng', 1, {
      
      // 1. [關鍵] 不要設定 workerPath！讓它使用本地安裝的腳本
      
      // 2. [關鍵] 核心 WASM 強制走 CDN
      // 這會讓本地的 Worker 去網路上抓 WASM，而不是去讀硬碟
      corePath: 'https://cdn.jsdelivr.net/npm/tesseract.js-core@5.1.0/tesseract-core.wasm.js',
      
      // 3. [關鍵] 快取路徑 (Vercel 唯一可寫)
      cachePath: '/tmp',

      logger: m => {
        if (m.status === 'recognizing text' && (m.progress * 100) % 50 === 0) {
           console.log(`進度: ${(m.progress * 100).toFixed(0)}%`);
        }
      }
    });

    console.log('🚀 開始辨識...');
    
    const { data: { text } } = await worker.recognize(processedBuffer);
    
    console.log('✅ 辨識完成');
    console.log('📜 原始文字:', text.substring(0, 50).replace(/\n/g, ' ') + '...');
    
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
    console.error('❌ OCR Error:', error)
    return client.replyMessage(event.replyToken, { 
      type: 'text', 
      text: '系統忙碌中，請稍後再試。' 
    })
  } finally {
    if (worker) {
      await worker.terminate(); 
    }
  }
}

async function preprocessImage(buffer) {
  return sharp(buffer)
    .resize({ width: 1000 })
    .grayscale()
    .normalize()
    .threshold(160)
    .toBuffer()
}

function parseStockData(text) {
  const cleanText = text
    .replace(/\s+/g, ' ')
    .replace(/O/g, '0')
    .replace(/o/g, '0')
    .replace(/l/g, '1')
    .replace(/I/g, '1')
    
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