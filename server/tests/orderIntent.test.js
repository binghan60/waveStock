import test from 'node:test'
import assert from 'node:assert/strict'
import {
  buildOrderIntentLineMessage,
  buildOrderIntentSourceKey,
  getConfirmLineUserIds,
} from '../services/orderIntentService.js'

test('builds stable order intent source keys for one or many trades', () => {
  assert.equal(
    buildOrderIntentSourceKey('line-1', { code: '6213', tradeType: 'sell_all' }, 0, 1),
    'line-1:6213:sell_all',
  )
  assert.equal(
    buildOrderIntentSourceKey('line-2', { code: '6213', tradeType: 'sell_all' }, 0, 2),
    'line-2:1:6213:sell_all',
  )
})

test('builds LINE postback confirmation actions', () => {
  const message = buildOrderIntentLineMessage({
    _id: 'intent-1',
    code: '6213',
    name: 'LM',
    action: 'sell',
    tradeType: 'sell_all',
    isMarketOrder: true,
    suggestedQuantity: 1000,
    warnings: [],
  })

  assert.equal(message.type, 'template')
  assert.equal(message.template.actions[0].data, 'action=confirm_order_intent&id=intent-1')
  assert.equal(message.template.actions[1].data, 'action=reject_order_intent&id=intent-1')
})


test('reads confirmation push recipients lazily from environment', () => {
  const previous = process.env.ORDER_CONFIRM_LINE_USER_ID
  process.env.ORDER_CONFIRM_LINE_USER_ID = 'U1, U2'

  try {
    assert.deepEqual(getConfirmLineUserIds(), ['U1', 'U2'])
  } finally {
    if (previous === undefined) {
      delete process.env.ORDER_CONFIRM_LINE_USER_ID
    } else {
      process.env.ORDER_CONFIRM_LINE_USER_ID = previous
    }
  }
})
