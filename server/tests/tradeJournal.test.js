import test from 'node:test'
import assert from 'node:assert/strict'
import {
  buildTradeEntryMessageId,
  calculateTradePerformance,
  parseTradeMessages,
} from '../services/tradeJournalService.js'

test('parses a market buy message', () => {
  assert.deepEqual(parseTradeMessages('綸(菁英)_4\n富鼎(8261)市價買進')[0], {
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
  assert.deepEqual(parseTradeMessages('綸(菁英)_5\n聯電(2303)市價獲利一半，剩餘部位續抱')[0], {
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
  assert.deepEqual(parseTradeMessages('綸(菁英)_3\n今國光(6209)剩餘部位全數出場')[0], {
    code: '6209',
    name: '今國光',
    tradeType: 'sell_all',
    action: 'sell',
    fraction: 1,
    isMarketOrder: false,
    note: '綸(菁英)_3\n今國光(6209)剩餘部位全數出場',
  })
})

test('parses a market profit-taking sell message', () => {
  assert.deepEqual(parseTradeMessages('綸(菁英)_4\n聯鈞(3450) 市價獲利賣出')[0], {
    code: '3450',
    name: '聯鈞',
    tradeType: 'sell_all',
    action: 'sell',
    fraction: 1,
    isMarketOrder: true,
    note: '綸(菁英)_4\n聯鈞(3450) 市價獲利賣出',
  })
})

test('parses multiple full-exit trades from one message', () => {
  const text = '綸(菁英)_4\n 聯茂(6213) 市價獲利出清 \n順德(2351) 市價出清收回資金'
  const parsedList = parseTradeMessages(text)

  assert.equal(parsedList.length, 2)
  assert.equal(parsedList[0].code, '6213')
  assert.equal(parsedList[0].tradeType, 'sell_all')
  assert.equal(parsedList[0].isMarketOrder, true)
  assert.equal(parsedList[1].code, '2351')
  assert.equal(parsedList[1].tradeType, 'sell_all')
  assert.equal(parsedList[1].isMarketOrder, true)
})

test('ignores unrelated stock discussion', () => {
  assert.deepEqual(parseTradeMessages('綸(菁英)_5\n聯電(2303)今天成交量很大'), [])
})

test('accepts LINE message when sender name contains the required marker', () => {
  const parsedList = parseTradeMessages('富鼎(8261)市價買進', {
    senderName: '綸(菁英)_4',
  })

  assert.equal(parsedList.length, 1)
  assert.equal(parsedList[0]?.tradeType, 'buy')
  assert.equal(parsedList[0]?.code, '8261')
})

test('ignores trade-like messages from other senders', () => {
  assert.deepEqual(
    parseTradeMessages('富鼎(8261)市價買進', { senderName: '其他老師' }),
    [],
  )
})

test('parses multiple trades from a single message (e.g. switch positions)', () => {
  const text = `綸(菁英)_2\n 中磊(5388)市價賣出收回資金 \n將資金轉入聯茂(6213)`
  const parsedList = parseTradeMessages(text)
  
  assert.equal(parsedList.length, 2)
  assert.equal(parsedList[0].code, '5388')
  assert.equal(parsedList[0].tradeType, 'sell_all')
  assert.equal(parsedList[1].code, '6213')
  assert.equal(parsedList[1].tradeType, 'buy')
})

test('builds stable child message ids for multi-trade LINE messages', () => {
  assert.equal(
    buildTradeEntryMessageId('line-message-1', { code: '6213', tradeType: 'sell_all' }, 0, 2),
    'line-message-1:1:6213:sell_all',
  )
  assert.equal(
    buildTradeEntryMessageId('line-message-1', { code: '2351', tradeType: 'sell_all' }, 1, 2),
    'line-message-1:2:2351:sell_all',
  )
  assert.equal(
    buildTradeEntryMessageId('line-message-2', { code: '8261', tradeType: 'buy' }, 0, 1),
    'line-message-2',
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
  assert.equal(result.positions[0].remainingPositionPct, 0)
  assert.equal(result.positions[0].status, 'closed')
  assert.equal(result.positions[0].buyPrice, 100)
  assert.equal(result.positions[0].buyAt, '2026-06-15T01:00:00.000Z')
  assert.equal(result.positions[0].sellHalfReturnPct, 9.48)
  assert.equal(result.positions[0].sellHalfPrice, 110)
  assert.equal(result.positions[0].sellAllReturnPct, 19.44)
  assert.equal(result.positions[0].sellAllPrice, 120)
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
  assert.equal(result.positions[0].remainingPositionPct, 50)
  assert.equal(result.positions[0].buyPrice, 100)
  assert.equal(result.positions[0].buyAt, '2026-06-15T01:00:00.000Z')
  assert.equal(result.positions[0].averageCost, 100.09)
  assert.equal(result.positions[0].returnPct, 9.48)
  assert.equal(result.positions[0].sellHalfReturnPct, 19.44)
  assert.equal(result.positions[0].sellHalfPrice, 120)
  assert.equal(result.positions[0].sellAllReturnPct, null)
  assert.equal(result.positions[0].sellAllPrice, null)
  assert.equal(result.positions[0].averageSellReturnPct, 19.44)
})

test('excludes legacy sells without a known buy cost from performance', () => {
  const result = calculateTradePerformance([
    {
      code: '2449',
      name: '京元電',
      action: 'sell',
      tradeType: 'sell_all',
      fraction: 1,
      price: 321,
      performanceEligible: false,
      occurredAt: '2026-05-08T01:44:00.000Z',
    },
    {
      code: '1727',
      name: '中華化',
      action: 'buy',
      quantity: 1000,
      price: 100,
      occurredAt: '2026-05-11T01:45:00.000Z',
    },
  ])

  assert.equal(result.summary.recordCount, 1)
  assert.equal(result.summary.excludedRecordCount, 1)
  assert.equal(result.summary.openPositionCount, 1)
  assert.equal(result.positions.length, 1)
  assert.equal(result.positions[0].code, '1727')
})
