import express from 'express'
import TradeJournalEntry from '../models/TradeJournalEntry.js'
import { fetchStockData } from '../services/stockService.js'
import { calculateTradePerformance, parseTradeMessages } from '../services/tradeJournalService.js'

const router = express.Router()
router.use(express.json())

const buildQuery = (query) => {
  const result = {}
  if (query.groupId) result.groupId = query.groupId
  if (query.userId) result.userId = query.userId
  if (query.code) result.code = query.code
  return result
}

router.post('/parse', (req, res) => {
  const parsedList = parseTradeMessages(req.body.text, { senderName: req.body.senderName })
  if (!parsedList || parsedList.length === 0) return res.status(422).json({ error: '無法辨識股票交易訊息' })
  return res.json(parsedList)
})

router.post('/entries', async (req, res) => {
  try {
    const parsedList = parseTradeMessages(req.body.rawText || req.body.text, {
      senderName: req.body.senderName,
    })
    if (!parsedList || parsedList.length === 0) return res.status(422).json({ error: '無法辨識股票交易訊息' })

    const entries = await Promise.all(parsedList.map(async (parsed) => {
      return await TradeJournalEntry.create({
        ...parsed,
        ...req.body,
        rawText: req.body.rawText || req.body.text,
        priceSource: req.body.price ? 'manual' : 'unknown',
        occurredAt: req.body.occurredAt || new Date(),
      })
    }))
    
    return res.status(201).json(entries)
  } catch (error) {
    return res.status(400).json({ error: error.message })
  }
})

router.patch('/entries/:id', async (req, res) => {
  try {
    const allowed = ['price', 'quantity', 'fraction', 'occurredAt', 'senderName']
    const update = Object.fromEntries(
      Object.entries(req.body).filter(([key]) => allowed.includes(key)),
    )
    if (Object.hasOwn(update, 'price')) update.priceSource = 'manual'

    const entry = await TradeJournalEntry.findByIdAndUpdate(req.params.id, update, {
      new: true,
      runValidators: true,
    })
    if (!entry) return res.status(404).json({ error: '找不到交易紀錄' })
    return res.json(entry)
  } catch (error) {
    return res.status(400).json({ error: error.message })
  }
})

router.get('/entries', async (req, res) => {
  const limit = Math.min(500, Math.max(1, Number(req.query.limit) || 100))
  const entries = await TradeJournalEntry.find(buildQuery(req.query))
    .sort({ occurredAt: -1 })
    .limit(limit)
    .lean()
  res.json(entries)
})

router.get('/performance', async (req, res) => {
  const entries = await TradeJournalEntry.find(buildQuery(req.query))
    .sort({ occurredAt: 1 })
    .lean()
  const openCodes = [...new Set(
    entries
      .filter((entry) => entry.performanceEligible !== false)
      .map((entry) => entry.code),
  )]
  const quotes = openCodes.length ? await fetchStockData(openCodes) : []
  const prices = Object.fromEntries(
    quotes.map((quote) => [quote.symbol, Number(quote.currentPrice)]),
  )
  res.json(calculateTradePerformance(entries, prices))
})

export default router
