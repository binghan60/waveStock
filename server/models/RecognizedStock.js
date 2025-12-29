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
    // 是否成功
    isSuccess: {
      type: Boolean,
      default: null,
    },
    // 達標日期（當 isSuccess 變為 true 時記錄）
    successDate: {
      type: Date,
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

// ... 索引設定不變 ...
recognizedStockSchema.index({ code: 1, createdAt: -1 })
recognizedStockSchema.index({ source: 1 })
recognizedStockSchema.index({ isFavorite: 1 })
// 建議也可以幫 successDate 加索引，方便查詢「最近達標」的股票
recognizedStockSchema.index({ successDate: -1 })

const RecognizedStock = mongoose.model('RecognizedStock', recognizedStockSchema)

export default RecognizedStock
