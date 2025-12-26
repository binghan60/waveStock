<script setup>
import { ref, onMounted, onUnmounted } from 'vue'
import axios from 'axios'

const API_URL = 'http://localhost:3001/api'

const stocks = ref([])
const inputSymbol = ref('')
const isLoading = ref(false)
const lastUpdated = ref('')
let timer = null

// 🕶 Stealth Mode
const isStealth = ref(false)

const toggleStealth = () => {
  isStealth.value = !isStealth.value
  localStorage.setItem('stealth-mode', isStealth.value ? '1' : '0')
}

// ------------------ utils ------------------

const formatPrice = (val) => {
  const num = parseFloat(val)
  if (isNaN(num)) return '-'
  return num.toFixed(1)
}

const formatNumber = (val) => {
    if (!val) return '-'
    return parseInt(val).toLocaleString()
}

const getDaysLeft = (dateStr) => {
  const created = new Date(dateStr)
  const expire = new Date(created)
  expire.setDate(created.getDate() + 30)
  const diff = expire - new Date()
  return Math.ceil(diff / (1000 * 60 * 60 * 24))
}

const getStockDetails = (stock) => {
  if (!stock.market) return { diff: 0, percent: '0.00', isUp: false, colorClass: '' }

  const current = parseFloat(stock.market.currentPrice)
  const yesterday = parseFloat(stock.market.yesterdayClose)
  const diff = current - yesterday
  const percent = ((diff / yesterday) * 100).toFixed(2)
  const isUp = diff > 0
  
  // 決定顏色 class
  let colorClass = 'text-gray-500' // 預設/Stealth
  if (!isStealth.value) {
      if (diff > 0) colorClass = 'text-red-400'
      else if (diff < 0) colorClass = 'text-green-400'
      else colorClass = 'text-white'
  }

  return {
    diff: Math.abs(diff).toFixed(1),
    percent: Math.abs(percent),
    isUp,
    colorClass
  }
}

// ------------------ API ------------------

const fetchData = async () => {
  try {
    const res = await axios.get(`${API_URL}/dashboard`)
    stocks.value = res.data
    lastUpdated.value = new Date().toLocaleTimeString()
  } catch (e) {
    console.error(e)
  }
}

const addStock = async () => {
  if (!inputSymbol.value) return
  isLoading.value = true
  try {
    await axios.post(`${API_URL}/stocks`, { symbol: inputSymbol.value })
    inputSymbol.value = ''
    await fetchData()
  } catch {
    alert('新增失敗或股票已存在')
  } finally {
    isLoading.value = false
  }
}

const removeStock = async (id) => {
  if (!confirm('確定移除?')) return
  await axios.delete(`${API_URL}/stocks/${id}`)
  fetchData()
}

const extendStock = async (id) => {
  await axios.patch(`${API_URL}/stocks/${id}/extend`)
  fetchData()
  // 移除 alert 避免干擾
}

// ------------------ lifecycle ------------------

onMounted(() => {
  isStealth.value = localStorage.getItem('stealth-mode') === '1'
  fetchData()
  timer = setInterval(fetchData, 5000)
})

onUnmounted(() => {
  if (timer) clearInterval(timer)
})
</script>

<template>
  <div
    class="min-h-screen transition-colors duration-300 font-sans"
    :class="isStealth ? 'bg-slate-100 text-slate-700' : 'bg-[#121212] text-gray-100'"
  >
    <div class="max-w-6xl mx-auto p-4 md:p-8">

      <header
        class="flex flex-col md:flex-row justify-between items-center border-b pb-4 mb-6 gap-4"
        :class="isStealth ? 'border-gray-300' : 'border-zinc-800'"
      >
        <h1 class="text-xl font-bold tracking-wide">
          {{ isStealth ? 'System Monitor Dashboard v2.0' : '📈 2026 財富自由戰情室' }}
        </h1>

        <div class="flex items-center gap-4">
          <div class="flex items-center gap-2 text-xs font-mono opacity-60">
            <span class="w-2 h-2 rounded-full bg-green-500 animate-pulse"></span>
            <span>Last Update: {{ lastUpdated }}</span>
          </div>

          <button
            @click="toggleStealth"
            class="px-4 py-1.5 rounded-full text-xs font-medium border transition-all duration-200"
            :class="isStealth
              ? 'border-gray-400 text-gray-600 hover:bg-gray-200'
              : 'border-zinc-600 text-zinc-400 hover:border-blue-400 hover:text-blue-400 hover:bg-zinc-800'"
          >
            {{ isStealth ? '🏢 Office Mode' : '🚀 Trader Mode' }}
          </button>
        </div>
      </header>

      <div class="flex gap-3 mb-8 max-w-md mx-auto md:mx-0">
        <input
          v-model="inputSymbol"
          @keyup.enter="addStock"
          :placeholder="isStealth ? 'Enter process ID...' : '輸入股票代號 (如 2330)'"
          class="flex-1 px-4 py-2.5 rounded-lg border outline-none transition-all"
          :class="isStealth
            ? 'bg-white border-gray-300 focus:border-blue-500 focus:ring-2 focus:ring-blue-100'
            : 'bg-zinc-900 border-zinc-700 text-white focus:border-blue-500'"
        />
        <button
          @click="addStock"
          :disabled="isLoading"
          class="px-6 py-2.5 rounded-lg font-medium transition shadow-lg active:scale-95"
          :class="isStealth
            ? 'bg-slate-600 text-white hover:bg-slate-700'
            : 'bg-blue-600 hover:bg-blue-500 text-white'"
        >
          {{ isLoading ? '...' : '+' }}
        </button>
      </div>

      <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
        <div
          v-for="item in stocks"
          :key="item.id"
          class="group relative rounded-xl p-5 border transition-all duration-300"
          :class="[
            isStealth
              ? 'bg-white border-gray-200 shadow-sm'
              : 'bg-zinc-900 border-zinc-800 hover:border-zinc-600 hover:bg-zinc-800/80 hover:-translate-y-1 hover:shadow-xl hover:shadow-black/50',
            getDaysLeft(item.createdAt) <= 5 && !isStealth
              ? '!border-orange-500/50'
              : ''
          ]"
        >
          <div class="flex justify-between items-start mb-3">
            <div>
              <div class="flex items-baseline gap-2">
                <span class="text-2xl font-bold tracking-tight" :class="isStealth ? 'text-slate-700' : 'text-white'">
                  {{ item.symbol }}
                </span>
                <span class="text-xs opacity-50" v-if="item.market">
                   {{ isStealth ? 'PID-Node' : item.market.name }}
                </span>
              </div>
            </div>
            <button
              @click="removeStock(item.id)"
              class="opacity-0 group-hover:opacity-100 transition-opacity p-1 hover:text-red-400"
            >
              ✕
            </button>
          </div>

          <div v-if="item.market" class="space-y-3">
            
            <div class="flex items-end gap-3">
              <div 
                class="text-4xl font-extrabold leading-none tabular-nums tracking-tight"
                :class="getStockDetails(item).colorClass"
              >
                {{ formatPrice(item.market.currentPrice) }}
              </div>
              
              <div 
                class="flex flex-col text-xs font-medium mb-1"
                :class="getStockDetails(item).colorClass"
              >
                <span class="flex items-center">
                   {{ isStealth ? (getStockDetails(item).isUp ? '+' : '-') : (getStockDetails(item).isUp ? '▲' : '▼') }}
                   {{ getStockDetails(item).diff }}
                </span>
                <span class="opacity-80">
                   {{ getStockDetails(item).percent }}%
                </span>
              </div>
            </div>

            <div 
                class="flex justify-between items-center text-xs pt-3 border-t"
                :class="isStealth ? 'border-gray-100 text-gray-500' : 'border-zinc-700/50 text-gray-400'"
            >
                <div class="flex flex-col">
                    <span class="opacity-50 scale-90 origin-left uppercase">{{ isStealth ? 'Ref' : '昨收' }}</span>
                    <span class="font-mono">{{ formatPrice(item.market.yesterdayClose) }}</span>
                </div>
                <div class="flex flex-col items-end">
                    <span class="opacity-50 scale-90 origin-right uppercase">{{ isStealth ? 'Vol' : '總量' }}</span>
                    <span class="font-mono">{{ formatNumber(item.market.volume) }}</span>
                </div>
            </div>

          </div>

          <div v-else class="h-24 flex items-center justify-center text-sm opacity-30 animate-pulse">
            Syncing Data...
          </div>

          <div class="mt-4 pt-2">
            <div 
                class="h-1 w-full rounded-full overflow-hidden mb-2"
                :class="isStealth ? 'bg-gray-100' : 'bg-zinc-800'"
            >
                <div 
                    class="h-full transition-all duration-500"
                    :class="[
                        isStealth ? 'bg-slate-400' : 'bg-blue-600',
                        getDaysLeft(item.createdAt) <= 5 && !isStealth ? '!bg-orange-500' : ''
                    ]"
                    :style="{ width: (getDaysLeft(item.createdAt) / 30) * 100 + '%' }"
                ></div>
            </div>
            
            <div class="flex justify-between items-center text-[10px] uppercase tracking-wider opacity-60">
               <span>Exp: {{ getDaysLeft(item.createdAt) }} Days</span>
               <button 
                 @click="extendStock(item.id)"
                 class="hover:text-blue-400 hover:opacity-100 transition-colors"
               >
                 {{ isStealth ? 'Refresh' : 'Renew' }} ↻
               </button>
            </div>
          </div>

        </div>
      </div>

    </div>
  </div>
</template>