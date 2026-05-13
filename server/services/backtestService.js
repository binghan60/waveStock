import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const dataPath = path.resolve(__dirname, '..', 'data', 'teacher-selected-daily-kbars.json')

const PROFIT_TARGETS = [10, 20, 30, 40, 50]
const BUY_STRATEGIES = ['nextOpen', 'support', 'swapRef']

let cachedPayload = null

const loadPayload = () => {
  if (!cachedPayload) {
    cachedPayload = JSON.parse(fs.readFileSync(dataPath, 'utf8'))
  }
  return cachedPayload
}

const toNumber = (value) => {
  const n = parseFloat(value)
  return Number.isFinite(n) && n > 0 ? n : null
}

const parseTargetPrice = (value, type) => {
  if (!value) return null
  const numbers = value
    .toString()
    .split(/[~,\- ]/)
    .map((item) => parseFloat(item.trim()))
    .filter((item) => Number.isFinite(item) && item > 0)

  if (numbers.length === 0) return null
  if (type === 'support' || type === 'swap') return Math.max(...numbers)
  return Math.min(...numbers)
}

const percent = (buyPrice, sellPrice) => {
  if (!buyPrice || !sellPrice) return null
  const FEE_RATE = 0.006 // 0.6% total fees (taxes + commission)
  const rawReturn = (sellPrice - buyPrice) / buyPrice
  return (rawReturn - FEE_RATE) * 100
}

const dateOnly = (value) => {
  if (!value) return null
  return new Date(value).toISOString().slice(0, 10)
}

const avg = (items) => {
  if (items.length === 0) return null
  return items.reduce((sum, item) => sum + item, 0) / items.length
}

const median = (items) => {
  if (items.length === 0) return null
  const sorted = [...items].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2
}

const round = (value, digits = 2) => {
  if (value === null || value === undefined || Number.isNaN(value)) return null
  return Number(value.toFixed(digits))
}

const getRecommendationRows = (payload, filters = {}) => {
  const symbol = filters.symbol?.trim()
  const startDate = filters.startDate || null
  const endDate = filters.endDate || null

  return payload.recommendations.filter((item) => {
    const recommendedDate = dateOnly(item.createdAt)
    if (symbol && !item.code.includes(symbol)) return false
    if (startDate && recommendedDate < startDate) return false
    if (endDate && recommendedDate > endDate) return false
    return true
  })
}

const findFirstKbarIndexOnOrAfter = (kbars, date) => {
  return kbars.findIndex((row) => row.date >= date)
}

const getBuyPoint = ({ recommendation, kbars, recIndex, buyStrategy, maxHoldingDays }) => {
  if (recIndex < 0) {
    return { status: 'missingData', reason: '找不到推薦日後日K' }
  }

  if (buyStrategy === 'nextOpen') {
    const buyIndex = recIndex + 1
    const buyRow = kbars[buyIndex]
    if (!buyRow) return { status: 'missingData', reason: '找不到隔日交易日' }
    return { buyIndex, buyDate: buyRow.date, buyPrice: toNumber(buyRow.open) || toNumber(buyRow.close), label: '隔天開盤買進' }
  }

  if (buyStrategy === 'support' || buyStrategy === 'swapRef') {
    const targetPrice = buyStrategy === 'support' 
      ? parseTargetPrice(recommendation.support, 'support')
      : parseTargetPrice(recommendation.swapRef, 'swap')

    if (!targetPrice) return { status: 'notTriggered', reason: `沒有${buyStrategy === 'support' ? '支撐' : '換股'}價` }

    const lastIndex = Math.min(kbars.length - 1, recIndex + (maxHoldingDays > 0 ? maxHoldingDays : 999999))
    // 從 T+1 開始計算進場時機
    for (let i = recIndex + 1; i <= lastIndex; i += 1) {
      const low = toNumber(kbars[i].low)
      const open = toNumber(kbars[i].open)
      if (low <= targetPrice) {
        const actualBuyPrice = Math.min(open, targetPrice)
        return { buyIndex: i, buyDate: kbars[i].date, buyPrice: actualBuyPrice, label: buyStrategy === 'support' ? '跌到支撐買進' : '跌到換股買進' }
      }
    }
    return { status: 'notTriggered', reason: `觀察期間未跌到${buyStrategy === 'support' ? '支撐' : '換股'}` }
  }

  return { status: 'notTriggered', reason: '未知的買進策略' }
}

const getTargetHits = ({ kbars, buyIndex, buyPrice, maxHoldingDays }) => {
  const result = {}
  const lastIndex = Math.min(kbars.length - 1, buyIndex + (maxHoldingDays > 0 ? maxHoldingDays : 999999))

  PROFIT_TARGETS.forEach((target) => {
    const targetPrice = buyPrice * (1 + target / 100)
    let hit = null
    for (let i = buyIndex; i <= lastIndex; i += 1) {
      if (toNumber(kbars[i].high) >= targetPrice) {
        hit = {
          target,
          hit: true,
          date: kbars[i].date,
          days: i - buyIndex,
          price: round(toNumber(kbars[i].high)),
        }
        break
      }
    }
    result[target] = hit || { target, hit: false, date: null, days: null, price: null }
  })

  return result
}

const simulateExit = ({ recommendation, kbars, buyIndex, buyPrice, maxHoldingDays, sellStrategy, profitTarget, ignoreStopLoss }) => {
  const lastIndex = Math.min(kbars.length - 1, buyIndex + (maxHoldingDays > 0 ? maxHoldingDays : 999999))
  const stopPrice = parseTargetPrice(recommendation.swapRef, 'swap')
  const targetPrice = profitTarget > 0 ? buyPrice * (1 + profitTarget / 100) : Number.POSITIVE_INFINITY

  for (let i = buyIndex; i <= lastIndex; i += 1) {
    const row = kbars[i]
    const low = toNumber(row.low)
    const high = toNumber(row.high)

    if (!ignoreStopLoss && stopPrice && low !== null && low <= stopPrice) {
      return { sellIndex: i, sellDate: row.date, sellPrice: stopPrice, exitReason: 'stopLoss' }
    }

    if (sellStrategy === 'profitTarget' && high !== null && high >= targetPrice) {
      return { sellIndex: i, sellDate: row.date, sellPrice: targetPrice, exitReason: 'targetHit' }
    }
  }

  const exitRow = kbars[lastIndex]
  if (!exitRow) return { sellIndex: null, sellDate: null, sellPrice: null, exitReason: 'missingData' }
  return { sellIndex: lastIndex, sellDate: exitRow.date, sellPrice: toNumber(exitRow.close), exitReason: 'timeExit' }
}

const simulateTrade = (recommendation, payload, filters = {}, forcedBuyStrategy = null) => {
  const maxHoldingDays = parseInt(filters.maxHoldingDays || '60', 10)
  const buyStrategy = forcedBuyStrategy || filters.buyStrategy || 'nextOpen'
  const sellStrategy = filters.sellStrategy || 'profitTarget'
  const profitTarget = parseInt(filters.profitTarget || '20', 10)
  const kbars = payload.kbarsByCode[recommendation.code] || []
  const stock = payload.stocks[recommendation.code] || {}
  const recommendedDate = dateOnly(recommendation.createdAt)
  const recIndex = findFirstKbarIndexOnOrAfter(kbars, recommendedDate)
  const buyPoint = getBuyPoint({ recommendation, kbars, recIndex, buyStrategy, maxHoldingDays })

  const base = {
    id: recommendation.id,
    code: recommendation.code,
    name: stock.name || recommendation.code,
    recommendedDate,
    recommendedPrice: toNumber(recommendation.currentPrice),
    support: recommendation.support,
    swapRef: recommendation.swapRef,
    shortTermProfit: recommendation.shortTermProfit,
    waveProfit: recommendation.waveProfit,
    buyStrategy,
    buyStrategyLabel: buyPoint.label || buyStrategy,
  }

  if (buyPoint.status) {
    return {
      ...base,
      status: buyPoint.status,
      exitReason: buyPoint.reason,
      buyDate: null,
      buyPrice: null,
      sellDate: null,
      sellPrice: null,
      holdingDays: null,
      returnPct: null,
      maxReturnPct: null,
      minReturnPct: null,
      targetHits: {},
    }
  }

  const targetHits = getTargetHits({ kbars, buyIndex: buyPoint.buyIndex, buyPrice: buyPoint.buyPrice, maxHoldingDays })
  const exit = simulateExit({
    recommendation,
    kbars,
    buyIndex: buyPoint.buyIndex,
    buyPrice: buyPoint.buyPrice,
    maxHoldingDays,
    sellStrategy,
    profitTarget,
    ignoreStopLoss: filters.ignoreStopLoss === 'true',
  })
  const windowRows = kbars.slice(buyPoint.buyIndex, (exit.sellIndex ?? buyPoint.buyIndex) + 1)
  const maxPrice = Math.max(...windowRows.map((row) => toNumber(row.high) || 0))
  const minPrice = Math.min(...windowRows.map((row) => toNumber(row.low) || Number.POSITIVE_INFINITY))
  const returnPct = percent(buyPoint.buyPrice, exit.sellPrice)

  return {
    ...base,
    status: returnPct === null ? 'missingData' : returnPct > 0 ? 'win' : 'loss',
    exitReason: exit.exitReason,
    buyDate: buyPoint.buyDate,
    buyPrice: round(buyPoint.buyPrice),
    sellDate: exit.sellDate,
    sellPrice: round(exit.sellPrice),
    holdingDays: exit.sellIndex !== null ? exit.sellIndex - buyPoint.buyIndex : null,
    returnPct: round(returnPct),
    maxReturnPct: round(percent(buyPoint.buyPrice, maxPrice)),
    minReturnPct: Number.isFinite(minPrice) ? round(percent(buyPoint.buyPrice, minPrice)) : null,
    targetHits,
  }
}

const summarizeTrades = (trades) => {
  const entered = trades.filter((trade) => trade.buyDate && trade.returnPct !== null)
  const returns = entered.map((trade) => trade.returnPct)
  const wins = entered.filter((trade) => trade.returnPct > 0)
  const stops = entered.filter((trade) => trade.exitReason === 'stopLoss')
  const targetHits = entered.filter((trade) => trade.exitReason === 'targetHit')

  return {
    recommendationCount: trades.length,
    enteredCount: entered.length,
    notTriggeredCount: trades.filter((trade) => trade.status === 'notTriggered').length,
    missingDataCount: trades.filter((trade) => trade.status === 'missingData').length,
    winRate: entered.length ? round((wins.length / entered.length) * 100) : null,
    averageReturnPct: round(avg(returns)),
    medianReturnPct: round(median(returns)),
    maxReturnPct: returns.length ? round(Math.max(...returns)) : null,
    minReturnPct: returns.length ? round(Math.min(...returns)) : null,
    averageHoldingDays: round(avg(entered.map((trade) => trade.holdingDays).filter((item) => item !== null)), 1),
    targetHitRate: entered.length ? round((targetHits.length / entered.length) * 100) : null,
    stopLossRate: entered.length ? round((stops.length / entered.length) * 100) : null,
  }
}

const buildTargetStats = (trades) => {
  const entered = trades.filter((trade) => trade.buyDate)
  return PROFIT_TARGETS.map((target) => {
    const hits = entered
      .map((trade) => trade.targetHits?.[target])
      .filter((hit) => hit?.hit)
    const days = hits.map((hit) => hit.days)
    return {
      target,
      total: entered.length,
      hitCount: hits.length,
      hitRate: entered.length ? round((hits.length / entered.length) * 100) : null,
      averageDays: round(avg(days), 1),
      medianDays: round(median(days), 1),
      fastestDays: days.length ? Math.min(...days) : null,
      slowestDays: days.length ? Math.max(...days) : null,
    }
  })
}

const filterByStatus = (trades, status) => {
  if (!status || status === 'all') return trades
  if (status === 'notTriggered') return trades.filter((trade) => trade.status === 'notTriggered')
  if (status === 'missingData') return trades.filter((trade) => trade.status === 'missingData')
  if (status === 'stopLoss') return trades.filter((trade) => trade.exitReason === 'stopLoss')
  return trades.filter((trade) => trade.status === status)
}

const sortTrades = (trades, sortKey = 'recommendedDate', sortOrder = 'desc') => {
  const direction = sortOrder === 'asc' ? 1 : -1
  return [...trades].sort((a, b) => {
    const va = a[sortKey]
    const vb = b[sortKey]
    if (va === vb) return 0
    if (va === null || va === undefined) return 1
    if (vb === null || vb === undefined) return -1
    return va > vb ? direction : -direction
  })
}

export const getBacktestDatasetInfo = () => {
  const payload = loadPayload()
  return payload.summary
}

export const getBacktestResult = (filters = {}) => {
  const payload = loadPayload()
  const recommendations = getRecommendationRows(payload, filters)
  const trades = recommendations.map((item) => simulateTrade(item, payload, filters))
  const strategyComparison = BUY_STRATEGIES.map((strategy) => {
    const strategyTrades = recommendations.map((item) => simulateTrade(item, payload, filters, strategy))
    return {
      strategy,
      label: strategyTrades[0]?.buyStrategyLabel || strategy,
      ...summarizeTrades(strategyTrades),
    }
  })

  return {
    generatedAt: payload.generatedAt,
    datasetSummary: payload.summary,
    filters: {
      buyStrategy: filters.buyStrategy || 'nextOpen',
      sellStrategy: filters.sellStrategy || 'profitTarget',
      profitTarget: parseInt(filters.profitTarget || '20', 10),
      maxHoldingDays: parseInt(filters.maxHoldingDays || '60', 10),
    },
    summary: summarizeTrades(trades),
    strategyComparison,
    targetStats: buildTargetStats(trades),
    trades,
  }
}

export const getBacktestSummary = (filters = {}) => {
  const result = getBacktestResult(filters)
  return {
    generatedAt: result.generatedAt,
    datasetSummary: result.datasetSummary,
    filters: result.filters,
    summary: result.summary,
    strategyComparison: result.strategyComparison,
    targetStats: result.targetStats,
  }
}

export const getBacktestTrades = (filters = {}) => {
  const result = getBacktestResult(filters)
  const page = Math.max(parseInt(filters.page || '1', 10), 1)
  const pageSize = Math.min(Math.max(parseInt(filters.pageSize || '20', 10), 5), 100)
  const filtered = filterByStatus(result.trades, filters.status)
  const sorted = sortTrades(filtered, filters.sortKey, filters.sortOrder)
  const start = (page - 1) * pageSize

  return {
    total: sorted.length,
    page,
    pageSize,
    items: sorted.slice(start, start + pageSize),
  }
}

export const getBacktestChart = (filters = {}) => {
  const result = getBacktestResult(filters)
  const entered = result.trades.filter((trade) => trade.buyDate && trade.returnPct !== null)
  const grouped = new Map()

  entered.forEach((trade) => {
    if (trade.holdingDays === null) return
    const list = grouped.get(trade.holdingDays) || []
    list.push(trade.returnPct)
    grouped.set(trade.holdingDays, list)
  })

  return {
    profitTargetDays: result.targetStats,
    holdingReturnPoints: entered.map((trade) => ({
      x: trade.holdingDays,
      y: trade.returnPct,
      code: trade.code,
      name: trade.name,
      recommendedDate: trade.recommendedDate,
      buyDate: trade.buyDate,
      sellDate: trade.sellDate,
      exitReason: trade.exitReason,
    })),
    averageReturnByHoldingDays: [...grouped.entries()]
      .sort((a, b) => a[0] - b[0])
      .map(([days, returns]) => ({ x: days, y: round(avg(returns)) })),
  }
}

export const getBacktestAll = (filters = {}) => {
  const result = getBacktestResult(filters)
  
  // Trades logic (pagination & sorting)
  const page = Math.max(parseInt(filters.page || '1', 10), 1)
  const pageSize = Math.min(Math.max(parseInt(filters.pageSize || '20', 10), 5), 100)
  const filteredTrades = filterByStatus(result.trades, filters.status)
  const sortedTrades = sortTrades(filteredTrades, filters.sortKey, filters.sortOrder)
  const start = (page - 1) * pageSize
  
  // Chart logic
  const entered = result.trades.filter((trade) => trade.buyDate && trade.returnPct !== null)
  const grouped = new Map()
  entered.forEach((trade) => {
    if (trade.holdingDays === null) return
    const list = grouped.get(trade.holdingDays) || []
    list.push(trade.returnPct)
    grouped.set(trade.holdingDays, list)
  })

  return {
    summary: {
      generatedAt: result.generatedAt,
      datasetSummary: result.datasetSummary,
      filters: result.filters,
      summary: result.summary,
      strategyComparison: result.strategyComparison,
      targetStats: result.targetStats,
    },
    trades: {
      total: sortedTrades.length,
      page,
      pageSize,
      items: sortedTrades.slice(start, start + pageSize),
    },
    chart: {
      profitTargetDays: result.targetStats,
      holdingReturnPoints: entered.map((trade) => ({
        x: trade.holdingDays,
        y: trade.returnPct,
        code: trade.code,
        name: trade.name,
        recommendedDate: trade.recommendedDate,
        buyDate: trade.buyDate,
        sellDate: trade.sellDate,
        exitReason: trade.exitReason,
      })),
      averageReturnByHoldingDays: [...grouped.entries()]
        .sort((a, b) => a[0] - b[0])
        .map(([days, returns]) => ({ x: days, y: round(avg(returns)) })),
    }
  }
}
