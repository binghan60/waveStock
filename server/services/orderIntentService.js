import axios from 'axios'
import OrderIntent from '../models/OrderIntent.js'
import TradeJournalEntry from '../models/TradeJournalEntry.js'
import { calculateTradePerformance } from './tradeJournalService.js'

export const CONFIRM_LINE_USER_ID = process.env.ORDER_CONFIRM_LINE_USER_ID || ''

export const getConfirmLineUserIds = () => String(process.env.ORDER_CONFIRM_LINE_USER_ID || '')
  .split(',')
  .map((value) => value.trim())
  .filter(Boolean)
const DEFAULT_BUY_AMOUNT = Number(process.env.ORDER_INTENT_BUY_AMOUNT_TWD) || 100_000
const BROKER_ORDER_API_URL = process.env.BROKER_ORDER_API_URL || ''
const BROKER_ORDER_DRY_RUN = process.env.BROKER_ORDER_DRY_RUN !== 'false'

const tradeTypeLabels = {
  buy: '買進',
  sell_half: '賣出一半',
  sell_all: '出清',
}

const actionLabels = {
  buy: '買進',
  sell: '賣出',
}

const round = (value, digits = 2) => {
  if (!Number.isFinite(value)) return null
  const factor = 10 ** digits
  return Math.round(value * factor) / factor
}

const floorQuantity = (value) => {
  if (!Number.isFinite(value) || value <= 0) return null
  return Math.floor(value)
}

const getOpenPosition = async (code, excludeEntryId = null) => {
  const entries = await TradeJournalEntry.find({ performanceEligible: { $ne: false } })
    .sort({ occurredAt: 1 })
    .lean()
  const filteredEntries = excludeEntryId
    ? entries.filter((entry) => String(entry._id) !== String(excludeEntryId))
    : entries
  const performance = calculateTradePerformance(filteredEntries, {})
  return performance.positions.find((position) => {
    return position.code === code && position.status === 'open'
  }) || null
}

export const buildOrderIntentSourceKey = (messageId, parsedTrade, index = 0, total = 1) => {
  const base = String(messageId || '').trim() || `manual:${Date.now()}`
  const code = parsedTrade?.code || 'unknown'
  const tradeType = parsedTrade?.tradeType || 'trade'
  return total <= 1 ? `${base}:${code}:${tradeType}` : `${base}:${index + 1}:${code}:${tradeType}`
}

export async function buildOrderIntentDraft({ event, parsed, entry, index = 0, total = 1 }) {
  const referencePrice = Number(entry?.price)
  const warnings = []
  let suggestedAmount = null
  let suggestedQuantity = null

  if (parsed.action === 'buy') {
    suggestedAmount = DEFAULT_BUY_AMOUNT
    if (Number.isFinite(referencePrice) && referencePrice > 0) {
      suggestedQuantity = floorQuantity(DEFAULT_BUY_AMOUNT / referencePrice)
    } else {
      warnings.push('missing_reference_price')
    }

    const openPosition = await getOpenPosition(parsed.code, entry?._id)
    if (openPosition) warnings.push('already_has_open_position')
  } else {
    const openPosition = await getOpenPosition(parsed.code, entry?._id)
    if (!openPosition || Number(openPosition.quantity) <= 0) {
      warnings.push('no_open_position')
    } else {
      const fraction = parsed.tradeType === 'sell_half' ? 0.5 : 1
      suggestedQuantity = floorQuantity(Number(openPosition.quantity) * fraction)
      if (!suggestedQuantity) warnings.push('suggested_quantity_is_zero')
    }
  }

  const sourceMessageId = event?.message?.id || entry?.messageId || `manual-${Date.now()}`
  const occurredAt = event?.timestamp ? new Date(event.timestamp) : (entry?.occurredAt || new Date())

  return {
    source: 'line',
    sourceMessageId,
    sourceKey: buildOrderIntentSourceKey(sourceMessageId, parsed, index, total),
    tradeJournalEntryId: entry?._id || null,
    groupId: event?.source?.groupId || entry?.groupId || null,
    roomId: event?.source?.roomId || entry?.roomId || null,
    userId: event?.source?.userId || entry?.userId || null,
    senderName: entry?.senderName || null,
    code: parsed.code,
    name: parsed.name,
    tradeType: parsed.tradeType,
    action: parsed.action,
    fraction: parsed.fraction,
    isMarketOrder: parsed.isMarketOrder,
    suggestedAmount,
    suggestedQuantity,
    referencePrice: Number.isFinite(referencePrice) && referencePrice > 0 ? referencePrice : null,
    priceSource: entry?.priceSource || 'unknown',
    warnings,
    rawText: event?.message?.text || entry?.rawText || parsed.note,
    occurredAt,
    status: 'pending_confirm',
  }
}

export async function createOrderIntentFromTrade({ event, parsed, entry, index = 0, total = 1 }) {
  const draft = await buildOrderIntentDraft({ event, parsed, entry, index, total })
  const existing = await OrderIntent.findOne({ sourceKey: draft.sourceKey })
  if (existing) return existing
  return await OrderIntent.create(draft)
}

export function buildOrderIntentText(intent) {
  const side = actionLabels[intent.action] || intent.action
  const tradeType = tradeTypeLabels[intent.tradeType] || intent.tradeType
  const price = Number(intent.referencePrice)
  const priceText = Number.isFinite(price) && price > 0 ? `${round(price)} 元` : '尚無參考價'
  const quantity = Number(intent.suggestedQuantity)
  const quantityText = Number.isFinite(quantity) && quantity > 0 ? `${quantity.toLocaleString('zh-TW')} 股` : '待確認'
  const amount = Number(intent.suggestedAmount)
  const amountText = Number.isFinite(amount) && amount > 0 ? `約 ${amount.toLocaleString('zh-TW')} 元` : '依庫存計算'
  const warningText = intent.warnings?.length ? intent.warnings.join(', ') : '無'

  return [
    '跟單確認單',
    `${intent.name}(${intent.code}) ${tradeType}`,
    `方向\uff1a${side}`,
    `委託\uff1a${intent.isMarketOrder ? '市價' : '未指定'}`,
    `建議股數\uff1a${quantityText}`,
    `建議金額\uff1a${amountText}`,
    `參考價\uff1a${priceText}`,
    `風控提示\uff1a${warningText}`,
  ].join('\n')
}

export function buildOrderIntentLineMessage(intent) {
  const side = actionLabels[intent.action] || intent.action
  const tradeType = tradeTypeLabels[intent.tradeType] || intent.tradeType
  const isBuy = intent.action === 'buy'
  const accentColor = isBuy ? '#B36B6B' : '#5BA882'
  const headerBg = isBuy ? '#3D1A1A' : '#1A3328'

  const price = Number(intent.referencePrice)
  const priceText = Number.isFinite(price) && price > 0 ? `${round(price)} 元` : '尚無參考價'
  const quantity = Number(intent.suggestedQuantity)
  const quantityText = Number.isFinite(quantity) && quantity > 0 ? `${quantity.toLocaleString('zh-TW')} 股` : '待確認'
  const amount = Number(intent.suggestedAmount)
  const amountText = Number.isFinite(amount) && amount > 0 ? `約 ${amount.toLocaleString('zh-TW')} 元` : '依庫存計算'
  const hasWarnings = intent.warnings?.length > 0

  const row = (label, value, bold = false) => ({
    type: 'box',
    layout: 'horizontal',
    contents: [
      { type: 'text', text: label, color: '#8E8E93', size: 'sm', flex: 3 },
      { type: 'text', text: value, size: 'sm', align: 'end', flex: 4, weight: bold ? 'bold' : 'regular', color: '#F2F2F7', wrap: true },
    ],
  })

  const bodyContents = [
    {
      type: 'box',
      layout: 'horizontal',
      contents: [
        { type: 'text', text: intent.name, weight: 'bold', size: 'lg', flex: 1, color: '#F2F2F7' },
        { type: 'text', text: intent.code, size: 'sm', color: '#636366', align: 'end', gravity: 'bottom', flex: 0 },
      ],
    },
    {
      type: 'text',
      text: `${tradeType} (${side})`,
      size: 'md',
      color: accentColor,
      weight: 'bold',
    },
    { type: 'separator', margin: 'sm', color: '#3A3A3C' },
    row('委託方式', intent.isMarketOrder ? '市價' : '未指定'),
    row('建議股數', quantityText, true),
    row('建議金額', amountText),
    row('參考價', priceText),
  ]

  if (hasWarnings) {
    bodyContents.push({
      type: 'box',
      layout: 'horizontal',
      margin: 'sm',
      contents: [
        { type: 'text', text: '⚠️ 風控', color: '#C47F2A', size: 'sm', flex: 3 },
        { type: 'text', text: intent.warnings.join(', '), size: 'sm', color: '#C47F2A', align: 'end', flex: 4, wrap: true },
      ],
    })
  }

  return {
    type: 'flex',
    altText: `${intent.name}(${intent.code}) 跟單確認單`,
    contents: {
      type: 'bubble',
      size: 'kilo',
      styles: {
        header: { backgroundColor: headerBg },
        body: { backgroundColor: '#1C1C1E' },
        footer: { backgroundColor: '#2C2C2E', separator: true, separatorColor: '#3A3A3C' },
      },
      header: {
        type: 'box',
        layout: 'vertical',
        paddingAll: '10px',
        contents: [
          { type: 'text', text: '跟單確認單', color: '#FFFFFF99', size: 'xs', weight: 'bold' },
        ],
      },
      body: {
        type: 'box',
        layout: 'vertical',
        spacing: 'sm',
        paddingAll: '14px',
        contents: bodyContents,
      },
      footer: {
        type: 'box',
        layout: 'horizontal',
        spacing: 'sm',
        paddingAll: '12px',
        contents: [
          {
            type: 'button',
            style: 'primary',
            color: accentColor,
            height: 'sm',
            action: {
              type: 'postback',
              label: '確認跟單',
              data: `action=confirm_order_intent&id=${intent._id}`,
              displayText: `確認跟單 ${intent.code}`,
            },
          },
          {
            type: 'button',
            style: 'primary',
            color: '#48484A',
            height: 'sm',
            action: {
              type: 'postback',
              label: '拒絕',
              data: `action=reject_order_intent&id=${intent._id}`,
              displayText: `拒絕跟單 ${intent.code}`,
            },
          },
        ],
      },
    },
  }
}

export async function pushOrderIntentConfirmation(client, intent, recipients = getConfirmLineUserIds()) {
  const userIds = Array.isArray(recipients)
    ? recipients.map((value) => String(value || '').trim()).filter(Boolean)
    : String(recipients || '').split(',').map((value) => value.trim()).filter(Boolean)

  if (!client || userIds.length === 0) {
    console.warn(`Skip pushing order intent ${intent._id}: ORDER_CONFIRM_LINE_USER_ID is not configured`)
    return { pushed: false, userIds: [], error: 'missing_order_confirm_line_user_id' }
  }

  const message = buildOrderIntentLineMessage(intent)
  const results = []
  for (const userId of userIds) {
    try {
      await client.pushMessage(userId, message)
      results.push({ pushed: true, userId })
    } catch (error) {
      console.warn(`Unable to push order intent ${intent._id} to ${userId}:`, error.message)
      results.push({ pushed: false, userId, error: error.message })
    }
  }

  return {
    pushed: results.some((result) => result.pushed),
    userIds,
    results,
  }
}

const submitToBroker = async (intent) => {
  const payload = {
    clientOrderId: String(intent._id),
    code: intent.code,
    side: intent.action,
    tradeType: intent.tradeType,
    orderType: intent.isMarketOrder ? 'market' : 'unknown',
    quantity: intent.suggestedQuantity,
    amount: intent.suggestedAmount,
    source: 'teacher-follow',
    dryRun: BROKER_ORDER_DRY_RUN,
  }

  if (!BROKER_ORDER_API_URL) {
    return {
      payload,
      response: {
        brokerOrderId: `paper-${intent._id}`,
        status: 'submitted',
        message: 'paper order accepted; BROKER_ORDER_API_URL is not configured',
      },
      brokerService: 'paper',
    }
  }

  const { data } = await axios.post(BROKER_ORDER_API_URL, payload, { timeout: 10_000 })
  return { payload, response: data, brokerService: 'python-broker' }
}

export async function confirmOrderIntent(id) {
  const intent = await OrderIntent.findById(id)
  if (!intent) throw Object.assign(new Error('order_intent_not_found'), { statusCode: 404 })
  if (intent.status !== 'pending_confirm') {
    throw Object.assign(new Error(`order_intent_not_pending:${intent.status}`), { statusCode: 409 })
  }
  if (!Number(intent.suggestedQuantity) || Number(intent.suggestedQuantity) <= 0) {
    throw Object.assign(new Error('suggested_quantity_required'), { statusCode: 422 })
  }

  intent.status = 'approved'
  intent.confirmedAt = new Date()
  await intent.save()

  try {
    const brokerResult = await submitToBroker(intent)
    intent.status = 'submitted'
    intent.submittedAt = new Date()
    intent.brokerService = brokerResult.brokerService
    intent.brokerOrderId = brokerResult.response?.brokerOrderId || null
    intent.brokerStatus = brokerResult.response?.status || 'submitted'
    intent.brokerMessage = brokerResult.response?.message || null
    intent.submitPayload = brokerResult.payload
    intent.submitResponse = brokerResult.response
    await intent.save()
    return intent
  } catch (error) {
    intent.status = 'failed'
    intent.brokerStatus = 'failed'
    intent.brokerMessage = error.message
    await intent.save()
    throw error
  }
}

export async function rejectOrderIntent(id) {
  const intent = await OrderIntent.findById(id)
  if (!intent) throw Object.assign(new Error('order_intent_not_found'), { statusCode: 404 })
  if (intent.status !== 'pending_confirm') {
    throw Object.assign(new Error(`order_intent_not_pending:${intent.status}`), { statusCode: 409 })
  }
  intent.status = 'rejected'
  intent.rejectedAt = new Date()
  await intent.save()
  return intent
}

export { tradeTypeLabels }
