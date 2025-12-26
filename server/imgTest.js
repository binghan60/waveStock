// 1. 修改 Import 方式
import Tesseract from 'tesseract.js' // 改成這樣，不要用 { recognize }
import sharp from 'sharp'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

// 2. 因為使用 import 語法，需重新定義 __dirname
const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

// 設定你要測試的圖片檔名
const TARGET_IMAGE = 'sample.jpg'

;(async () => {
  try {
    const imagePath = path.join(__dirname, TARGET_IMAGE)

    if (!fs.existsSync(imagePath)) {
      console.error(`❌ 找不到檔案: ${TARGET_IMAGE}，請確認圖片已放入資料夾: ${__dirname}`)
      return
    }

    console.log(`🚀 開始處理圖片: ${TARGET_IMAGE}`)

    const rawBuffer = fs.readFileSync(imagePath)

    // 圖片前處理
    const processedBuffer = await preprocessImage(rawBuffer)

    // 輸出除錯圖片
    fs.writeFileSync(path.join(__dirname, 'debug_output.jpg'), processedBuffer)
    console.log('📸 已輸出除錯圖片: debug_output.jpg')

    console.log('⏳ OCR 辨識中...')

    // 3. 呼叫方式改為 Tesseract.recognize
    const {
      data: { text },
    } = await Tesseract.recognize(processedBuffer, 'chi_tra+eng', {
      logger: (m) => {
        if (m.status === 'recognizing text') {
          // 簡單的進度顯示
          process.stdout.write(`\r進度: ${(m.progress * 100).toFixed(0)}%`)
        }
      },
    })
    console.log('\n✅ 辨識完成！')

    console.log('--------------------------------')
    console.log('📜 [原始辨識文字]:')
    console.log(text)
    console.log('--------------------------------')

    const result = parseStockData(text)

    console.log('📊 [最終解析結果 JSON]:')
    console.log(result)
  } catch (error) {
    console.error('❌ 發生錯誤:', error)
  }
})()

// --- 工具函式 ---

async function preprocessImage(buffer) {
  return sharp(buffer).resize({ width: 1500 }).grayscale().normalize().threshold(160).toBuffer()
}

function parseStockData(text) {
  const cleanText = text.replace(/\\s+/g, ' ')
  const result = {}

  const codeMatch = cleanText.match(/(\\d{4})/)
  if (codeMatch) result.code = codeMatch[1]

  // 支撐可能是範圍 (例如 245-250 或 245~250)
  const supportMatch = cleanText.match(/支撐[^0-9]*([\\d\\.]+(?:[-~][\\d\\.]+)?)/)
  if (supportMatch) result.support = supportMatch[1]

  const shortMatch = cleanText.match(/短線[^0-9]*([\\d\\.]+)/)
  if (shortMatch) result.shortTermProfit = shortMatch[1]

  const waveMatch = cleanText.match(/波段[^0-9]*([\\d\\.]+)/)
  if (waveMatch) result.waveProfit = waveMatch[1]

  const swapMatch = cleanText.match(/[換挽换][^0-9\\n]*([\\d\\.]+)/)
  if (swapMatch) result.swapRef = swapMatch[1]
  
  return result
}
