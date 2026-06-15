# 交易績效歷史資料匯入Tips

這組工具用來將 LINE 投顧訊息轉成交易紀錄，透過永豐金 Shioaji API 取得歷史分 K／逐筆成交價，再匯入 MongoDB。

網站平常執行不依賴這些工具；但未來若要補登歷史訊息、修正訊號或重新計算成交價，建議保留。

## 檔案用途

### 正式功能

- `models/TradeJournalEntry.js`：交易紀錄資料模型。
- `routes/tradeJournalRouter.js`：交易績效 API。
- `services/tradeJournalService.js`：持股、損益與報酬率計算。
- `tests/tradeJournal.test.js`：績效計算測試。
- `../client/src/views/TradeJournalView.vue`：交易績效前端頁面。

### 維護工具

- `scripts/build-trade-journal-preview.py`：解析 LINE 訊息並向 Shioaji 查詢歷史成交價。
- `scripts/import-trade-journal-preview.js`：將預覽資料匯入 MongoDB。
- `scripts/verify-trade-journal.js`：讀取資料庫並輸出績效結果，供人工核對。
- `data/trade-journal-supplements.json`：存放不在原始 LINE 匯出檔中的補充訊息。
- `requirements-market-data.txt`：歷史行情工具使用的 Python 套件版本。

### 可刪除產物

以下檔案可在每次匯入完成後刪除，且已加入 `.gitignore`：

- `.tmp/`
- `shioaji.log`
- `data/line-export.txt`
- `data/trade-journal-preview.json`
- `scripts/__pycache__/`
- `*.pyc`

原始 LINE 匯出檔可能包含私人訊息，不應提交到 Git。

## 計算規則

- 每次買進固定模擬投入 `NT$100,000`。
- LINE 匯出時間只有分鐘精度，因此成交價採用訊息發出後「下一分鐘的第一筆 Shioaji 成交價」。
- 減碼視為賣出當時剩餘部位的 `50%`。
- 全數出場視為賣出所有剩餘部位。
- 沒有買進成本的舊持股不納入績效。
- 手續費與證交稅由 `tradeJournalService.js` 的既有規則計算。

這是投顧訊號的模擬績效，不代表實際帳戶成交結果。

## 環境設定

在 `server/.env` 設定：

```env
SJ_API_KEY=永豐金_API_Key
SJ_SEC_KEY=永豐金_Secret_Key
MONGODB_URI=mongodb+srv://...
```

請勿將 `.env` 或任何憑證提交到 Git。

## 安裝行情套件

在 `server` 目錄執行：

```powershell
python -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r requirements-market-data.txt
```

## 建立預覽資料

假設 LINE 匯出檔位於專案根目錄：

```powershell
cd server
.\.venv\Scripts\python.exe scripts\build-trade-journal-preview.py "..\[LINE]大華國際投顧.txt"
```

產出位置：

```text
server/data/trade-journal-preview.json
```

只解析訊息、不呼叫 Shioaji：

```powershell
.\.venv\Scripts\python.exe scripts\build-trade-journal-preview.py "..\[LINE]大華國際投顧.txt" --parse-only
```

只處理前幾筆資料：

```powershell
.\.venv\Scripts\python.exe scripts\build-trade-journal-preview.py "..\[LINE]大華國際投顧.txt" --limit 5
```

建立預覽後，應先確認：

- 股票代號與名稱正確。
- `trade_type` 為 `buy`、`sell_half` 或 `sell_all`。
- `status` 為 `ready`。
- `price` 與 `market_timestamp` 合理。
- 買進、減碼與出清順序完整。

## 補充轉傳訊息

若訊息不在 LINE 匯出檔中，可加入 `data/trade-journal-supplements.json`：

```json
[
  {
    "occurred_at": "2026-05-07T10:02:00+08:00",
    "sender_name": "訊息來源",
    "code": "3481",
    "name": "群創",
    "trade_type": "buy",
    "action": "buy",
    "fraction": 1,
    "raw_text": "完整原始訊息",
    "source_line": "包含交易指令的文字"
  }
]
```

補充資料會在建立預覽時自動與 LINE 匯出內容合併。

## 匯入 MongoDB

先執行 dry-run，不會修改資料庫：

```powershell
cd server
node scripts\import-trade-journal-preview.js
```

確認 `insertCount`、`updateCount` 與股票內容正確後，再正式寫入：

```powershell
node scripts\import-trade-journal-preview.js --commit
```

匯入工具使用 `importKey` 避免同一訊息重複新增；再次執行時，已匯入資料會顯示為 `skip_imported`。

如需一併移除先前標記為「缺少買進紀錄」的排除資料：

```powershell
node scripts\import-trade-journal-preview.js --commit --prune-excluded
```

## 驗證結果

```powershell
cd server
node scripts\verify-trade-journal.js
```

輸出內容包含：

- 資料庫交易筆數。
- 納入與排除績效的筆數。
- Shioaji 歷史成交價筆數。
- 目前持股與剩餘比例。
- 已實現、未實現及總損益。

完成後也應開啟前端 `/trade-journal`，核對買入、減碼、出清時間與價格。

## 建議保留策略

若確定不會再匯入任何歷史訊息，可以刪除「維護工具」中的檔案；正式功能仍可正常運作。

較建議保留維護工具與本文件，只刪除每次執行產生的預覽、日誌及暫存檔。這樣未來收到漏掉的買進訊息時，仍能用相同規則補登並保持績效一致。
