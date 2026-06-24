import 'dotenv/config'
import crypto from 'node:crypto'
import dns from 'node:dns/promises'
import fs from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'
import mongoose from 'mongoose'
import TradeJournalEntry from '../models/TradeJournalEntry.js'

dns.setServers(['1.1.1.1'])

const EQUAL_NOTIONAL_TWD = 100_000
const PREVIEW_PATH = path.resolve('data/trade-journal-preview.json')
const shouldCommit = process.argv.includes('--commit')
const shouldPruneExcluded = process.argv.includes('--prune-excluded')

const buildImportKey = (entry) => {
  const identity = [
    entry.occurred_at,
    entry.code,
    entry.trade_type,
    entry.source_line,
  ].join('|')
  return `line-history:${crypto.createHash('sha256').update(identity).digest('hex')}`
}

const normalizeName = (name) => String(name || '')
  .replace(/^(?:將資金轉入|轉入|換股)/, '')
  .trim()

const toDocument = (entry) => {
  return {
    platform: 'line-history',
    senderName: entry.sender_name,
    importKey: buildImportKey(entry),
    code: entry.code,
    name: normalizeName(entry.name),
    tradeType: entry.trade_type,
    action: entry.action,
    fraction: entry.fraction,
    quantity: entry.action === 'buy'
      ? EQUAL_NOTIONAL_TWD / Number(entry.price)
      : null,
    price: Number(entry.price),
    priceSource: 'shioaji_tick',
    marketTimestamp: new Date(entry.market_timestamp),
    pricingRule: entry.pricing_rule,
    performanceEligible: true,
    excludedReason: null,
    isMarketOrder: entry.source_line.includes('市價'),
    rawText: entry.raw_text,
    occurredAt: new Date(entry.occurred_at),
  }
}

const getTaipeiDayRange = (date) => {
  const taipeiDate = new Date(date.getTime() + 8 * 60 * 60 * 1000)
  taipeiDate.setUTCHours(0, 0, 0, 0)
  const start = new Date(taipeiDate.getTime() - 8 * 60 * 60 * 1000)
  const end = new Date(start.getTime() + 24 * 60 * 60 * 1000)
  return { start, end }
}

const findExistingMessage = async (document) => {
  const minuteStart = new Date(document.occurredAt)
  minuteStart.setSeconds(0, 0)
  const minuteEnd = new Date(minuteStart.getTime() + 60_000)
  const minuteMatch = await TradeJournalEntry.findOne({
    code: document.code,
    tradeType: document.tradeType,
    occurredAt: { $gte: minuteStart, $lt: minuteEnd },
  })
  if (minuteMatch) return minuteMatch

  const { start, end } = getTaipeiDayRange(document.occurredAt)
  const sameDayMatches = await TradeJournalEntry.find({
    code: document.code,
    tradeType: document.tradeType,
    action: document.action,
    occurredAt: { $gte: start, $lt: end },
  }).sort({ occurredAt: 1 })

  return sameDayMatches.find((entry) => {
    return !entry.importKey
      || entry.platform !== 'line-history'
      || entry.priceSource !== 'shioaji_tick'
  }) || null
}

const main = async () => {
  if (!process.env.MONGODB_URI) throw new Error('MONGODB_URI is required')
  const preview = JSON.parse(await fs.readFile(PREVIEW_PATH, 'utf8'))
  const sourceEntries = preview.entries.filter((entry) => entry.status === 'ready')

  await mongoose.connect(process.env.MONGODB_URI)
  let prunedExcludedCount = 0
  if (shouldCommit && shouldPruneExcluded) {
    const result = await TradeJournalEntry.deleteMany({
      platform: 'line-history',
      performanceEligible: false,
      excludedReason: 'missing_buy_before_export',
    })
    prunedExcludedCount = result.deletedCount
  }
  const operations = []

  for (const sourceEntry of sourceEntries) {
    const document = toDocument(sourceEntry)
    const imported = await TradeJournalEntry.findOne({ importKey: document.importKey })
    if (imported) {
      operations.push({ action: 'skip_imported', code: document.code, occurredAt: document.occurredAt })
      continue
    }

    const existing = await findExistingMessage(document)
    if (existing) {
      operations.push({
        action: 'update_existing',
        id: existing.id,
        code: document.code,
        occurredAt: document.occurredAt,
        document,
      })
      if (shouldCommit) {
        await TradeJournalEntry.updateOne({ _id: existing._id }, { $set: document })
      }
      continue
    }

    operations.push({
      action: 'insert',
      code: document.code,
      occurredAt: document.occurredAt,
      document,
    })
    if (shouldCommit) await TradeJournalEntry.create(document)
  }

  const summary = {
    mode: shouldCommit ? 'commit' : 'dry-run',
    sourceCount: sourceEntries.length,
    insertCount: operations.filter((item) => item.action === 'insert').length,
    updateCount: operations.filter((item) => item.action === 'update_existing').length,
    skippedCount: operations.filter((item) => item.action === 'skip_imported').length,
    performanceEligibleCount: operations.filter((item) => item.document?.performanceEligible).length,
    excludedCount: 0,
    prunedExcludedCount,
    equalNotionalTwd: EQUAL_NOTIONAL_TWD,
  }
  console.log(JSON.stringify({ summary, operations }, null, 2))
}

try {
  await main()
} finally {
  await mongoose.disconnect()
}
