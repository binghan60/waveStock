import fs from 'fs';

const TRADE_TYPES = {
  buy: {
    pattern: /市價買進|轉入/,
    action: 'buy',
    fraction: 1,
  },
  sell_half: {
    pattern: /(?:市價)?(?:獲利|賣出|出場|入袋)一半|賣一半/,
    action: 'sell',
    fraction: 0.5,
  },
  sell_all: {
    pattern: /(?:剩餘部位|市價)?(?:全數|全部)(?:獲利|小賺|賣出)*(?:出場|賣出)|全賣|清倉|市價賣出(?!\s*一半)|收回資金/,
    action: 'sell',
    fraction: 1,
  },
}

export function parseTradeMessages(rawText, { senderName = '' } = {}) {
  const text = String(rawText || '').trim()
  if (!text) return []
  const REQUIRED_SENDER_MARKER = '綸(菁英)';
  if (!text.startsWith(REQUIRED_SENDER_MARKER) && !String(senderName).includes(REQUIRED_SENDER_MARKER)) {
    return []
  }

  const results = []
  const lines = text.split('\n')
  for (const line of lines) {
    const stockMatch = line.match(/([\p{Script=Han}A-Za-z0-9*._-]+)\s*[（(]\s*(\d{4,6})\s*[）)]/u)
    if (!stockMatch) continue

    const tradeType = Object.entries(TRADE_TYPES).find(([, config]) => config.pattern.test(line))
    if (!tradeType) continue
    const [type, config] = tradeType

    results.push({
      code: stockMatch[2],
      name: stockMatch[1].replace(/^[-_.]+|[-_.]+$/g, ''),
      tradeType: type,
      action: config.action,
      fraction: config.fraction,
      isMarketOrder: line.includes('市價'),
      note: line.trim(),
    })
  }

  return results
}

const testText = `綸(菁英)_2  
 中磊(5388)市價賣出收回資金 
將資金轉入聯茂(6213)`;

console.log(parseTradeMessages(testText));
