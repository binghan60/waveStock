<script setup>
import { ref, computed, onMounted, onUnmounted } from 'vue'
import axios from 'axios'
// 引入你剛剛做好的卡片組件
import StockCard from './components/StockCard.vue'

// ⚠️ 請確認你的後端 Port 是 3000 還是 3001 (依照你 server 的設定)
const API_URL = 'http://localhost:3001/api'

const stocks = ref([])
const inputSymbol = ref('')
const isLoading = ref(false)
const lastUpdated = ref('')
const isStealth = ref(false)
let timer = null

// --- Computed: 自動分類邏輯 ---

// 1. 機器人/API 自動抓取的 (type === 'auto')
const autoStocks = computed(() => {
  return stocks.value.filter((item) => item.type === 'auto')
})

// 2. 使用者手動新增的 (type === 'manual' 或 舊資料無 type)
const manualStocks = computed(() => {
  return stocks.value.filter((item) => item.type === 'manual' || !item.type)
})

// --- API 互動 ---

const fetchData = async () => {
  try {
    const res = await axios.get(`${API_URL}/dashboard`)
    stocks.value = res.data
    lastUpdated.value = new Date().toLocaleTimeString()
  } catch (e) {
    console.error('API Error:', e)
  }
}

const addStock = async () => {
  if (!inputSymbol.value) return
  isLoading.value = true
  try {
    // 手動新增時，帶入 type: 'manual'
    await axios.post(`${API_URL}/stocks`, {
      symbol: inputSymbol.value,
      type: 'manual',
    })
    inputSymbol.value = ''
    await fetchData()
  } catch (e) {
    alert('新增失敗或股票已存在')
  } finally {
    isLoading.value = false
  }
}

// 測試功能：模擬機器人自動新增股票
const triggerBot = async () => {
  try {
    await axios.post(`${API_URL}/bot-trigger`)
    await fetchData()
    // 不跳 alert，保持體驗流暢
  } catch (e) {
    console.error(e)
  }
}

const removeStock = async (id) => {
  if (!confirm('確定移除此監控項目?')) return
  await axios.delete(`${API_URL}/stocks/${id}`)
  fetchData()
}

const extendStock = async (id) => {
  await axios.patch(`${API_URL}/stocks/${id}/extend`)
  fetchData()
  // 成功時不特別干擾使用者
}

// --- Stealth Mode ---

const toggleStealth = () => {
  isStealth.value = !isStealth.value
  localStorage.setItem('stealth-mode', isStealth.value ? '1' : '0')
}

// --- Lifecycle ---

onMounted(() => {
  // 讀取上次的主題設定
  isStealth.value = localStorage.getItem('stealth-mode') === '1'

  fetchData()
  // 每 5 秒更新一次
  timer = setInterval(fetchData, 10000)
})

onUnmounted(() => {
  if (timer) clearInterval(timer)
})
</script>

<template>
  <div
    class="min-h-screen transition-colors duration-300 font-sans pb-20 selection:bg-blue-500 selection:text-white"
    :class="isStealth ? 'bg-slate-100 text-slate-700' : 'bg-[#121212] text-gray-100'"
  >
    <div class="max-w-7xl mx-auto p-4 md:p-8">
      <header
        class="flex flex-col md:flex-row justify-between items-center border-b pb-4 mb-8 gap-4 transition-colors"
        :class="isStealth ? 'border-gray-300' : 'border-zinc-800'"
      >
        <div class="flex items-center gap-3">
          <h1 class="text-2xl font-bold tracking-wide">
            {{ isStealth ? 'System Monitor Dashboard' : '📈 2026 財富自由戰情室' }}
          </h1>
          <button
            v-if="!isStealth"
            @click="triggerBot"
            class="px-2 py-0.5 rounded text-[10px] border border-dashed border-zinc-600 text-zinc-500 hover:text-zinc-300 hover:border-zinc-400 opacity-50 hover:opacity-100 transition"
            title="模擬後端自動抓取股票"
          >
            🤖 Bot Test
          </button>
        </div>

        <div class="flex items-center gap-4">
          <div class="flex items-center gap-2 text-xs font-mono opacity-60">
            <span class="w-2 h-2 rounded-full bg-green-500 animate-pulse"></span>
            <span>Update: {{ lastUpdated }}</span>
          </div>

          <button
            @click="toggleStealth"
            class="px-4 py-1.5 rounded-full text-xs font-medium border transition-all hover:scale-105 active:scale-95"
            :class="
              isStealth
                ? 'border-gray-400 text-gray-600 hover:bg-gray-200 bg-white'
                : 'border-zinc-600 text-zinc-400 hover:border-blue-400 hover:text-blue-400 hover:bg-zinc-800'
            "
          >
            {{ isStealth ? '🏢 Office Mode' : '🚀 Trader Mode' }}
          </button>
        </div>
      </header>

      <div class="flex gap-3 mb-10 max-w-md mx-auto md:mx-0">
        <input
          v-model="inputSymbol"
          @keyup.enter="addStock"
          :placeholder="isStealth ? 'Input parameter ID...' : '輸入代號加入自選 (如 2603)'"
          class="flex-1 px-4 py-2.5 rounded-lg border outline-none transition-all shadow-sm focus:ring-2 focus:ring-offset-2 focus:ring-offset-[#121212]"
          :class="
            isStealth
              ? 'bg-white border-gray-300 focus:ring-blue-200 focus:border-blue-400'
              : 'bg-zinc-900 border-zinc-700 text-white focus:ring-blue-900 focus:border-blue-500'
          "
        />
        <button
          @click="addStock"
          :disabled="isLoading"
          class="px-6 py-2.5 rounded-lg font-bold text-white transition shadow-lg active:scale-95 hover:shadow-blue-500/20"
          :class="isStealth ? 'bg-slate-600 hover:bg-slate-700' : 'bg-blue-600 hover:bg-blue-500'"
        >
          {{ isLoading ? '...' : '＋' }}
        </button>
      </div>

      <section class="mb-12">
        <div class="flex items-center gap-3 mb-5 pl-1">
          <h2 class="text-xl font-bold opacity-90 flex items-center gap-2">
            <span v-if="!isStealth" class="text-2xl">🤖</span>
            {{ isStealth ? 'System Auto-Tracked' : '群組自動追蹤' }}
          </h2>
          <span
            class="px-2.5 py-0.5 rounded-full text-xs font-bold"
            :class="
              isStealth
                ? 'bg-purple-100 text-purple-600'
                : 'bg-purple-500/20 text-purple-300 border border-purple-500/30'
            "
          >
            {{ autoStocks.length }}
          </span>
        </div>

        <div
          v-if="autoStocks.length === 0"
          class="py-8 text-center border-2 border-dashed rounded-xl opacity-30"
          :class="isStealth ? 'border-gray-300' : 'border-zinc-800'"
        >
          <p class="text-sm">暫無機器人自動抓取資料</p>
          <p v-if="!isStealth" class="text-xs mt-1">(請點擊標題旁的 Bot Test 模擬)</p>
        </div>

        <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
          <StockCard
            v-for="item in autoStocks"
            :key="item.id"
            :item="item"
            :is-stealth="isStealth"
            :badge="isStealth ? 'SYS' : 'AUTO'"
            @remove="removeStock"
            @extend="extendStock"
          />
        </div>
      </section>

      <section>
        <div class="flex items-center gap-3 mb-5 pl-1">
          <h2 class="text-xl font-bold opacity-90 flex items-center gap-2">
            <span v-if="!isStealth" class="text-2xl">👤</span>
            {{ isStealth ? 'Manual Watchlist' : '個人自選清單' }}
          </h2>
          <span
            class="px-2.5 py-0.5 rounded-full text-xs font-bold"
            :class="
              isStealth
                ? 'bg-blue-100 text-blue-600'
                : 'bg-blue-500/20 text-blue-300 border border-blue-500/30'
            "
          >
            {{ manualStocks.length }}
          </span>
        </div>

        <div
          v-if="manualStocks.length === 0"
          class="py-8 text-center border-2 border-dashed rounded-xl opacity-30"
          :class="isStealth ? 'border-gray-300' : 'border-zinc-800'"
        >
          <p class="text-sm">上方輸入代號加入監控</p>
        </div>

        <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
          <StockCard
            v-for="item in manualStocks"
            :key="item.id"
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
