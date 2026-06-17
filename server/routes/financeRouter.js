import express from 'express'
import * as line from '@line/bot-sdk'
import MarketBriefDelivery from '../models/MarketBriefDelivery.js'
import {
  fetchMorningMarketData,
  formatTaipeiDate,
} from '../services/finance/marketDataService.js'
import { buildMorningBriefFlex } from '../services/finance/morningBriefFlex.js'

export default function financeRoutes(config) {
  const router = express.Router()
  const client = new line.Client(config)
  router.use(express.json())

  router.post('/morning-brief', verifyCronSecret, async (req, res) => {
    const recipients = getRecipients(req.body?.to)
    if (!recipients.length) {
      return res.status(500).json({ error: '尚未設定 TARGET_PUSH_ID' })
    }

    const generatedAt = new Date()
    const deliveryDate = formatTaipeiDate(generatedAt)
    const force = req.body?.force === true

    try {
      const { quotes, errors } = await fetchMorningMarketData()
      if (!quotes.length) {
        return res.status(502).json({ error: '所有行情來源皆失敗', details: errors })
      }

      const message = buildMorningBriefFlex(quotes, generatedAt)
      const results = []
      for (const recipientId of recipients) {
        results.push(
          await deliverOnce({
            client,
            recipientId,
            deliveryDate,
            message,
            force,
          }),
        )
      }

      const failed = results.filter((result) => result.status === 'failed').length
      return res.status(failed ? 207 : 200).json({
        status: failed ? 'partial' : 'ok',
        deliveryDate,
        marketCount: quotes.length,
        sourceErrors: errors,
        results,
      })
    } catch (error) {
      console.error('Morning brief delivery error:', error)
      return res.status(500).json({ error: '盤前快報推播失敗', details: error.message })
    }
  })

  return router
}

function verifyCronSecret(req, res, next) {
  const secret = process.env.CRON_SECRET
  if (!secret) return res.status(500).json({ error: '尚未設定 CRON_SECRET' })

  const authorization = req.get('authorization') || ''
  const provided = authorization.startsWith('Bearer ')
    ? authorization.slice(7)
    : req.get('x-cron-secret')

  if (provided !== secret) return res.status(401).json({ error: 'Unauthorized' })
  next()
}

function getRecipients(override) {
  if (override && process.env.ALLOW_PUSH_TARGET_OVERRIDE === 'true') {
    return Array.isArray(override) ? override : [override]
  }
  return (process.env.TARGET_PUSH_ID || '')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean)
}

async function deliverOnce({ client, recipientId, deliveryDate, message, force }) {
  const deliveryKey = `morning:${deliveryDate}:${recipientId}`
  let delivery

  if (force) {
    delivery = await MarketBriefDelivery.findOneAndUpdate(
      { deliveryKey },
      {
        $set: {
          recipientId,
          deliveryDate,
          status: 'pending',
          error: '',
        },
      },
      { new: true, upsert: true },
    )
  } else {
    const existing = await MarketBriefDelivery.findOne({ deliveryKey })
    if (existing?.status === 'sent' || existing?.status === 'pending') {
      return { recipientId, status: 'skipped' }
    }

    if (existing?.status === 'failed') {
      delivery = existing
      delivery.status = 'pending'
      delivery.error = ''
      await delivery.save()
    } else {
      try {
        delivery = await MarketBriefDelivery.create({
          deliveryKey,
          recipientId,
          deliveryDate,
        })
      } catch (error) {
        if (error?.code === 11000) return { recipientId, status: 'skipped' }
        throw error
      }
    }
  }

  try {
    await client.pushMessage(recipientId, message)
    delivery.status = 'sent'
    delivery.sentAt = new Date()
    await delivery.save()
    return { recipientId, status: 'sent' }
  } catch (error) {
    const lineDetail = error.response?.data
    const errorMsg = lineDetail
      ? `${error.message} | LINE: ${JSON.stringify(lineDetail)}`
      : error.message
    console.error('pushMessage failed:', errorMsg)
    delivery.status = 'failed'
    delivery.error = errorMsg
    await delivery.save()
    return { recipientId, status: 'failed', error: errorMsg }
  }
}
