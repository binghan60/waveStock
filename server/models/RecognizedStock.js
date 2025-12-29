import mongoose from 'mongoose'

const recognizedStockSchema = new mongoose.Schema(
  {
    // 股票代號
    code: {
      type: String,
      required: true,
      trim: true,
    },
    // 支撐價位
    support: {
      type: String,
      default: null,
    },
    // 短線獲利目標
    shortTermProfit: {
      type: String,
      default: null,
    },
    // 波段獲利目標
    waveProfit: {
      type: String,
      default: null,
    },
    // 換股參考
    swapRef: {
      type: String,
      default: null,
    },
    // 傳入當下的股價
    currentPrice: {
      type: String,
      default: null,
    },
    // 是否成功（預留欄位，先給空值）
    isSuccess: {
      type: Boolean,
      default: null,
    },
    // 來源類型：'user' (使用者自選) 或 'system' (系統推薦)
    source: {
      type: String,
      enum: ['user', 'system'],
      default: 'system',
    },
    // 是否為自選股
    isFavorite: {
      type: Boolean,
      default: false,
    },
  },
  {
    timestamps: true, // 自動加入 createdAt 和 updatedAt (記錄傳入時間)
  }
)

// 建立索引，方便查詢
recognizedStockSchema.index({ code: 1, createdAt: -1 })
recognizedStockSchema.index({ source: 1 })
recognizedStockSchema.index({ isFavorite: 1 })

const RecognizedStock = mongoose.model('RecognizedStock', recognizedStockSchema)

export default RecognizedStock
