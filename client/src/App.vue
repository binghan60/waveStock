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

// --- Computed: 自動分類邏輯 ---

const manualStocks = computed(() => {
  return stocks.value.filter((item) => item.type === 'manual' || !item.type)
})

// --- API 互動 ---

const fetchData = async () => {
  try {
    const res = await axios.get(`${API_URL}/dashboard`)

    console.log('📊 Dashboard API 回傳:', res.data)

    // 新的 API 回傳格式包含 manualStocks 和 recognizedStocks
    if (res.data.manualStocks && res.data.recognizedStocks) {
      stocks.value = res.data.manualStocks
      recognizedStocks.value = res.data.recognizedStocks
      console.log('✅ 圖片辨識股票數量:', recognizedStocks.value.length)
      console.log('📋 第一筆辨識股票:', recognizedStocks.value[0])
    } else {
      // 向下相容：如果 API 還沒更新，使用舊格式
      stocks.value = res.data
      console.log('⚠️ 使用舊格式 API')
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
  const symbol = inputSymbol.value.trim()
  if (!symbol || isLoading.value) return

  isLoading.value = true
  try {
    await axios.post(`${API_URL}/stocks`, {
      symbol: symbol,
      type: 'manual',
    })
    inputSymbol.value = ''
    await fetchData() // 成功後立即重新抓取
  } catch (e) {
    alert('新增失敗（可能是股票不存在或已在清單中）')
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
  }
}

const removeStock = async (id) => {
  if (!confirm('確定移除此監控項目?')) return
  try {
    await axios.delete(`${API_URL}/stocks/${id}`)
    stocks.value = stocks.value.filter((s) => (s._id || s.id) !== id) // 樂觀更新前端
  } catch (e) {
    console.error('Delete Stock Error:', e)
    fetchData() // 失敗則刷回原本資料
  }
}

const extendStock = async (id) => {
  try {
    await axios.patch(`${API_URL}/stocks/${id}/extend`)
    fetchData()
  } catch (e) {
    console.error('Extend Error:', e)
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

const toggleFavorite = async (id) => {
  try {
    const stock = recognizedStocks.value.find((s) => s._id === id)
    if (!stock) return

    // 樂觀更新 UI
    stock.isFavorite = !stock.isFavorite

    await axios.patch(`${API_URL}/recognized-stocks/${id}/favorite`, {
      isFavorite: stock.isFavorite,
    })
  } catch (e) {
    console.error('Toggle Favorite Error:', e)
    fetchData() // 失敗刷回
  }
}

const toggleStealth = () => {
  isStealth.value = !isStealth.value
  localStorage.setItem('stealth-mode', isStealth.value ? '1' : '0')
}

// --- Lifecycle ---

onMounted(() => {
  isStealth.value = localStorage.getItem('stealth-mode') === '1'

  refreshAll()

  // 每 15 秒更新一次（稍微拉長一點點，降低伺服器負擔）
  timer = setInterval(refreshAll, 15000)
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
              COUNT: {{ recognizedStocks.length }}
            </span>
          </div>
        </div>

        <div
          v-if="recognizedStocks.length === 0"
          class="py-12 text-center border-2 border-dashed rounded-2xl transition-colors"
          :class="isStealth ? 'border-slate-200 text-slate-400' : 'border-zinc-800 text-zinc-600'"
        >
          <p class="text-sm font-medium">No records found.</p>
        </div>

        <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          <RecognizedStockCard
            v-for="item in recognizedStocks"
            :key="item._id"
            :item="item"
            :is-stealth="isStealth"
            @remove="removeRecognizedStock"
            @toggle-favorite="toggleFavorite"
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
            ITEMS: {{ manualStocks.length }}
          </span>
        </div>

        <div
          v-if="manualStocks.length === 0"
          class="py-12 text-center border-2 border-dashed rounded-2xl"
          :class="isStealth ? 'border-slate-200' : 'border-zinc-800'"
        >
          <p class="text-sm opacity-40">Watchlist is empty.</p>
        </div>

        <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
          <StockCard
            v-for="item in manualStocks"
            :key="item._id || item.id"
            :item="item"
            :is-stealth="isStealth"
            @remove="removeStock"
            @extend="extendStock"
          />
        </div>
      </section>
    </div>
  </div>
</template>
