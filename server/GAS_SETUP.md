# Google Apps Script 定時推播

Vercel 環境變數需要設定：

```text
CHANNEL_ACCESS_TOKEN=
CHANNEL_SECRET=
MONGODB_URI=
TARGET_PUSH_ID=
CRON_SECRET=
```

Apps Script：

```javascript
const ENDPOINT = 'https://YOUR_PROJECT.vercel.app/api/finance/morning-brief'
const CRON_SECRET = '與 Vercel CRON_SECRET 相同的值'

function pushMorningBrief() {
  const response = UrlFetchApp.fetch(ENDPOINT, {
    method: 'post',
    contentType: 'application/json',
    headers: {
      Authorization: `Bearer ${CRON_SECRET}`,
    },
    payload: JSON.stringify({}),
    muteHttpExceptions: true,
  })

  console.log(response.getResponseCode(), response.getContentText())
}
```

建議建立每 5 分鐘執行一次的時間觸發器，並在 Apps Script 加上時段判斷：

```javascript
function scheduledMorningBrief() {
  const hour = Number(Utilities.formatDate(new Date(), 'Asia/Taipei', 'H'))
  const minute = Number(Utilities.formatDate(new Date(), 'Asia/Taipei', 'm'))

  if (hour === 7 && minute >= 25 && minute <= 35) {
    pushMorningBrief()
  }
}
```

後端會用 `日期 + TARGET_PUSH_ID` 防止同一天重複推播。失敗的推播可在下一次呼叫時重試。

LINE 中傳送 `盤前早報` 或 `盤前快報`，也可以手動取得相同卡片。
