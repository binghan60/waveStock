import * as line from '@line/bot-sdk'
import express from 'express'
import 'dotenv/config'

export default (config) => {
  const router = express.Router()
  const client = new line.Client(config)

  router.post('/', async (req, res) => {
    try {
      const events = req.body.events
      const results = await Promise.all(events.map((event) => handleEvent(event, client)))
      res.json(results)
    } catch (err) {
      console.error(err)
      await sendErrorEmail('🤖 LINE BOT 崩潰了！', err)
      res.status(500).end()
    }
  })

  return router
}

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

  if (event.type === 'message' && event.message.type === 'text') {
    return handleTextMessage(event, groupId, client)
  }

  if (event.type === 'join' || event.type === 'follow') {
    return handleJoinEvent(event, groupId, client)
  }
  if (event.type === 'message' && event.message.type === 'image') {
    return handleImageMessage(event, client) // 呼叫圖片處理函式
  }

  return Promise.resolve(null)
}

async function handleTextMessage(event, groupId, client) {
  const msg = event.message.text.trim()

  await client.replyMessage(event.replyToken, {
    type: 'text',
    text: msg,
  })
  return Promise.resolve(null)
}

// 加入 群組 或 好友時
async function handleJoinEvent(event, groupId, client) {
  const welcomeMessage = `🎉 歡迎使用！`

  return client.replyMessage(event.replyToken, {
    type: 'text',
    text: welcomeMessage,
  })
}


async function handleImageMessage(event, client) {
  try {
    // 1. 取得圖片 (Stream)
    const stream = await client.getMessageContent(event.message.id);
    
    // 2. 轉為 Buffer
    const imageBuffer = await streamToBuffer(stream);

    // 3. 圖片前處理 (關鍵步驟：轉灰階、提高對比，讓 OCR 更準)
    // 如果圖片格式非常固定，甚至可以在這裡裁切(crop)出特定區域再來辨識，速度會更快
    const processedBuffer = await preprocessImage(imageBuffer);

    // 4. 使用 Tesseract.js 進行辨識
    // 第一次執行會自動下載語言包，會比較慢，之後就會很快
    const { data: { text } } = await Tesseract.recognize(
      processedBuffer,
      'chi_tra+eng', // 使用繁體中文 + 英文
      { 
        logger: m => console.log(m) // 可以在 console 看到進度
      }
    );

    console.log('辨識出的原始文字:', text); // 除錯用，看看抓到了什麼

    // 5. 解析資料
    const stockData = parseStockData(text);

    // 6. 回覆訊息
    const replyText = `📊 分析結果 (本地 OCR)：
----------------
🎫 代號：${stockData.code || '未偵測到'}
🛡️ 支撐：${stockData.support || '未偵測到'}
💰 短停：${stockData.shortTermProfit || '未偵測到'}
🌊 波段：${stockData.waveProfit || '未偵測到'}
🔄 換股：${stockData.swapRef || '未偵測到'}
----------------`;

    return client.replyMessage(event.replyToken, { type: 'text', text: replyText });

  } catch (error) {
    console.error('OCR Error:', error);
    return client.replyMessage(event.replyToken, { type: 'text', text: '圖片辨識失敗，請確認圖片清晰度。' });
  }
}

// [工具] 圖片前處理 (使用 Sharp)
async function preprocessImage(buffer) {
  return sharp(buffer)
    .resize({ width: 1000 }) // 放大圖片通常有助於辨識文字
    .grayscale()             // 轉灰階
    .normalize()             // 增加對比度
    .threshold(180)          // 二值化：將圖片變成只有全黑和全白 (數值0-255可微調)
    .toBuffer();
}

// [工具] 文字解析 (針對你的需求調整 Regex)
function parseStockData(text) {
  // 移除多餘空白與換行，變成一行字串方便處理
  // 這裡需要根據實際 Tesseract 吐出的亂度做調整
  const cleanText = text.replace(/\s+/g, ' '); 

  const result = {};

  // 1. 股票代號 (抓取 4 個連續數字)
  const codeMatch = cleanText.match(/(\d{4})/);
  if (codeMatch) result.code = codeMatch[1];

  // 2. 數值解析邏輯
  // Tesseract 有時會把「支撐區間」辨識成「支撐區問」或類似字，Regex 要寫寬鬆一點
  
  // 支撐區間 (抓取關鍵字後的數字範圍，例如 120-130 或 120.5)
  // [^\d]* 表示中間可能夾雜冒號、空格或辨識錯誤的符號
  const supportMatch = cleanText.match(/支撐[^0-9]*([\d\.\-~]+)/);
  if (supportMatch) result.support = supportMatch[1];

  // 短期停利
  const shortMatch = cleanText.match(/短期[^0-9]*([\d\.]+)/);
  if (shortMatch) result.shortTermProfit = shortMatch[1];

  // 波段停利
  const waveMatch = cleanText.match(/波段[^0-9]*([\d\.]+)/);
  if (waveMatch) result.waveProfit = waveMatch[1];

  // 換股參考
  const swapMatch = cleanText.match(/換股[^0-9]*([\d\.]+)/);
  if (swapMatch) result.swapRef = swapMatch[1];

  return result;
}

// [工具] Stream 轉 Buffer
function streamToBuffer(stream) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    stream.on('data', (chunk) => chunks.push(chunk));
    stream.on('error', reject);
    stream.on('end', () => resolve(Buffer.concat(chunks)));
  });
}