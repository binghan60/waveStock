const TRADE_TYPES = {
  buy: {
    pattern: /(?:市價)?買進/,
    action: 'buy',
    fraction: 1,
  },
  sell_half: {
    pattern: /(?:市價)?(?:獲利|賣出)?一半|賣一半/,
    action: 'sell',
    fraction: 0.5,
  },
  sell_all: {
    pattern: /(?:剩餘部位)?全數出場|全部出場|全賣|清倉/,
    action: 'sell',
    fraction: 1,
  },
}

const REQUIRED_SENDER_MARKER = '綸(菁英)'
const BROKER_FEE_RATE = 0.001425 * 0.6
const SELL_TAX_RATE = 0.003
const SELL_COST_RATE = BROKER_FEE_RATE + SELL_TAX_RATE

export function parseTradeMessage(rawText, { senderName = '' } = {}) {
  const text = String(rawText || '').trim()
  if (!text) return null
  if (!text.includes(REQUIRED_SENDER_MARKER) && !String(senderName).includes(REQUIRED_SENDER_MARKER)) {
    return null
  }

  const stockMatch = text.match(/([\p{Script=Han}A-Za-z0-9*._-]+)\s*[（(]\s*(\d{4,6})\s*[）)]/u)
  if (!stockMatch) return null

  const tradeType = Object.entries(TRADE_TYPES).find(([, config]) => config.pattern.test(text))
  if (!tradeType) return null
  const [type, config] = tradeType

  return {
    code: stockMatch[2],
    name: stockMatch[1].replace(/^[-_.]+|[-_.]+$/g, ''),
    tradeType: type,
    action: config.action,
    fraction: config.fraction,
    isMarketOrder: text.includes('市價'),
    note: text,
  }
}

const round = (value, digits = 2) => {
  if (!Number.isFinite(value)) return null
  const factor = 10 ** digits
  return Math.round(value * factor) / factor
}

export function calculateTradePerformance(records, currentPrices = {}) {
  const eligibleRecords = records.filter((record) => record.performanceEligible !== false)
  const positions = new Map()
  let realizedPnl = 0
  let investedCost = 0
  let sellProceeds = 0
  let pricedRecordCount = 0

  const sortedRecords = [...eligibleRecords].sort((a, b) => {
    return new Date(a.occurredAt || a.createdAt) - new Date(b.occurredAt || b.createdAt)
  })

  for (const record of sortedRecords) {
    const price = Number(record.price)
    if (!Number.isFinite(price) || price <= 0) continue
    pricedRecordCount += 1

    const position = positions.get(record.code) || {
      code: record.code,
      name: record.name || record.code,
      quantity: 0,
      cost: 0,
      buyQuantity: 0,
      buyGrossAmount: 0,
      buyAt: null,
      realizedPnl: 0,
      sellHalfReturns: [],
      sellAllReturns: [],
      sellReturns: [],
      sellHalfQuantity: 0,
      sellHalfGrossAmount: 0,
      sellAllQuantity: 0,
      sellAllGrossAmount: 0,
      sellHalfAt: null,
      sellAllAt: null,
    }

    if (record.action === 'buy') {
      const quantity = Number(record.quantity) > 0 ? Number(record.quantity) : 1
      const grossAmount = quantity * price
      const totalCost = grossAmount * (1 + BROKER_FEE_RATE)
      position.quantity += quantity
      position.cost += totalCost
      position.buyQuantity += quantity
      position.buyGrossAmount += grossAmount
      position.buyAt ||= record.occurredAt || record.createdAt || null
      investedCost += totalCost
    } else if (record.action === 'sell' && position.quantity > 0) {
      const fraction = Math.min(1, Math.max(0, Number(record.fraction) || 1))
      const quantity = Math.min(
        position.quantity,
        Number(record.quantity) > 0 ? Number(record.quantity) : position.quantity * fraction,
      )
      const averageCost = position.cost / position.quantity
      const allocatedCost = quantity * averageCost
      const grossProceeds = quantity * price
      const netProceeds = grossProceeds * (1 - SELL_COST_RATE)
      const pnl = netProceeds - allocatedCost
      const returnPct = (pnl / allocatedCost) * 100
      const tradeType = record.tradeType
        || (Number(record.fraction) === 0.5 ? 'sell_half' : 'sell_all')

      position.quantity -= quantity
      position.cost -= quantity * averageCost
      position.realizedPnl += pnl
      position.sellReturns.push(returnPct)
      if (tradeType === 'sell_half') {
        position.sellHalfReturns.push(returnPct)
        position.sellHalfQuantity += quantity
        position.sellHalfGrossAmount += grossProceeds
        position.sellHalfAt = record.occurredAt || record.createdAt || null
      }
      if (tradeType === 'sell_all') {
        position.sellAllReturns.push(returnPct)
        position.sellAllQuantity += quantity
        position.sellAllGrossAmount += grossProceeds
        position.sellAllAt = record.occurredAt || record.createdAt || null
      }
      realizedPnl += pnl
      sellProceeds += netProceeds
    }

    positions.set(record.code, position)
  }

  let marketValue = 0
  let openCost = 0
  let unrealizedPnl = 0
  const positionList = [...positions.values()].map((position) => {
    const currentPrice = Number(currentPrices[position.code])
    const averageCost = position.quantity > 0 ? position.cost / position.quantity : 0
    const hasCurrentPrice = Number.isFinite(currentPrice) && currentPrice > 0
    const value = hasCurrentPrice ? position.quantity * currentPrice : null
    const netLiquidationValue = value === null ? null : value * (1 - SELL_COST_RATE)
    const openPnl = netLiquidationValue === null ? null : netLiquidationValue - position.cost

    openCost += position.cost
    if (value !== null) {
      marketValue += value
      unrealizedPnl += openPnl
    }

    return {
      code: position.code,
      name: position.name,
      quantity: round(position.quantity, 4),
      remainingPositionPct: position.buyQuantity > 0
        ? round((position.quantity / position.buyQuantity) * 100)
        : 0,
      buyPrice: position.buyQuantity > 0
        ? round(position.buyGrossAmount / position.buyQuantity)
        : null,
      buyAt: position.buyAt,
      averageCost: round(averageCost),
      cost: round(position.cost),
      currentPrice: hasCurrentPrice ? round(currentPrice) : null,
      marketValue: round(value),
      realizedPnl: round(position.realizedPnl),
      sellHalfReturnPct: position.sellHalfReturns.length
        ? round(position.sellHalfReturns.reduce((sum, value) => sum + value, 0) / position.sellHalfReturns.length)
        : null,
      sellHalfPrice: position.sellHalfQuantity > 0
        ? round(position.sellHalfGrossAmount / position.sellHalfQuantity)
        : null,
      sellAllReturnPct: position.sellAllReturns.length
        ? round(position.sellAllReturns.reduce((sum, value) => sum + value, 0) / position.sellAllReturns.length)
        : null,
      sellAllPrice: position.sellAllQuantity > 0
        ? round(position.sellAllGrossAmount / position.sellAllQuantity)
        : null,
      averageSellReturnPct: position.sellReturns.length
        ? round(position.sellReturns.reduce((sum, value) => sum + value, 0) / position.sellReturns.length)
        : null,
      sellHalfAt: position.sellHalfAt,
      sellAllAt: position.sellAllAt,
      unrealizedPnl: round(openPnl),
      returnPct: openPnl === null || position.cost <= 0 ? null : round((openPnl / position.cost) * 100),
      status: position.quantity > 0.000001 ? 'open' : 'closed',
    }
  })

  const totalPnl = realizedPnl + unrealizedPnl
  return {
    summary: {
      recordCount: eligibleRecords.length,
      excludedRecordCount: records.length - eligibleRecords.length,
      pricedRecordCount,
      openPositionCount: positionList.filter((position) => position.status === 'open').length,
      investedCost: round(investedCost),
      sellProceeds: round(sellProceeds),
      openCost: round(openCost),
      marketValue: round(marketValue),
      realizedPnl: round(realizedPnl),
      unrealizedPnl: round(unrealizedPnl),
      totalPnl: round(totalPnl),
      totalReturnPct: investedCost > 0 ? round((totalPnl / investedCost) * 100) : null,
    },
    positions: positionList.sort((a, b) => {
      if (a.status !== b.status) return a.status === 'open' ? -1 : 1
      return a.code.localeCompare(b.code)
    }),
  }
}
