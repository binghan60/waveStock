import mongoose from 'mongoose'

const stockHitLogSchema = new mongoose.Schema(
  {
    // 關聯回原本的股票 (方便之後用 populate 查)
    stockId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'RecognizedStock',
      required: true,
    },
    // 股票代號 (冗餘儲存，方便直接看)
    code: {
      type: String,
      required: true,
    },
    // 觸及類型：支撐、短線、波段、換股
    type: {
      type: String,
      enum: ['support', 'shortTerm', 'wave', 'swap'],
      required: true,
    },
    // 設定的目標價
    targetPrice: {
      type: Number,
      required: true,
    },
    // 當時的實際價格 (Highest 或 Lowest)
    triggerPrice: {
      type: Number,
      required: true,
    },
    // 發生時間 (預設就是現在)
    happenedAt: {
      type: Date,
      default: Date.now,
    }
  },
  { timestamps: true }
)

// 建立索引：方便查詢「某支股票今天有沒有達標過」
stockHitLogSchema.index({ stockId: 1, type: 1, happenedAt: -1 })

const StockHitLog = mongoose.model('StockHitLog', stockHitLogSchema)

export default StockHitLog