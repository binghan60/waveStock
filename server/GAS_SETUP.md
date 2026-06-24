# Google Apps Script morning brief trigger

Vercel server project needs these environment variables:

```text
CHANNEL_ACCESS_TOKEN=
CHANNEL_SECRET=
MONGODB_URI=
TARGET_PUSH_ID=
CRON_SECRET=
```

`CRON_SECRET` must match the Bearer token sent by Apps Script. Do not commit the real secret to Git.

## Apps Script retry version

This script keeps one scheduled trigger, but retries inside that single execution.

It will:

- Skip Sundays.
- Use a lock to avoid overlapping runs.
- Retry temporary failures, `202 pending`, `207 partial`, and the intermittent `400` response.
- Treat the push as successful only when the API returns `200`, `status: "ok"`, and every recipient result is `sent` or `already_sent`.

```javascript
const ENDPOINT = 'https://wave-stock-server.vercel.app/api/finance/morning-brief'
const CRON_SECRET = 'REPLACE_WITH_VERCEL_CRON_SECRET'
const MAX_ATTEMPTS = 5

function callMorningBrief() {
  const now = new Date()
  const weekday = Utilities.formatDate(now, 'Asia/Taipei', 'u') // 1=Mon ... 7=Sun

  if (weekday === '7') {
    console.log('Sunday, skipping.')
    return
  }

  const lock = LockService.getScriptLock()
  if (!lock.tryLock(1000)) {
    console.log('Another morning brief run is still active, skipping this trigger.')
    return
  }

  try {
    callMorningBriefWithRetry_()
  } finally {
    lock.releaseLock()
  }
}

function callMorningBriefWithRetry_() {
  let lastResult = null

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    if (attempt > 1) {
      Utilities.sleep(getDelayMs_(attempt))
    }

    lastResult = postMorningBrief_()
    console.log(
      JSON.stringify({
        attempt,
        code: lastResult.code,
        delivered: isDelivered_(lastResult),
        response: lastResult.body || lastResult.text,
      })
    )

    if (isDelivered_(lastResult)) {
      console.log('Morning brief delivered.')
      return
    }

    if (!shouldRetry_(lastResult)) {
      break
    }
  }

  throw new Error('Morning brief was not confirmed as delivered: ' + JSON.stringify(lastResult))
}

function postMorningBrief_() {
  try {
    const response = UrlFetchApp.fetch(ENDPOINT, {
      method: 'post',
      contentType: 'application/json',
      headers: {
        Authorization: `Bearer ${CRON_SECRET}`,
      },
      payload: JSON.stringify({}),
      muteHttpExceptions: true,
    })

    const code = response.getResponseCode()
    const text = response.getContentText()

    return {
      code,
      text,
      body: parseJson_(text),
      exception: false,
    }
  } catch (error) {
    return {
      code: 0,
      text: String(error),
      body: null,
      exception: true,
    }
  }
}

function isDelivered_(result) {
  const body = result.body
  const results = body && Array.isArray(body.results) ? body.results : []

  return (
    result.code === 200 &&
    body &&
    body.status === 'ok' &&
    results.length > 0 &&
    results.every(isRecipientDelivered_)
  )
}

function isRecipientDelivered_(result) {
  return result.status === 'sent' || (result.status === 'skipped' && result.reason === 'already_sent')
}

function shouldRetry_(result) {
  if (result.exception) return true
  if (result.body && result.body.status === 'pending') return true

  return [202, 207, 400, 408, 409, 425, 429, 500, 502, 503, 504].indexOf(result.code) !== -1
}

function getDelayMs_(attempt) {
  const delays = [0, 15000, 30000, 60000, 120000]
  const baseDelay = delays[Math.min(attempt - 1, delays.length - 1)]
  const jitter = Math.floor(Math.random() * 3000)
  return baseDelay + jitter
}

function parseJson_(text) {
  try {
    return JSON.parse(text)
  } catch (error) {
    return null
  }
}
```

If the final attempt still fails, Apps Script throws an error and keeps the last HTTP code and response body in the execution log. That is the useful clue for distinguishing data-source issues, LINE push errors, permission problems, and stuck backend state.