import 'dotenv/config'
import dns from 'node:dns/promises'
import mongoose from 'mongoose'
import TradeJournalEntry from '../models/TradeJournalEntry.js'
import { fetchStockData } from '../services/stockService.js'
import { calculateTradePerformance } from '../services/tradeJournalService.js'

dns.setServers(['1.1.1.1'])

const main = async () => {
  if (!process.env.MONGODB_URI) throw new Error('MONGODB_URI is required')
  await mongoose.connect(process.env.MONGODB_URI)

  const entries = await TradeJournalEntry.find({})
    .sort({ occurredAt: 1 })
    .lean()
  const eligibleEntries = entries.filter((entry) => entry.performanceEligible !== false)
  const preliminary = calculateTradePerformance(entries, {})
  const openCodes = preliminary.positions
    .filter((position) => position.status === 'open')
    .map((position) => position.code)
  const quotes = await fetchStockData(openCodes)
  const currentPrices = Object.fromEntries(
    quotes.map((quote) => [quote.symbol, Number(quote.currentPrice)]),
  )
  const performance = calculateTradePerformance(entries, currentPrices)

  console.log(JSON.stringify({
    database: {
      totalEntries: entries.length,
      eligibleEntries: eligibleEntries.length,
      excludedEntries: entries.length - eligibleEntries.length,
      shioajiPricedEntries: entries.filter((entry) => entry.priceSource === 'shioaji_tick').length,
    },
    summary: performance.summary,
    positions: performance.positions,
  }, null, 2))
}

try {
  await main()
} finally {
  await mongoose.disconnect()
  process.exit()
}
