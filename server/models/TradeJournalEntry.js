import mongoose from 'mongoose'

const tradeJournalEntrySchema = new mongoose.Schema(
  {
    platform: { type: String, default: 'line', trim: true },
    groupId: { type: String, default: null, index: true },
    roomId: { type: String, default: null, index: true },
    userId: { type: String, default: null, index: true },
    senderName: { type: String, default: null, trim: true },
    messageId: { type: String, default: null, trim: true },
    importKey: { type: String, default: null, trim: true },
    code: { type: String, required: true, trim: true, index: true },
    name: { type: String, required: true, trim: true },
    tradeType: {
      type: String,
      enum: ['buy', 'sell_half', 'sell_all'],
      required: true,
      index: true,
    },
    action: { type: String, enum: ['buy', 'sell'], required: true, index: true },
    fraction: { type: Number, min: 0.01, max: 1, default: 1 },
    quantity: { type: Number, min: 0, default: null },
    price: { type: Number, min: 0, default: null },
    priceSource: {
      type: String,
      enum: ['market_snapshot', 'shioaji_tick', 'manual', 'unknown'],
      default: 'unknown',
    },
    marketTimestamp: { type: Date, default: null },
    pricingRule: { type: String, default: null, trim: true },
    performanceEligible: { type: Boolean, default: true, index: true },
    excludedReason: { type: String, default: null, trim: true },
    isMarketOrder: { type: Boolean, default: false },
    rawText: { type: String, required: true },
    occurredAt: { type: Date, required: true, index: true },
  },
  { timestamps: true },
)

tradeJournalEntrySchema.index(
  { platform: 1, messageId: 1 },
  { unique: true, partialFilterExpression: { messageId: { $type: 'string' } } },
)
tradeJournalEntrySchema.index(
  { importKey: 1 },
  { unique: true, partialFilterExpression: { importKey: { $type: 'string' } } },
)
tradeJournalEntrySchema.index({ groupId: 1, occurredAt: -1 })

export default mongoose.model('TradeJournalEntry', tradeJournalEntrySchema)
