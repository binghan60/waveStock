import express from 'express'
import OrderIntent from '../models/OrderIntent.js'
import { parseTradeMessages } from '../services/tradeJournalService.js'
import {
  buildOrderIntentDraft,
  confirmOrderIntent,
  rejectOrderIntent,
} from '../services/orderIntentService.js'

const router = express.Router()
router.use(express.json())

const buildQuery = (query) => {
  const result = {}
  if (query.status && query.status !== 'all') result.status = query.status
  if (query.code) result.code = query.code
  return result
}

router.get('/', async (req, res) => {
  const limit = Math.min(200, Math.max(1, Number(req.query.limit) || 100))
  const intents = await OrderIntent.find(buildQuery(req.query))
    .sort({ occurredAt: -1, createdAt: -1 })
    .limit(limit)
    .lean()
  res.json(intents)
})

router.post('/from-message', async (req, res) => {
  try {
    const rawText = req.body.rawText || req.body.text
    const parsedList = parseTradeMessages(rawText, { senderName: req.body.senderName })
    if (!parsedList || parsedList.length === 0) {
      return res.status(422).json({ error: 'no_trade_signal' })
    }

    const intents = []
    for (const [index, parsed] of parsedList.entries()) {
      const draft = await buildOrderIntentDraft({
        event: {
          message: {
            id: req.body.messageId || `manual-${Date.now()}-${index}`,
            text: rawText,
          },
          source: {
            groupId: req.body.groupId || null,
            roomId: req.body.roomId || null,
            userId: req.body.userId || null,
          },
          timestamp: req.body.occurredAt ? new Date(req.body.occurredAt).getTime() : Date.now(),
        },
        parsed,
        entry: null,
        index,
        total: parsedList.length,
      })
      const existing = await OrderIntent.findOne({ sourceKey: draft.sourceKey })
      intents.push(existing || await OrderIntent.create(draft))
    }

    res.status(201).json(intents)
  } catch (error) {
    res.status(error.statusCode || 400).json({ error: error.message })
  }
})

router.post('/:id/confirm', async (req, res) => {
  try {
    const intent = await confirmOrderIntent(req.params.id)
    res.json(intent)
  } catch (error) {
    res.status(error.statusCode || 400).json({ error: error.message })
  }
})

router.post('/:id/reject', async (req, res) => {
  try {
    const intent = await rejectOrderIntent(req.params.id)
    res.json(intent)
  } catch (error) {
    res.status(error.statusCode || 400).json({ error: error.message })
  }
})

export default router
