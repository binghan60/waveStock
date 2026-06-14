import axios from 'axios'

const TAIFEX_URL = 'https://www.taifex.com.tw/cht/3/futDailyMarketReport'
const YAHOO_CHART_URL = 'https://query1.finance.yahoo.com/v8/finance/chart'

const US_INDEXES = [
  { symbol: '^DJI', name: '道瓊' },
  { symbol: '^GSPC', name: 'S&P 500' },
  { symbol: '^IXIC', name: '那斯達克' },
  { symbol: '^SOX', name: '費城半導體' },
]

const http = axios.create({
  timeout: 15000,
  headers: { 'User-Agent': 'wave-stock-finance/1.0' },
})

export async function fetchMorningMarketData() {
  const results = await Promise.allSettled([
    fetchTaifexNightSession(),
    ...US_INDEXES.map(fetchYahooIndex),
  ])

  const quotes = []
  const errors = []

  results.forEach((result, index) => {
    if (result.status === 'fulfilled') {
      quotes.push(result.value)
      return
    }

    const source = index === 0 ? '台指期夜盤' : US_INDEXES[index - 1].name
    errors.push(`${source}: ${result.reason?.message || '資料取得失敗'}`)
  })

  return { quotes, errors }
}

export async function fetchTaifexNightSession() {
  const response = await http.get(TAIFEX_URL)
  return parseTaifexHtml(response.data)
}

export function parseTaifexHtml(html) {
  const dateMatch = html.match(
    /name=["']queryDate["'][^>]*value=["'](\d{4}\/\d{2}\/\d{2})["']/i,
  )
  if (!dateMatch) throw new Error('找不到期交所交易日期')

  const rows = [...html.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)].map((match) =>
    [...match[1].matchAll(/<t[dh]\b[^>]*>([\s\S]*?)<\/t[dh]>/gi)].map((cell) =>
      decodeHtml(stripTags(cell[1])).replace(/\s+/g, ' ').trim(),
    ),
  )

  const row = rows.find(
    (cells) => cells.length >= 8 && cells[0] === 'TX' && /^\d{6}$/.test(cells[1]),
  )
  if (!row) throw new Error('找不到台指期夜盤資料')

  const tradingDate = dateMatch[1].replaceAll('/', '-')
  return {
    symbol: 'TX',
    name: '台指期',
    market: '台指期夜盤',
    price: parseNumber(row[5]),
    change: parseSignedNumber(row[6]),
    changePercent: parseSignedNumber(row[7].replace('%', '')),
    tradingDate,
    sessionDate: previousWeekday(tradingDate),
  }
}

export async function fetchYahooIndex(index) {
  const response = await http.get(
    `${YAHOO_CHART_URL}/${encodeURIComponent(index.symbol)}`,
    { params: { range: '10d', interval: '1d', events: 'history' } },
  )
  const result = response.data?.chart?.result?.[0]
  const timestamps = result?.timestamp || []
  const closes = result?.indicators?.quote?.[0]?.close || []
  const points = timestamps
    .map((timestamp, position) => ({ timestamp, close: closes[position] }))
    .filter((point) => Number.isFinite(point.close))

  if (points.length < 2) throw new Error('收盤資料不足')

  const previous = points.at(-2)
  const latest = points.at(-1)
  const change = latest.close - previous.close

  return {
    symbol: index.symbol,
    name: index.name,
    market: '美國市場',
    price: latest.close,
    change,
    changePercent: previous.close ? (change / previous.close) * 100 : 0,
    tradingDate: formatTaipeiDate(new Date(latest.timestamp * 1000)),
  }
}

function stripTags(value) {
  return value.replace(/<[^>]+>/g, ' ')
}

function decodeHtml(value) {
  const entities = {
    '&nbsp;': ' ',
    '&amp;': '&',
    '&lt;': '<',
    '&gt;': '>',
    '&quot;': '"',
    '&#39;': "'",
  }
  return value.replace(/&(nbsp|amp|lt|gt|quot|#39);/g, (entity) => entities[entity])
}

function parseNumber(value) {
  const number = Number(String(value).replaceAll(',', '').trim())
  if (!Number.isFinite(number)) throw new Error(`無效行情數字: ${value}`)
  return number
}

function parseSignedNumber(value) {
  const normalized = String(value)
    .replaceAll(',', '')
    .trim()
    .replace(/^[+▲△]/, '')
    .replace(/^[▼▽]/, '-')
  return parseNumber(normalized)
}

function previousWeekday(dateText) {
  const date = new Date(`${dateText}T12:00:00+08:00`)
  do {
    date.setUTCDate(date.getUTCDate() - 1)
  } while ([0, 6].includes(date.getUTCDay()))
  return formatTaipeiDate(date)
}

export function formatTaipeiDate(date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Taipei',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date)
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]))
  return `${values.year}-${values.month}-${values.day}`
}
