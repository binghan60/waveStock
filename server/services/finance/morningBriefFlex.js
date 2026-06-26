const COLORS = {
  background: '#0B1220',
  panel: '#111C2E',
  primary: '#F8FAFC',
  secondary: '#CBD5E1',
  muted: '#7F8EA3',
  divider: '#263449',
  up: '#FF3B48',
  down: '#20C997',
  flat: '#A7B0C0',
}

export function buildMorningBriefFlex(quotes, generatedAt = new Date()) {
  const futures = quotes.filter((quote) => quote.market === '台指期夜盤')
  const usMarket = quotes.filter((quote) => quote.market === '美國市場')
  const mood = getMarketMood(quotes)

  const contents = [
    {
      type: 'box',
      layout: 'horizontal',
      alignItems: 'center',
      contents: [
        {
          type: 'text',
          text: '台股盤前',
          size: 'lg',
          weight: 'bold',
          color: COLORS.primary,
          flex: 3,
        },
        {
          type: 'text',
          text: formatTaipeiTime(generatedAt),
          size: 'xs',
          color: COLORS.muted,
          align: 'end',
          flex: 2,
        },
      ],
    },
    {
      type: 'box',
      layout: 'horizontal',
      alignItems: 'center',
      backgroundColor: mood.background,
      cornerRadius: '8px',
      paddingAll: '10px',
      margin: 'md',
      contents: [
        {
          type: 'text',
          text: mood.label,
          size: 'sm',
          weight: 'bold',
          color: mood.color,
          flex: 2,
        },
        {
          type: 'text',
          text: mood.detail,
          size: 'xxs',
          color: COLORS.secondary,
          align: 'end',
          flex: 3,
        },
      ],
    },
    ...marketSection('台指期夜盤', futures),
    ...marketSection('美國市場', usMarket),
  ]

  return {
    type: 'flex',
    altText: buildAltText(futures[0], generatedAt),
    contents: {
      type: 'bubble',
      size: 'giga',
      body: {
        type: 'box',
        layout: 'vertical',
        backgroundColor: COLORS.background,
        paddingAll: '16px',
        contents,
      },
    },
  }
}

function buildAltText(futuresQuote, generatedAt) {
  if (!futuresQuote) return `台股盤前 ${formatTaipeiTime(generatedAt)}`

  const arrow =
    futuresQuote.change > 0 ? '▲' : futuresQuote.change < 0 ? '▼' : '－'
  return `夜盤 ${arrow}${formatNumber(Math.abs(futuresQuote.change))}點 ${arrow}${formatNumber(
    Math.abs(futuresQuote.changePercent),
  )}%`
}

export function getMarketMood(quotes) {
  const up = quotes.filter((quote) => quote.change > 0).length
  const down = quotes.filter((quote) => quote.change < 0).length
  const flat = quotes.length - up - down
  const balance = up - down

  let label = '盤勢中性'
  let color = COLORS.flat
  let background = COLORS.panel
  if (balance >= 3) [label, color, background] = ['明顯偏多', COLORS.up, '#321B24']
  else if (balance >= 1) [label, color, background] = ['盤勢偏多', COLORS.up, '#321B24']
  else if (balance <= -3) [label, color, background] = ['明顯偏空', COLORS.down, '#123127']
  else if (balance <= -1) [label, color, background] = ['盤勢偏空', COLORS.down, '#123127']

  const detail = [`${up} 項上漲`, `${down} 項下跌`]
  if (flat) detail.push(`${flat} 項持平`)
  return { label, detail: detail.join('、'), color, background }
}

function marketSection(market, quotes) {
  const first = quotes[0]
  const date = first
    ? `${formatShortDate(
        market === '台指期夜盤' ? first.sessionDate || first.tradingDate : first.tradingDate,
      )} ${market === '台指期夜盤' ? '夜盤' : '收盤'}`
    : '暫無資料'

  return [
    { type: 'separator', margin: 'lg', color: COLORS.divider },
    {
      type: 'box',
      layout: 'baseline',
      margin: 'md',
      contents: [
        {
          type: 'text',
          text: market,
          size: 'sm',
          weight: 'bold',
          color: COLORS.secondary,
          flex: 3,
        },
        {
          type: 'text',
          text: date,
          size: 'xxs',
          color: COLORS.muted,
          align: 'end',
          flex: 2,
        },
      ],
    },
    ...(quotes.length
      ? quotes.map(quoteRow)
      : [{ type: 'text', text: '暫無資料', size: 'sm', color: COLORS.muted, margin: 'md' }]),
  ]
}

function quoteRow(quote) {
  const color = quote.change > 0 ? COLORS.up : quote.change < 0 ? COLORS.down : COLORS.flat
  const arrow = quote.change > 0 ? '▲' : quote.change < 0 ? '▼' : '－'

  return {
    type: 'box',
    layout: 'vertical',
    margin: 'md',
    contents: [
      {
        type: 'text',
        text: quote.name,
        size: 'sm',
        weight: 'bold',
        color: COLORS.secondary,
        wrap: true,
      },
      {
        type: 'box',
        layout: 'baseline',
        margin: 'xs',
        contents: [
          {
            type: 'text',
            text: formatNumber(quote.price),
            size: 'xl',
            weight: 'bold',
            color,
            flex: 5,
          },
          {
            type: 'text',
            text: `${arrow}${formatNumber(Math.abs(quote.change))} (${formatNumber(
              Math.abs(quote.changePercent),
            )}%)`,
            size: 'sm',
            weight: 'bold',
            color,
            align: 'end',
            flex: 4,
          },
        ],
      },
    ],
  }
}

function formatNumber(value) {
  return new Intl.NumberFormat('en-US', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(value)
}

function formatShortDate(dateText) {
  const [, month, day] = dateText.split('-')
  return `${month}/${day}`
}

function formatTaipeiTime(date) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Taipei',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(date)
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]))
  return `${values.month}/${values.day} ${values.hour}:${values.minute}`
}
