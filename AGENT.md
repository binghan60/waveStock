這是一個股市分析師推薦的股票網站，網站中有紀錄推薦日期、推薦時的股價、支撐價、換股價、短線價、波段價。

我現在想在前端專案新增「回測專區」，用來檢查老師推薦股票之後，不同買進策略的勝率、報酬率與持有時間表現。

## 目前專案架構

- `client/` 是前端，使用 Vue / Vite / Pinia。
- 前端主要畫面在 `client/src/views/`。
- 前端共用元件在 `client/src/components/`。
- 前端 API 呼叫集中在 `client/src/services/api.js`。
- 前端路由在 `client/src/router/index.js`。
- 目前主版面與上方分頁導覽在 `client/src/App.vue`。
- `server/` 是後端 Node.js / Express。
- 後端入口是 `server/index.js`。
- API 路由主要在 `server/routes/apiRouter.js`。
- 股票相關服務在 `server/services/stockService.js`。
- `server/models/` 放資料模型，包含推薦股票與命中紀錄。
- `stock_data.db` 是目前使用的本機 SQLite 日 K 資料庫，裡面放股票歷史日 K 資料，是回測計算的主要價格來源。

修改前請先理解資料流：前端頁面如何呼叫 API、後端如何查詢資料庫、目前股票推薦資料是怎麼被儲存與更新、MongoDB 的推薦紀錄如何對應到 `stock_data.db` 的日 K 資料。

## 回測專區目標

新增一個前端頁面「回測專區」，讓我可以快速回答這些問題：

- 老師一推薦，隔天開盤或隔天收盤買進，勝率是多少？
- 不急著買，等股價跌到支撐價再買，勝率是多少？
- 買進後多久可以達到 10%、20%、30%、40%... 的獲利？
- 不同持有天數下，平均報酬率、最大報酬率、最差報酬率是多少？
- 推薦後如果跌破換股價，視為停損或失敗，結果會如何？
- 短線價與波段價是否真的有統計上的參考價值？
- 哪些股票、哪些推薦紀錄，是回測績效最好或最差的案例？

## 前端新增頁面

建議新增：

- `client/src/views/BacktestView.vue`
- 路由：`/backtest`
- 導覽名稱：`回測專區`

需要修改：

- `client/src/router/index.js`
  - import `BacktestView`
  - 新增 `/backtest` route
- `client/src/App.vue`
  - 在目前「戰情室」「戰果榜」旁邊新增「回測專區」分頁
  - 樣式要沿用現有 stealth / trader mode 的分頁設計
- `client/src/services/api.js`
  - 新增回測 API 方法，例如：
    - `getBacktestSummary(params)`
    - `getBacktestTrades(params)`
    - `getBacktestChart(params)`

## 回測專區頁面規劃

### 1. 頂部篩選列

頁面最上方提供篩選條件，讓使用者可以切換回測範圍與策略。

需要有：

- 日期區間：推薦日期起訖
- 股票代號搜尋
- 買進策略
  - `隔天買進`
  - `跌到支撐價買進`
  - `推薦價直接買進`
- 買進價格基準
  - 開盤價
  - 收盤價
  - 最低價觸及支撐
- 賣出策略
  - 達到 10% 獲利出場
  - 達到 20% 獲利出場
  - 達到 30% 獲利出場
  - 達到 40% 獲利出場
  - 跌破換股價停損
  - 固定持有 N 天
- 最長持有天數
  - 5 / 10 / 20 / 40 / 60 / 120 天
- 是否排除資料不足的紀錄
- 是否只看有完整支撐價、換股價、短線價、波段價的推薦

### 2. 核心統計卡片

篩選列下方顯示一排統計卡片，讓我一眼看出策略好不好。

建議欄位：

- 回測筆數
- 有效進場筆數
- 勝率
- 平均報酬率
- 中位數報酬率
- 最大報酬率
- 最大虧損
- 平均持有天數
- 達標平均天數
- 停損比例
- 未觸發買進比例，特別是「跌到支撐再買」策略

顏色設計：

- 正報酬、勝率、達標：紅色系或現有專案的上漲色
- 負報酬、停損：綠色系或現有專案的下跌色
- 中性資料：灰色 / slate / zinc
- 必須同時支援 `isStealth` 模式

### 3. 策略比較區

需要可以比較不同買進策略。

建議做成表格或橫向卡片：

- 隔天買進
- 跌到支撐買進
- 推薦價買進

每個策略顯示：

- 有效交易數
- 勝率
- 平均報酬
- 平均持有天數
- 10% 達標率
- 20% 達標率
- 30% 達標率
- 40% 達標率
- 停損率

這一區的重點是快速看出「追推薦」和「等支撐」哪個比較好。

### 4. 獲利目標達標時間圖

我想知道獲利 10%、20%、30%、40%... 分別需要多少時間。

建議圖表：

- X 軸：獲利目標，例如 10%、20%、30%、40%、50%
- Y 軸：平均達標天數
- 額外顯示：
  - 達標率
  - 中位數達標天數
  - 最快達標天數
  - 最慢達標天數

前端可以使用現有圖表風格，若專案已有圖表套件就沿用；若沒有，建議選擇輕量且 Vue 好整合的圖表方案。

### 5. 持有時間與報酬率關係圖

我想知道持有越久是否真的比較賺。

建議圖表：

- X 軸：持有天數
- Y 軸：報酬率
- 顯示方式：
  - 散點圖：每一筆推薦是一個點
  - 折線：平均報酬率
  - 可加上 0% 水平線
- 滑鼠 hover 顯示：
  - 股票代號
  - 推薦日期
  - 買進日期
  - 買進價
  - 賣出價或目前價
  - 持有天數
  - 報酬率
  - 出場原因：達標 / 停損 / 到期 / 尚未出場

### 6. 回測明細表

頁面下方需要明細表，方便檢查每筆資料。

欄位建議：

- 股票代號
- 股票名稱
- 推薦日期
- 推薦時股價
- 支撐價
- 換股價
- 短線價
- 波段價
- 買進策略
- 買進日期
- 買進價
- 最高價
- 最低價
- 賣出日期
- 賣出價
- 持有天數
- 報酬率
- 是否達 10%
- 是否達 20%
- 是否達 30%
- 是否達 40%
- 出場原因

表格功能：

- 搜尋股票代號或名稱
- 依推薦日期、報酬率、持有天數、達標狀態排序
- 分頁
- 可切換只看成功 / 失敗 / 停損 / 未買進
- 點擊單筆資料可以展開詳細價格路徑

## API 規劃

前端需要後端提供回測資料，建議 API 先拆成三類：

### `GET /api/backtest/summary`

用途：取得統計卡片與策略比較資料。

Query params 建議：

- `startDate`
- `endDate`
- `symbol`
- `buyStrategy`
- `sellStrategy`
- `maxHoldingDays`
- `profitTargets`
- `excludeIncomplete`

回傳建議：

- summary
- strategyComparison
- targetStats

### `GET /api/backtest/trades`

用途：取得回測明細表。

Query params 建議：

- 同 summary
- `page`
- `pageSize`
- `sortKey`
- `sortOrder`
- `status`

回傳建議：

- items
- total
- page
- pageSize

### `GET /api/backtest/chart`

用途：取得圖表資料。

Query params 建議：

- 同 summary
- `chartType`
  - `profit-target-days`
  - `holding-return`

回傳建議：

- profitTargetDays
- holdingReturnPoints
- averageReturnByHoldingDays

## 後端與資料來源規劃

目前推薦紀錄與日 K 資料分在兩個資料來源：

- MongoDB：`RecognizedStock`，保存老師推薦紀錄、推薦日期、推薦時股價、支撐價、換股價、短線價、波段價。
- MongoDB：`StockHitLog`，保存即時監控時觸及支撐、短線、波段、換股的紀錄。
- SQLite：`stock_data.db`，保存股票歷史日 K，回測時應以此為主要價格來源。

回測後端需要新增一個清楚的資料讀取層，建議新增：

- `server/services/backtestService.js`
- `server/services/dailyKService.js`
- 或把 SQLite 查詢集中在 `server/services/stockDataDbService.js`

後端目前 `server/package.json` 尚未看到 SQLite 讀取套件；如果實作時要讀 `stock_data.db`，需要新增合適套件，例如：

- `better-sqlite3`
- 或 `sqlite3`

建議優先使用同步查詢簡單、效能穩定的 `better-sqlite3`，但要先確認 Windows 安裝與部署環境是否可用。

### 日 K 資料需要確認的欄位

實作回測前，必須先確認 `stock_data.db` 的實際 table schema。至少需要知道：

- 股票代號欄位名稱
- 日期欄位名稱與格式
- 開盤價
- 最高價
- 最低價
- 收盤價
- 成交量，如果有的話可先保留
- 是否已經處理除權息與還原股價

回測最少需要這些欄位：

- `symbol`
- `date`
- `open`
- `high`
- `low`
- `close`

如果實際欄位名稱不同，請在 `dailyKService` 裡做轉換，讓回測服務拿到統一格式，不要讓前端或回測主邏輯直接依賴資料庫原始欄位名稱。

### MongoDB 推薦紀錄與日 K 對接

回測單位應該是「一筆推薦紀錄」，不是股票代號。

每筆 `RecognizedStock` 需要對應：

- `stock._id`：推薦紀錄 ID
- `stock.code`：股票代號，用來查日 K
- `stock.createdAt`：推薦時間，用來找推薦日或下一個交易日
- `stock.currentPrice`：推薦當下記錄的股價，可作為推薦價策略的買進價
- `stock.support`：支撐價或支撐區間
- `stock.swapRef`：換股價或停損參考
- `stock.shortTermProfit`：短線目標價
- `stock.waveProfit`：波段目標價

日 K 查詢時要用 `stock.code` 找對應股票，再用 `stock.createdAt` 找推薦日之後的交易日序列。

### 交易日規則

不能用日曆日硬加一天。回測需要從日 K 資料中找交易日：

- 推薦日如果當天有日 K，可視為推薦交易日。
- 如果推薦時間晚於收盤，隔天買進應該找下一個交易日。
- 如果推薦日沒有日 K，找推薦日期之後第一個有資料的交易日。
- 隔天買進是找推薦交易日後的下一筆日 K。
- 固定持有 N 天是持有 N 個交易日，不是 N 個自然日。

### 價格解析規則

目前支撐價、換股價、短線價、波段價可能是字串，也可能是區間，例如 `100-105`。

需要統一解析規則：

- 支撐價：建議第一版使用區間上緣，較容易觸發買進。
- 換股價：建議第一版使用區間上緣，較容易觸發停損，偏保守。
- 短線價：建議第一版使用區間下緣，較容易判定達標。
- 波段價：建議第一版使用區間下緣，較容易判定達標。

這個規則目前後端 `apiRouter.js` 的 `parseTargetPrice` 已經有類似邏輯，回測服務可以抽出共用 helper，避免即時監控與回測判定不一致。

## 還缺的關鍵規劃

目前規劃還需要補齊這些事情，實作時要優先確認：

1. `stock_data.db` 的 table schema 與欄位名稱。
2. `stock_data.db` 的資料是否已經做還原股價；如果沒有，長期回測可能會被除權息影響。
3. 後端要新增 SQLite 讀取套件與查詢服務。
4. 回測服務要決定回傳是否即時計算，還是先計算後快取。
5. 推薦時間如果是盤中、盤後、假日，要定義買進日邏輯。
6. 支撐價、換股價、短線價、波段價的區間解析規則要固定。
7. 「勝率」的定義要固定：是最終報酬大於 0、達到短線價、達到指定獲利目標，還是沒有停損都算勝。
8. 「失敗」的定義要固定：跌破換股價、固定持有期報酬小於 0、或沒有達標都算失敗。
9. 未觸發買進的紀錄要獨立統計，不要算進勝率分母，除非 UI 有特別切換。
10. 同一股票多次推薦需要各自獨立回測，但圖表可以用股票代號分組查看。
11. 需要決定是否把回測結果存進資料庫；第一版建議先即時計算，不先落地。
12. 需要為後端新增測試資料或至少做幾筆人工案例驗證，避免交易日與價格觸發規則算錯。

## 前端狀態管理規劃

可以新增一個 Pinia store：

- `client/src/stores/backtestStore.js`

建議 state：

- `filters`
- `summary`
- `strategyComparison`
- `targetStats`
- `chartData`
- `trades`
- `pagination`
- `sortConfig`
- `isLoading`
- `error`

建議 actions：

- `fetchBacktestSummary()`
- `fetchBacktestTrades()`
- `fetchBacktestChart()`
- `setFilters(partialFilters)`
- `setSort(key)`
- `setPage(page)`
- `refreshBacktest()`

如果回測資料量不大，也可以先在 `BacktestView.vue` 內用 local state 完成，等功能穩定後再抽 store。

## 前端元件拆分建議

如果頁面變大，建議拆成：

- `client/src/components/backtest/BacktestFilters.vue`
- `client/src/components/backtest/BacktestSummaryCards.vue`
- `client/src/components/backtest/BacktestStrategyComparison.vue`
- `client/src/components/backtest/ProfitTargetDaysChart.vue`
- `client/src/components/backtest/HoldingReturnChart.vue`
- `client/src/components/backtest/BacktestTradesTable.vue`

第一版也可以先全部寫在 `BacktestView.vue`，但元件命名與資料結構要預留拆分空間。

## 回測計算規則

實作前要先定義清楚，避免結果看起來漂亮但其實規則不一致。

### 隔天買進

- 以推薦日期的下一個交易日作為買進日。
- 買進價可用開盤價或收盤價，前端提供選項。
- 如果下一個交易日沒有股價資料，該筆標記為資料不足。

### 跌到支撐價買進

- 從推薦日後開始檢查每日最低價。
- 若最低價小於等於支撐價，視為觸發買進。
- 買進價可先用支撐價，或用當日收盤價；此規則必須在 UI 顯示清楚。
- 如果最長觀察期間內都沒有跌到支撐，該筆標記為未觸發買進。

### 停損或失敗

- 如果股價跌破換股價，可以視為停損。
- 需要決定是用最低價觸發，還是收盤價跌破才觸發。
- 第一版建議用最低價觸發，因為比較接近實際盤中風險。

### 獲利達標

- 買進後每日最高價如果達到買進價的 10%、20%、30%、40%... 就記錄達標。
- 每個目標要記錄：
  - 是否達標
  - 第幾天達標
  - 達標日期
  - 達標時最高價

### 固定持有 N 天

- 買進後持有 N 個交易日。
- 用第 N 個交易日收盤價計算報酬。
- 如果資料不足 N 天，標記為資料不足或用最後可用收盤價，這個規則要在 UI 上註明。

## 第一版實作順序

建議先做 MVP，不要一開始就把所有圖表做滿。

1. 新增 `/backtest` 頁面與 App 分頁。
2. 新增 `BacktestView.vue` 的基本版面。
3. 做出篩選列與統計卡片的靜態 UI。
4. 後端先提供 `GET /api/backtest/summary`。
5. 前端串接 summary API，顯示勝率、平均報酬、平均持有天數。
6. 新增回測明細表與 `GET /api/backtest/trades`。
7. 再加入策略比較區。
8. 最後加入兩張圖：
   - 獲利目標達標時間圖
   - 持有時間與報酬率關係圖

## UI 風格要求

- 沿用目前戰情室的深色交易風格與 stealth office mode。
- 不要做成行銷 landing page，第一畫面就是可操作的回測工具。
- 卡片、表格、篩選器要偏工具型、資訊密度高。
- 手機版可以先保證能篩選、看摘要、滑動表格。
- 桌機版要讓篩選、統計、圖表、表格都容易掃讀。
- 數字要有清楚格式：
  - 報酬率顯示 `%`
  - 金額顯示到合理小數
  - 天數顯示 `N 天`
  - 缺資料顯示 `-` 或 `資料不足`

## 注意事項

- 不要直接相信目前的 `currentPrice` 就能做完整歷史回測；`currentPrice` 是推薦當下記錄或即時價格欄位，完整回測應使用 `stock_data.db` 的日 K。
- 回測要使用 `stock_data.db` 的歷史日 K，不是即時股價 API。
- 推薦日期、買進日期、賣出日期都要用交易日邏輯，不能只用日曆日硬加一天。
- 同一檔股票可能有多次推薦紀錄，回測要以「推薦紀錄」為單位，不是只以股票代號為單位。
- 支撐價可能是區間，例如 `100-105`，需要先定義用上緣、下緣或平均值。
- 如果資料有缺漏，前端要清楚顯示資料不足，不要把它算成失敗。
- 第一版可以先使用簡單規則，但規則要固定、可說明、可在 UI 顯示。
