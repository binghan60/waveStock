import mongoose from 'mongoose'

const marketBriefDeliverySchema = new mongoose.Schema(
  {
    deliveryKey: { type: String, required: true, unique: true, index: true },
    recipientId: { type: String, required: true },
    deliveryDate: { type: String, required: true },
    status: {
      type: String,
      enum: ['pending', 'sent', 'failed'],
      default: 'pending',
      required: true,
    },
    error: { type: String, default: '' },
    sentAt: Date,
  },
  { timestamps: true },
)

export default mongoose.models.MarketBriefDelivery ||
  mongoose.model('MarketBriefDelivery', marketBriefDeliverySchema)
