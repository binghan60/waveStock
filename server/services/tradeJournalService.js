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
  const positions = new Map()
  let realizedPnl = 0
  let investedCost = 0
  let sellProceeds = 0
  let pricedRecordCount = 0

  const sortedRecords = [...records].sort((a, b) => {
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
      realizedPnl: 0,
      buyCount: 0,
      sellCount: 0,
    }

    if (record.action === 'buy') {
      const quantity = Number(record.quantity) > 0 ? Number(record.quantity) : 1
      position.quantity += quantity
      position.cost += quantity * price
      position.buyCount += 1
      investedCost += quantity * price
    } else if (record.action === 'sell' && position.quantity > 0) {
      const fraction = Math.min(1, Math.max(0, Number(record.fraction) || 1))
      const quantity = Math.min(
        position.quantity,
        Number(record.quantity) > 0 ? Number(record.quantity) : position.quantity * fraction,
      )
      const averageCost = position.cost / position.quantity
      const pnl = quantity * (price - averageCost)

      position.quantity -= quantity
      position.cost -= quantity * averageCost
      position.realizedPnl += pnl
      position.sellCount += 1
      realizedPnl += pnl
      sellProceeds += quantity * price
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
    const openPnl = value === null ? null : value - position.cost

    openCost += position.cost
    if (value !== null) {
      marketValue += value
      unrealizedPnl += openPnl
    }

    return {
      ...position,
      quantity: round(position.quantity, 4),
      averageCost: round(averageCost),
      cost: round(position.cost),
      currentPrice: hasCurrentPrice ? round(currentPrice) : null,
      marketValue: round(value),
      realizedPnl: round(position.realizedPnl),
      unrealizedPnl: round(openPnl),
      returnPct: openPnl === null || position.cost <= 0 ? null : round((openPnl / position.cost) * 100),
      status: position.quantity > 0.000001 ? 'open' : 'closed',
    }
  })

  const totalPnl = realizedPnl + unrealizedPnl
  return {
    summary: {
      recordCount: records.length,
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
