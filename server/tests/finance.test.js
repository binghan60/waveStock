import test from 'node:test'
import assert from 'node:assert/strict'
import { parseTaifexHtml } from '../services/finance/marketDataService.js'
import { buildMorningBriefFlex, getMarketMood } from '../services/finance/morningBriefFlex.js'

test('parses TAIFEX night-session quote and previous session date', () => {
  const html = `
    <input name="queryDate" value="2026/06/15">
    <table><tr>
      <td>TX</td><td>202606</td><td>x</td><td>x</td><td>x</td>
      <td>44,704</td><td>▲487</td><td>1.10%</td>
    </tr></table>
  `

  const quote = parseTaifexHtml(html)
  assert.equal(quote.name, '台指期')
  assert.equal(quote.price, 44704)
  assert.equal(quote.change, 487)
  assert.equal(quote.sessionDate, '2026-06-12')
})

test('builds a compact dark LINE Flex message', () => {
  const quotes = [
    {
      symbol: 'TX',
      name: '台指期',
      market: '台指期夜盤',
      price: 44704,
      change: 487,
      changePercent: 1.1,
      tradingDate: '2026-06-15',
      sessionDate: '2026-06-12',
    },
    {
      symbol: '^DJI',
      name: '道瓊',
      market: '美國市場',
      price: 51202.26,
      change: 353.46,
      changePercent: 0.7,
      tradingDate: '2026-06-12',
    },
  ]

  const message = buildMorningBriefFlex(quotes, new Date('2026-06-14T14:03:00Z'))
  const serialized = JSON.stringify(message)

  assert.equal(message.contents.size, 'giga')
  assert.equal(message.contents.body.backgroundColor, '#0B1220')
  assert.match(serialized, /51,202\.26/)
  assert.match(serialized, /▲353\.46 \(0\.7%\)/)
  assert.match(serialized, /06\/12 夜盤/)
  assert.doesNotMatch(serialized, /202606|延遲行情|非投資建議/)
  assert.equal(getMarketMood(quotes).label, '盤勢偏多')
})
