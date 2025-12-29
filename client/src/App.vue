<script setup>
import { ref, computed, onMounted, onUnmounted } from 'vue'
import axios from 'axios'
import StockCard from './components/StockCard.vue'
import RecognizedStockCard from './components/RecognizedStockCard.vue'

// API 配置
const API_URL = import.meta.env.VITE_API_PATH
const stocks = ref([])
const recognizedStocks = ref([])
const inputSymbol = ref('')
const isLoading = ref(false)
const lastUpdated = ref('')
const isStealth = ref(false)
let timer = null

// --- 置頂功能 ---

// 置頂清單的響應式狀態
const pinnedList = ref([])

// 從 localStorage 載入置頂清單
const loadPinnedStocks = () => {
  try {
    const stored = localStorage.getItem('pinned-stocks')
    pinnedList.value = stored ? JSON.parse(stored) : []
  } catch (e) {
    console.error('Failed to load pinned stocks from localStorage:', e)
    pinnedList.value = []
  }
}

// 儲存置頂清單到 localStorage
const savePinnedStocks = () => {
  try {
    localStorage.setItem('pinned-stocks', JSON.stringify(pinnedList.value))
    console.log('💾 置頂清單已儲存:', pinnedList.value)
  } catch (e) {
    console.error('Failed to save pinned stocks to localStorage:', e)
  }
}

// 切換置頂狀態
const togglePin = (symbol) => {
  const index = pinnedList.value.indexOf(symbol)
  
  if (index > -1) {
    // 取消置頂
    pinnedList.value.splice(index, 1)
    console.log(`📍 取消置頂: ${symbol}`)
  } else {
    // 加入置頂
    pinnedList.value.push(symbol)
    console.log(`📌 置頂: ${symbol}`)
  }
  
  savePinnedStocks()
}

// --- Computed: 自動分類邏輯 ---

const manualStocks = computed(() => {
  return stocks.value.filter((item) => item.type === 'manual' || !item.type)
})

// 置頂股票清單（合併手動新增和辨識股票）
const pinnedStocks = computed(() => {
  // 從手動新增的股票中篩選置頂的
  const pinnedManual = manualStocks.value
    .filter(stock => pinnedList.value.includes(stock.symbol))
    .map(stock => ({ ...stock, isPinned: true, source: 'manual' }))
  
  // 從辨識股票中篩選置頂的
  const pinnedRecognized = recognizedStocks.value
    .filter(stock => pinnedList.value.includes(stock.code))
    .map(stock => ({ 
      ...stock, 
      symbol: stock.code, // 統一使用 symbol 欄位
      isPinned: true, 
      source: 'recognized' 
    }))
  
  return [...pinnedManual, ...pinnedRecognized]
})

// 非置頂的手動股票清單
const unpinnedStocks = computed(() => {
  return manualStocks.value
    .filter(stock => !pinnedList.value.includes(stock.symbol))
    .map(stock => ({ ...stock, isPinned: false }))
})

// 非置頂的辨識股票清單
const unpinnedRecognizedStocks = computed(() => {
  return recognizedStocks.value
    .filter(stock => !pinnedList.value.includes(stock.code))
})

// --- API 互動 ---
// 從 localStorage 獲取自選清單（辨識股票的星星標記）
const getFavorites = () => {
  try {
    const stored = localStorage.getItem('stock-favorites')
    return stored ? JSON.parse(stored) : []
  } catch (e) {
    console.error('Failed to load favorites from localStorage:', e)
    return []
  }
}

// 儲存自選清單到 localStorage
const saveFavorites = (favorites) => {
  try {
    localStorage.setItem('stock-favorites', JSON.stringify(favorites))
  } catch (e) {
    console.error('Failed to save favorites to localStorage:', e)
  }
}

// 從 localStorage 獲取個人自選清單（手動新增的股票）
const getManualStocks = () => {
  try {
    const stored = localStorage.getItem('manual-stocks')
    return stored ? JSON.parse(stored) : []
  } catch (e) {
    console.error('Failed to load manual stocks from localStorage:', e)
    return []
  }
}

// 儲存個人自選清單到 localStorage
const saveManualStocks = (stocks) => {
  try {
    localStorage.setItem('manual-stocks', JSON.stringify(stocks))
  } catch (e) {
    console.error('Failed to save manual stocks to localStorage:', e)
  }
}

const fetchData = async () => {
  try {
    // 從 localStorage 讀取手動新增的股票
    const manualStocksLocal = getManualStocks()
    
    // 從 localStorage 讀取自選清單
    const favorites = getFavorites()

    // 從 API 只獲取辨識股票
    const res = await axios.get(`${API_URL}/dashboard`)

    console.log('📊 Dashboard API 回傳:', res.data)

    // 收集所有需要查詢價格的股票代號
    const manualSymbols = manualStocksLocal.map((s) => s.symbol)
    const recognizedSymbols = res.data.recognizedStocks ? res.data.recognizedStocks.map((s) => s.code) : []
    const allSymbols = [...new Set([...manualSymbols, ...recognizedSymbols])] // 去重

    // 如果有股票代號，去 API 獲取即時價格
    let prices = []
    if (allSymbols.length > 0) {
      try {
        const priceRes = await axios.post(`${API_URL}/stock-prices`, { symbols: allSymbols })
        prices = priceRes.data || []
      } catch (err) {
        console.error('獲取股價失敗:', err)
      }
    }

    // 合併手動新增的股票與即時價格
    stocks.value = manualStocksLocal.map((stock) => {
      const priceData = prices.find((p) => p.symbol === stock.symbol)
      return {
        ...stock,
        market: priceData || null,
      }
    })

    // 合併辨識股票的即時價格與置頂狀態
    if (res.data.recognizedStocks) {
      recognizedStocks.value = res.data.recognizedStocks.map(stock => {
        const priceData = prices.find((p) => p.symbol === stock.code)
        return {
          ...stock,
          isPinned: pinnedList.value.includes(stock.code),
          market: priceData || null,
        }
      })
      console.log('✅ 圖片辨識股票數量:', recognizedStocks.value.length)
    }

    lastUpdated.value = new Date().toLocaleTimeString('zh-TW', { hour12: false })
  } catch (e) {
    console.error('Fetch Dashboard Error:', e)
  }
}

// 統一重新整理函數
const refreshAll = async () => {
  await fetchData() // dashboard API 已經包含所有資料
}

const addStock = async () => {
  const symbol = inputSymbol.value.trim().toUpperCase()
  if (!symbol || isLoading.value) return

  isLoading.value = true
  try {
    // 從 localStorage 讀取現有股票
    const manualStocksLocal = getManualStocks()

    // 檢查是否已存在
    const exists = manualStocksLocal.find((s) => s.symbol === symbol)
    if (exists) {
      alert('此股票已在清單中')
      isLoading.value = false
      return
    }

    // 新增股票到 localStorage
    const newStock = {
      _id: `manual-${Date.now()}`,
      id: Date.now(),
      symbol: symbol,
      type: 'manual',
      createdAt: new Date().toISOString(),
    }

    manualStocksLocal.push(newStock)
    saveManualStocks(manualStocksLocal)

    inputSymbol.value = ''
    await fetchData() // 重新抓取資料（包含股價）
  } catch (e) {
    alert('新增失敗')
    console.error('Add Stock Error:', e)
  } finally {
    isLoading.value = false
  }
}

const triggerBot = async () => {
  try {
    await axios.post(`${API_URL}/bot-trigger`)
    await fetchData()
  } catch (e) {
    console.error('Bot Trigger Error:', e)
    alert('Bot trigger 功能暫時不可用')
  }
}

const removeStock = async (id) => {
  if (!confirm('確定移除此監控項目?')) return
  try {
    // 從 localStorage 讀取並過濾掉該股票
    let manualStocksLocal = getManualStocks()
    manualStocksLocal = manualStocksLocal.filter((s) => s._id !== id && s.id !== id)
    saveManualStocks(manualStocksLocal)
    
    // 立即更新 UI
  await fetchData() // dashboard API 已經包含所有資料
  } catch (e) {
    console.error('Delete Stock Error:', e)
  }
}


const removeRecognizedStock = async (id) => {
  if (!confirm('確定刪除此辨識記錄?')) return
  try {
    await axios.delete(`${API_URL}/recognized-stocks/${id}`)
    recognizedStocks.value = recognizedStocks.value.filter((s) => s._id !== id)
  } catch (e) {
    console.error('Delete Recognized Error:', e)
  }
}


const toggleStealth = () => {
  isStealth.value = !isStealth.value
  localStorage.setItem('stealth-mode', isStealth.value ? '1' : '0')
}

// --- 智慧刷新邏輯 ---

// 判斷是否為交易時段
const isTradingHours = () => {
  const now = new Date()
  const day = now.getDay() // 0=週日, 6=週六
  const hour = now.getHours()
  const minute = now.getMinutes()
  const time = hour * 60 + minute

  // 週末不交易
  if (day === 0 || day === 6) return false

  // 交易時間：09:00-13:30
  const marketOpen = 9 * 60
  const marketClose = 13 * 60 + 30

  return time >= marketOpen && time <= marketClose
}

// 取得建議的刷新間隔（毫秒）
const getRefreshInterval = () => {
  if (isTradingHours()) {
    return 2500 // 交易時段：5秒
  } else {
    const now = new Date()
    const hour = now.getHours()
    
    // 盤後時段 13:30-18:00：2分鐘
    if (hour >= 13 && hour < 18) {
      return 120000
    }
    // 非交易時段：5分鐘
    return 300000
  }
}

// 動態調整刷新間隔
const setupDynamicRefresh = () => {
  const updateTimer = () => {
    if (timer) {
      clearInterval(timer)
    }
    
    const interval = getRefreshInterval()
    const intervalText = interval >= 60000 ? `${interval / 60000}分鐘` : `${interval / 1000}秒`
    console.log(`📡 刷新間隔: ${intervalText} (${isTradingHours() ? '交易時段' : '非交易時段'})`)
    
    timer = setInterval(refreshAll, interval)
  }

  updateTimer()
  
  // 每分鐘檢查一次是否需要調整刷新間隔
  setInterval(updateTimer, 60000)
}

// --- Lifecycle ---

onMounted(() => {
  isStealth.value = localStorage.getItem('stealth-mode') === '1'
  
  // 載入置頂清單
  loadPinnedStocks()

  refreshAll()

  // 使用智慧刷新邏輯
  setupDynamicRefresh()
})

onUnmounted(() => {
  if (timer) {
    clearInterval(timer)
    timer = null
  }
})
</script>

<template>
  <div
    class="min-h-screen transition-colors duration-500 font-sans pb-20 selection:bg-blue-500/30"
    :class="isStealth ? 'bg-slate-50 text-slate-700' : 'bg-[#0f0f0f] text-gray-100'"
  >
    <div class="max-w-7xl mx-auto p-4 md:p-8">
      <header
        class="flex flex-col md:flex-row justify-between items-center border-b pb-6 mb-8 gap-4"
        :class="isStealth ? 'border-gray-200' : 'border-zinc-800'"
      >
        <div class="flex items-center gap-4">
          <h1 class="text-2xl font-black tracking-tight italic">
            {{ isStealth ? 'Core_System_Report' : '🚀 2026 財富自由戰情室' }}
          </h1>
          <button
            v-if="!isStealth"
            @click="triggerBot"
            class="px-2 py-1 rounded text-[10px] border border-zinc-700 text-zinc-500 hover:border-blue-500 hover:text-blue-400 transition-all uppercase tracking-tighter"
          >
            Run Bot Test
          </button>
        </div>

        <div class="flex items-center gap-6">
          <div class="flex flex-col items-end">
            <div
              class="flex items-center gap-2 text-[10px] font-mono opacity-50 uppercase tracking-widest"
            >
              <span
                class="w-1.5 h-1.5 rounded-full bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.6)]"
              ></span>
              Live Syncing
            </div>
            <span class="text-xs font-mono opacity-70">{{ lastUpdated }}</span>
          </div>

          <button
            @click="toggleStealth"
            class="px-5 py-2 rounded-full text-xs font-bold border transition-all hover:scale-105 active:scale-95 shadow-sm"
            :class="
              isStealth
                ? 'border-slate-300 text-slate-500 bg-white hover:bg-slate-100'
                : 'border-zinc-700 text-zinc-400 hover:border-blue-500 hover:text-blue-400 bg-zinc-900/50'
            "
          >
            {{ isStealth ? '🏢 OFFICE MODE' : '🚀 TRADER MODE' }}
          </button>
        </div>
      </header>

      <!-- 置頂區域 -->
      <section v-if="pinnedStocks.length > 0" class="mb-14">
        <div class="flex items-center gap-3 mb-6 pl-1">
          <h2 class="text-xl font-bold tracking-tight">
            {{ isStealth ? 'PINNED_WATCHLIST' : '📌 置頂監控' }}
          </h2>
          <span
            class="px-2 py-0.5 rounded text-[10px] font-mono font-bold"
            :class="
              isStealth
                ? 'bg-yellow-100 text-yellow-700'
                : 'bg-yellow-500/10 text-yellow-400 border border-yellow-500/20'
            "
          >
            PINNED: {{ pinnedStocks.length }}
          </span>
        </div>

        <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          <template v-for="item in pinnedStocks" :key="item._id || item.id">
            <!-- 手動新增的股票 -->
            <StockCard
              v-if="item.source === 'manual'"
              :item="item"
              :is-stealth="isStealth"
              @remove="removeStock"
              @togglePin="togglePin"
            />
            <!-- 辨識的股票 -->
            <RecognizedStockCard
              v-else-if="item.source === 'recognized'"
              :item="item"
              :is-stealth="isStealth"
              @remove="removeRecognizedStock"
              @togglePin="togglePin"
            />
          </template>
        </div>
      </section>

      <section class="mb-14">
        <div class="flex items-center justify-between mb-6 pl-1">
          <div class="flex items-center gap-3">
            <h2 class="text-xl font-bold tracking-tight">
              {{ isStealth ? 'AI_ANALYTICS_DATA' : '圖片辨識分析' }}
            </h2>
            <span
              class="px-2 py-0.5 rounded text-[10px] font-mono font-bold"
              :class="
                isStealth
                  ? 'bg-slate-200 text-slate-500'
                  : 'bg-green-500/10 text-green-400 border border-green-500/20'
              "
            >
              COUNT: {{ unpinnedRecognizedStocks.length }}
            </span>
          </div>
        </div>

        <div
          v-if="unpinnedRecognizedStocks.length === 0"
          class="py-12 text-center border-2 border-dashed rounded-2xl transition-colors"
          :class="isStealth ? 'border-slate-200 text-slate-400' : 'border-zinc-800 text-zinc-600'"
        >
          <p class="text-sm font-medium">No records found.</p>
        </div>

        <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          <RecognizedStockCard
            v-for="item in unpinnedRecognizedStocks"
            :key="item._id"
            :item="item"
            :is-stealth="isStealth"
            @remove="removeRecognizedStock"
            @togglePin="togglePin"
          />
        </div>
      </section>

      <div class="flex gap-3 mb-14 max-w-lg">
        <div class="relative flex-1">
          <input
            v-model="inputSymbol"
            @keyup.enter="addStock"
            :placeholder="isStealth ? 'Query identifier...' : '輸入代號加入監控 (如 2330)'"
            class="w-full px-5 py-3 rounded-xl border outline-none transition-all"
            :class="
              isStealth
                ? 'bg-white border-slate-200 focus:border-slate-400 focus:ring-4 focus:ring-slate-100 text-slate-600'
                : 'bg-zinc-900 border-zinc-800 text-white focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10'
            "
          />
        </div>
        <button
          @click="addStock"
          :disabled="isLoading"
          class="px-8 py-3 rounded-xl font-black transition-all active:scale-95 disabled:opacity-50"
          :class="
            isStealth
              ? 'bg-slate-700 text-white hover:bg-slate-800'
              : 'bg-blue-600 text-white hover:bg-blue-500 hover:shadow-[0_0_20px_rgba(37,99,235,0.4)]'
          "
        >
          {{ isLoading ? '...' : 'ADD' }}
        </button>
      </div>

      <section>
        <div>
          <div class="flex items-center gap-3 mb-6 pl-1">
            <h2 class="text-xl font-bold tracking-tight">
              {{ isStealth ? 'USER_WATCHLIST_LOCAL' : '個人自選清單' }}
            </h2>
            <span
              class="px-2 py-0.5 rounded text-[10px] font-mono font-bold"
              :class="
                isStealth
                  ? 'bg-slate-200 text-slate-500'
                  : 'bg-blue-500/10 text-blue-400 border border-blue-500/20'
              "
            >
              ITEMS: {{ unpinnedStocks.length }}
            </span>
          </div>

          <div
            v-if="unpinnedStocks.length === 0 && pinnedStocks.length === 0"
            class="py-12 text-center border-2 border-dashed rounded-2xl"
            :class="isStealth ? 'border-slate-200' : 'border-zinc-800'"
          >
            <p class="text-sm opacity-40">Watchlist is empty.</p>
          </div>

          <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
            <StockCard
              v-for="item in unpinnedStocks"
              :key="item._id || item.id"
              :item="item"
              :is-stealth="isStealth"
              @remove="removeStock"
              @togglePin="togglePin"
            />
          </div>
        </div>
      </section>
    </div>
  </div>
</template>
