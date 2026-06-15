import test from 'node:test'
import assert from 'node:assert/strict'
import {
  calculateTradePerformance,
  parseTradeMessage,
} from '../services/tradeJournalService.js'

test('parses a market buy message', () => {
  assert.deepEqual(parseTradeMessage('綸(菁英)_4\n富鼎(8261)市價買進'), {
    code: '8261',
    name: '富鼎',
    tradeType: 'buy',
    action: 'buy',
    fraction: 1,
    isMarketOrder: true,
    note: '綸(菁英)_4\n富鼎(8261)市價買進',
  })
})

test('parses a half profit-taking message', () => {
  assert.deepEqual(parseTradeMessage('綸(菁英)_5\n聯電(2303)市價獲利一半，剩餘部位續抱'), {
    code: '2303',
    name: '聯電',
    tradeType: 'sell_half',
    action: 'sell',
    fraction: 0.5,
    isMarketOrder: true,
    note: '綸(菁英)_5\n聯電(2303)市價獲利一半，剩餘部位續抱',
  })
})

test('parses a full exit message', () => {
  assert.deepEqual(parseTradeMessage('綸(菁英)_3\n今國光(6209)剩餘部位全數出場'), {
    code: '6209',
    name: '今國光',
    tradeType: 'sell_all',
    action: 'sell',
    fraction: 1,
    isMarketOrder: false,
    note: '綸(菁英)_3\n今國光(6209)剩餘部位全數出場',
  })
})

test('ignores unrelated stock discussion', () => {
  assert.equal(parseTradeMessage('綸(菁英)_5\n聯電(2303)今天成交量很大'), null)
})

test('accepts LINE message when sender name contains the required marker', () => {
  const parsed = parseTradeMessage('富鼎(8261)市價買進', {
    senderName: '綸(菁英)_4',
  })

  assert.equal(parsed?.tradeType, 'buy')
  assert.equal(parsed?.code, '8261')
})

test('ignores trade-like messages from other senders', () => {
  assert.equal(
    parseTradeMessage('富鼎(8261)市價買進', { senderName: '其他老師' }),
    null,
  )
})

test('closes the remaining position after half and full sell messages', () => {
  const result = calculateTradePerformance([
    {
      code: '6209',
      name: '今國光',
      action: 'buy',
      price: 100,
      occurredAt: '2026-06-15T01:00:00.000Z',
    },
    {
      code: '6209',
      name: '今國光',
      action: 'sell',
      tradeType: 'sell_half',
      fraction: 0.5,
      price: 110,
      occurredAt: '2026-06-15T02:00:00.000Z',
    },
    {
      code: '6209',
      name: '今國光',
      action: 'sell',
      tradeType: 'sell_all',
      fraction: 1,
      price: 120,
      occurredAt: '2026-06-15T03:00:00.000Z',
    },
  ])

  assert.equal(result.summary.realizedPnl, 14.47)
  assert.equal(result.summary.openPositionCount, 0)
  assert.equal(result.positions[0].quantity, 0)
  assert.equal(result.positions[0].status, 'closed')
  assert.equal(result.positions[0].sellHalfReturnPct, 9.48)
  assert.equal(result.positions[0].sellAllReturnPct, 19.44)
  assert.equal(result.positions[0].averageSellReturnPct, 14.46)
  assert.equal(result.positions[0].sellHalfAt, '2026-06-15T02:00:00.000Z')
  assert.equal(result.positions[0].sellAllAt, '2026-06-15T03:00:00.000Z')
})

test('calculates realized and unrealized performance after selling half', () => {
  const result = calculateTradePerformance(
    [
      {
        code: '2303',
        name: '聯電',
        action: 'buy',
        price: 100,
        occurredAt: '2026-06-15T01:00:00.000Z',
      },
      {
        code: '2303',
        name: '聯電',
        action: 'sell',
        tradeType: 'sell_half',
        fraction: 0.5,
        price: 120,
        occurredAt: '2026-06-15T02:00:00.000Z',
      },
    ],
    { 2303: 110 },
  )

  assert.equal(result.summary.realizedPnl, 9.73)
  assert.equal(result.summary.unrealizedPnl, 4.75)
  assert.equal(result.summary.totalPnl, 14.47)
  assert.equal(result.summary.totalReturnPct, 14.46)
  assert.equal(result.positions[0].quantity, 0.5)
  assert.equal(result.positions[0].averageCost, 100.09)
  assert.equal(result.positions[0].returnPct, 9.48)
  assert.equal(result.positions[0].sellHalfReturnPct, 19.44)
  assert.equal(result.positions[0].sellAllReturnPct, null)
  assert.equal(result.positions[0].averageSellReturnPct, 19.44)
})
