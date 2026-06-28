import mongoose from 'mongoose'

const orderIntentSchema = new mongoose.Schema(
  {
    source: { type: String, default: 'line', trim: true, index: true },
    sourceMessageId: { type: String, required: true, trim: true },
    sourceKey: { type: String, required: true, trim: true, unique: true },
    tradeJournalEntryId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'TradeJournalEntry',
      default: null,
      index: true,
    },
    groupId: { type: String, default: null, index: true },
    roomId: { type: String, default: null, index: true },
    userId: { type: String, default: null, index: true },
    senderName: { type: String, default: null, trim: true },
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
    isMarketOrder: { type: Boolean, default: false },
    suggestedAmount: { type: Number, min: 0, default: null },
    suggestedQuantity: { type: Number, min: 0, default: null },
    referencePrice: { type: Number, min: 0, default: null },
    priceSource: { type: String, default: 'unknown', trim: true },
    warnings: { type: [String], default: [] },
    rawText: { type: String, required: true },
    occurredAt: { type: Date, required: true, index: true },
    status: {
      type: String,
      enum: ['pending_confirm', 'approved', 'submitted', 'failed', 'cancelled', 'rejected'],
      default: 'pending_confirm',
      index: true,
    },
    confirmedAt: { type: Date, default: null },
    rejectedAt: { type: Date, default: null },
    submittedAt: { type: Date, default: null },
    brokerService: { type: String, default: null, trim: true },
    brokerOrderId: { type: String, default: null, trim: true },
    brokerStatus: { type: String, default: null, trim: true },
    brokerMessage: { type: String, default: null, trim: true },
    submitPayload: { type: mongoose.Schema.Types.Mixed, default: null },
    submitResponse: { type: mongoose.Schema.Types.Mixed, default: null },
  },
  { timestamps: true },
)

orderIntentSchema.index({ status: 1, occurredAt: -1 })
orderIntentSchema.index({ code: 1, status: 1 })

export default mongoose.model('OrderIntent', orderIntentSchema)
