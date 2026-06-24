import express from 'express'
import * as line from '@line/bot-sdk'
import MarketBriefDelivery from '../models/MarketBriefDelivery.js'
import {
  fetchMorningMarketData,
  formatTaipeiDate,
} from '../services/finance/marketDataService.js'
import { buildMorningBriefFlex } from '../services/finance/morningBriefFlex.js'

const PENDING_RETRY_MS = 2 * 60 * 1000

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
      const pending = results.filter((result) => result.status === 'pending').length
      const responseCode = failed ? 207 : pending ? 202 : 200
      return res.status(responseCode).json({
        status: failed ? 'partial' : pending ? 'pending' : 'ok',
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

function getPendingAgeMs(delivery) {
  const lastTouchedAt = delivery?.updatedAt || delivery?.createdAt
  if (!lastTouchedAt) return Number.POSITIVE_INFINITY
  return Date.now() - new Date(lastTouchedAt).getTime()
}

function getLineErrorStatus(error) {
  return (
    error?.statusCode ||
    error?.status ||
    error?.response?.status ||
    error?.response?.statusCode ||
    error?.originalError?.response?.status ||
    error?.originalError?.response?.statusCode ||
    error?.cause?.response?.status ||
    error?.cause?.response?.statusCode ||
    null
  )
}

function getLineErrorDetail(error) {
  const candidates = [
    error?.response?.data,
    error?.response?.body,
    error?.originalError?.response?.data,
    error?.originalError?.response?.body,
    error?.cause?.response?.data,
    error?.cause?.response?.body,
    error?.details,
    error?.body,
  ]
  return candidates.find((value) => value !== undefined && value !== null && value !== '')
}

function stringifyErrorDetail(value) {
  if (typeof value === 'string') return value
  try {
    return JSON.stringify(value)
  } catch {
    return String(value)
  }
}

function formatLinePushError(error) {
  const parts = [error?.message || String(error)]
  const status = getLineErrorStatus(error)
  const detail = getLineErrorDetail(error)

  if (status && !parts[0].includes(String(status))) {
    parts.push(`status: ${status}`)
  }

  if (detail) {
    parts.push(`LINE: ${stringifyErrorDetail(detail)}`)
  }

  return parts.join(' | ').slice(0, 4000)
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
        $unset: {
          sentAt: '',
        },
      },
      { new: true, upsert: true },
    )
  } else {
    const existing = await MarketBriefDelivery.findOne({ deliveryKey })
    if (existing?.status === 'sent') {
      return { recipientId, status: 'skipped', reason: 'already_sent' }
    }

    if (existing?.status === 'pending') {
      const pendingAgeMs = getPendingAgeMs(existing)
      if (pendingAgeMs < PENDING_RETRY_MS) {
        return {
          recipientId,
          status: 'pending',
          reason: 'delivery_in_progress',
          pendingAgeMs,
        }
      }

      delivery = existing
      delivery.error = ''
      delivery.set('sentAt', undefined)
      await delivery.save()
    }

    if (existing?.status === 'failed') {
      delivery = existing
      delivery.status = 'pending'
      delivery.error = ''
      delivery.set('sentAt', undefined)
      await delivery.save()
    } else if (!delivery) {
      try {
        delivery = await MarketBriefDelivery.create({
          deliveryKey,
          recipientId,
          deliveryDate,
        })
      } catch (error) {
        if (error?.code === 11000) {
          return { recipientId, status: 'pending', reason: 'delivery_race' }
        }
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
    const errorMsg = formatLinePushError(error)
    console.error('pushMessage failed:', errorMsg)
    delivery.status = 'failed'
    delivery.error = errorMsg
    await delivery.save()
    return {
      recipientId,
      status: 'failed',
      statusCode: getLineErrorStatus(error),
      error: errorMsg,
    }
  }
}
