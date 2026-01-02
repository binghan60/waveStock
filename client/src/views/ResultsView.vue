<script setup>
import { ref } from 'vue'
import { storeToRefs } from 'pinia'
import { useStockFormatter } from '@/composables/useStockFormatter'
import { useStockStore } from '@/stores/stockStore'
import { useStockColors } from '@/composables/useStockColors'
import PriceEditModal from '@/components/PriceEditModal.vue'

const { formatPrice: formatStockPrice } = useStockFormatter()
const stockStore = useStockStore()
const { INDICATOR_COLORS, getStatusColor, getStatusBg } = useStockColors()

const { 
  processedRecognizedStocks: recognizedStocks, 
  isStealth,
  searchQuery,
  sortConfig,
  pinnedList
} = storeToRefs(stockStore)

const { 
  updateRecognizedPrice, 
  togglePin, 
  getLimitHitStatus,
  setSearchQuery,
  toggleSort
} = stockStore

// --- Modal 狀態 ---
const isPriceModalVisible = ref(false)
const editingStock = ref(null)

const editInitialPrice = (stock) => {
  editingStock.value = stock
  isPriceModalVisible.value = true
}

const handleCloseModal = () => {
  isPriceModalVisible.value = false
  editingStock.value = null
}

const handleSavePrice = async (newPrice) => {
  if (!editingStock.value) return
  const success = await updateRecognizedPrice(editingStock.value._id, newPrice)
  if (success) {
    handleCloseModal()
  }
}
</script>

<template>
  <div>
    <div class="flex flex-col md:flex-row justify-between items-end mb-6 gap-4">
      <div>
        <div class="flex items-center gap-3 mb-2">
          <h2 class="text-2xl font-bold tracking-tight">
            {{ isStealth ? 'RECOGNITION_RECORDS' : '📊 圖片辨識戰果榜' }}
          </h2>
          <span
            class="px-3 py-1 rounded-full text-xs font-mono font-bold"
            :class="
              isStealth
                ? 'bg-slate-200 text-slate-600'
                : 'bg-gradient-to-r from-blue-500/20 to-purple-500/20 text-blue-400 border border-blue-500/30'
            "
          >
            總計: {{ recognizedStocks.length }} 筆
          </span>
        </div>
        <p class="text-sm opacity-60" :class="isStealth ? 'text-slate-500' : 'text-zinc-400'">
          所有透過圖片辨識的股票資料
        </p>
      </div>

      <!-- Search Bar -->
      <div class="relative w-full md:w-64">
        <input
          :value="searchQuery"
          @input="setSearchQuery($event.target.value)"
          placeholder="搜尋代號或名稱..."
          class="w-full px-4 py-2 rounded-lg text-sm border outline-none transition-all"
          :class="
            isStealth
              ? 'bg-white border-slate-200 focus:border-blue-400'
              : 'bg-zinc-900 border-zinc-700 text-white focus:border-blue-500'
          "
        />
        <span v-if="searchQuery" @click="setSearchQuery('')" class="absolute right-3 top-2.5 text-xs cursor-pointer opacity-50 hover:opacity-100">✕</span>
      </div>
    </div>

    <!-- 空狀態 -->
    <div
      v-if="recognizedStocks.length === 0"
      class="py-20 text-center border-2 border-dashed rounded-2xl transition-colors"
      :class="isStealth ? 'border-slate-200 text-slate-400' : 'border-zinc-800 text-zinc-600'"
    >
      <div class="text-6xl mb-4 opacity-20">📊</div>
      <h3 class="text-lg font-bold mb-2">無符合資料</h3>
      <p class="text-sm opacity-60">
        {{ searchQuery ? '嘗試使用其他關鍵字搜尋' : '上傳股票圖片後，資料將顯示在此處' }}
      </p>
    </div>

    <!-- 表格 -->
    <div
      v-else
      class="overflow-x-auto rounded-2xl border"
      :class="isStealth ? 'border-slate-200' : 'border-zinc-800'"
    >
      <table class="w-full text-sm">
        <thead>
          <tr
            class="border-b font-bold"
            :class="
              isStealth
                ? 'bg-slate-100 border-slate-200 text-slate-700'
                : 'bg-zinc-900/50 border-zinc-800 text-zinc-300'
            "
          >
            <th class="px-4 py-4 text-left font-bold tracking-wide">#</th>
            
            <th 
              @click="toggleSort('code')" 
              class="px-4 py-4 text-left font-bold tracking-wide cursor-pointer hover:opacity-80 select-none"
            >
              股票代號
              <span v-if="sortConfig.key === 'code'" class="ml-1 text-blue-500">{{ sortConfig.order === 'asc' ? '▲' : '▼' }}</span>
            </th>

            <th 
              @click="toggleSort('initialPrice')" 
              class="px-4 py-4 text-right font-bold tracking-wide cursor-pointer hover:opacity-80 select-none"
            >
              新增時股價
              <span v-if="sortConfig.key === 'initialPrice'" class="ml-1 text-blue-500">{{ sortConfig.order === 'asc' ? '▲' : '▼' }}</span>
            </th>

            <th 
              @click="toggleSort('currentPrice')" 
              class="px-4 py-4 text-right font-bold tracking-wide cursor-pointer hover:opacity-80 select-none"
            >
              目前股價
              <span v-if="sortConfig.key === 'currentPrice'" class="ml-1 text-blue-500">{{ sortConfig.order === 'asc' ? '▲' : '▼' }}</span>
            </th>

            <th 
              @click="toggleSort('swapRef')" 
              class="px-4 py-4 text-right font-bold tracking-wide cursor-pointer hover:opacity-80 select-none"
            >
              換股價
              <span v-if="sortConfig.key === 'swapRef'" class="ml-1 text-blue-500">{{ sortConfig.order === 'asc' ? '▲' : '▼' }}</span>
            </th>

            <th 
              @click="toggleSort('support')" 
              class="px-4 py-4 text-right font-bold tracking-wide cursor-pointer hover:opacity-80 select-none"
            >
              支撐區間
              <span v-if="sortConfig.key === 'support'" class="ml-1 text-blue-500">{{ sortConfig.order === 'asc' ? '▲' : '▼' }}</span>
            </th>

            <th 
              @click="toggleSort('shortTermProfit')" 
              class="px-4 py-4 text-right font-bold tracking-wide cursor-pointer hover:opacity-80 select-none"
            >
              短線目標
              <span v-if="sortConfig.key === 'shortTermProfit'" class="ml-1 text-blue-500">{{ sortConfig.order === 'asc' ? '▲' : '▼' }}</span>
            </th>

            <th 
              @click="toggleSort('waveProfit')" 
              class="px-4 py-4 text-right font-bold tracking-wide cursor-pointer hover:opacity-80 select-none"
            >
              波段目標
              <span v-if="sortConfig.key === 'waveProfit'" class="ml-1 text-blue-500">{{ sortConfig.order === 'asc' ? '▲' : '▼' }}</span>
            </th>

            <th 
              @click="toggleSort('isSuccess')" 
              class="px-4 py-4 text-center font-bold tracking-wide cursor-pointer hover:opacity-80 select-none"
            >
              狀態
              <span v-if="sortConfig.key === 'isSuccess'" class="ml-1 text-blue-500">{{ sortConfig.order === 'asc' ? '▲' : '▼' }}</span>
            </th>

            <th 
              @click="toggleSort('updatedAt')" 
              class="px-4 py-4 text-left font-bold tracking-wide cursor-pointer hover:opacity-80 select-none"
            >
              傳入時間
              <span v-if="sortConfig.key === 'updatedAt'" class="ml-1 text-blue-500">{{ sortConfig.order === 'asc' ? '▲' : '▼' }}</span>
            </th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="(stock, index) in recognizedStocks"
            :key="stock._id"
            class="border-b transition-colors hover:bg-opacity-50"
            :class="[
              isStealth
                ? 'border-slate-100 hover:bg-slate-50'
                : 'border-zinc-800/50 hover:bg-zinc-900/30',
              { 'limit-up-glory-animation': getLimitHitStatus(stock).isLimit && getLimitHitStatus(stock).isUp && !isStealth },
              { 'limit-down-table-animation': getLimitHitStatus(stock).isLimit && getLimitHitStatus(stock).isDown && !isStealth }
            ]"
          >
            <!-- 序號 -->
            <td class="px-4 py-4 font-mono text-xs opacity-50">
              {{ index + 1 }}
            </td>

            <!-- 股票代號 -->
            <td class="px-4 py-4">
              <div class="flex items-center gap-2">
                <button
                  @click="togglePin(stock.code)"
                  class="opacity-40 hover:opacity-100 transition-opacity"
                >
                  {{ pinnedList.includes(stock.code) ? '📌' : '📍' }}
                </button>
                <span
                  class="font-black text-lg tracking-tight"
                  :class="isStealth ? 'text-slate-900' : 'text-white'"
                >
                  {{ stock.code }} {{ stock.market.name }}
                </span>
              </div>
            </td>

            <!-- 新增時股價 (資料庫記錄) -->
            <td class="px-4 py-4 text-right">
              <div class="flex items-center justify-end gap-1">
                <span
                  v-if="stock.currentPrice"
                  class="font-mono text-sm"
                  :class="isStealth ? 'text-slate-600' : 'text-zinc-400'"
                >
                  {{ formatStockPrice(stock.currentPrice) }}
                </span>
                <span v-else class="text-xs opacity-40">-</span>
                <button @click="editInitialPrice(stock)" class="opacity-20 hover:opacity-100 text-xs">✎</button>
              </div>
            </td>

            <!-- 目前股價 (即時 API) -->
            <td class="px-4 py-4 text-right">
              <div
                v-if="stock.market && stock.market.currentPrice"
                class="flex flex-col items-end gap-1"
              >
                <span
                  class="font-bold text-base"
                  :class="
                    stock.market.yesterdayClose
                      ? parseFloat(stock.market.currentPrice) >
                        parseFloat(stock.market.yesterdayClose)
                        ? isStealth
                          ? 'text-slate-900 font-black'
                          : 'text-red-400'
                        : parseFloat(stock.market.currentPrice) <
                            parseFloat(stock.market.yesterdayClose)
                          ? isStealth
                            ? 'text-slate-500 font-medium'
                            : 'text-green-400'
                          : isStealth
                            ? 'text-slate-700'
                            : 'text-white'
                      : isStealth
                        ? 'text-blue-600'
                        : 'text-blue-400'
                  "
                >
                  {{ formatStockPrice(stock.market.currentPrice) }}
                </span>
                <span
                  v-if="stock.market.yesterdayClose"
                  class="text-xs font-mono"
                  :class="
                    parseFloat(stock.market.currentPrice) >
                    parseFloat(stock.market.yesterdayClose)
                      ? isStealth
                        ? 'text-slate-900 font-bold'
                        : 'text-red-400'
                      : parseFloat(stock.market.currentPrice) <
                          parseFloat(stock.market.yesterdayClose)
                        ? isStealth
                          ? 'text-slate-500'
                          : 'text-green-400'
                        : 'text-gray-500'
                  "
                >
                  {{
                    parseFloat(stock.market.currentPrice) >
                    parseFloat(stock.market.yesterdayClose)
                      ? '▲ ' +
                        (
                          ((parseFloat(stock.market.currentPrice) -
                            parseFloat(stock.market.yesterdayClose)) /
                            parseFloat(stock.market.yesterdayClose)) *
                          100
                        ).toFixed(2) +
                        '%'
                      : parseFloat(stock.market.currentPrice) <
                          parseFloat(stock.market.yesterdayClose)
                        ? '▼ ' +
                          (
                            ((parseFloat(stock.market.yesterdayClose) -
                              parseFloat(stock.market.currentPrice)) /
                              parseFloat(stock.market.yesterdayClose)) *
                            100
                          ).toFixed(2) +
                          '%'
                        : '— 0.00%'
                  }}
                </span>
              </div>
              <span v-else class="text-xs opacity-40">-</span>
            </td>
            <!-- 換股價 -->
            <td class="px-4 py-4 text-right">
              <span
                v-if="stock.swapRef"
                class="font-mono text-sm"
                :class="isStealth ? 'text-green-600' : INDICATOR_COLORS.swap.textClass"
              >
                {{ stock.swapRef }}
              </span>
              <span v-else class="text-xs opacity-40">-</span>
            </td>

            <!-- 支撐 -->
            <td class="px-4 py-4 text-right">
              <span
                v-if="stock.support"
                class="font-mono text-sm"
                :class="isStealth ? 'text-cyan-600' : INDICATOR_COLORS.support.textClass"
              >
                {{ stock.support }}
              </span>
              <span v-else class="text-xs opacity-40">-</span>
            </td>

            <!-- 短線目標 -->
            <td class="px-4 py-4 text-right">
              <span
                v-if="stock.shortTermProfit"
                class="font-mono text-sm"
                :class="isStealth ? 'text-orange-600' : INDICATOR_COLORS.shortTerm.textClass"
              >
                {{ stock.shortTermProfit }}
              </span>
              <span v-else class="text-xs opacity-40">-</span>
            </td>

            <!-- 波段目標 -->
            <td class="px-4 py-4 text-right">
              <span
                v-if="stock.waveProfit"
                class="font-mono text-sm"
                :class="isStealth ? 'text-red-600' : INDICATOR_COLORS.wave.textClass"
              >
                {{ stock.waveProfit }}
              </span>
              <span v-else class="text-xs opacity-40">-</span>
            </td>


            <!-- 狀態 (isSuccess) + 達標日期 -->
            <td class="px-4 py-3 text-center align-middle">
              <div class="flex flex-col items-center justify-center gap-1">
                <span
                  class="inline-flex items-center justify-center px-2.5 py-0.5 rounded-full text-xs font-bold shadow-sm min-w-[60px]"
                  :class="[
                    getStatusBg(stock.isSuccess, isStealth),
                    getStatusColor(stock.isSuccess, isStealth),
                    stock.isSuccess !== null && !isStealth ? 'border border-current/30' : '',
                    stock.isSuccess === null ? (isStealth ? 'bg-slate-100 text-slate-400' : 'bg-zinc-800 text-zinc-500 border border-zinc-700') : ''
                  ]"
                >
                  <template v-if="stock.isSuccess === true">✓ 成功</template>
                  <template v-else-if="stock.isSuccess === false">✗ 失敗</template>
                  <template v-else>- 待定</template>
                </span>

                <div class="h-4 flex items-center justify-center">
                  <span
                    v-if="stock.isSuccess === true && stock.successDate"
                    class="text-[10px] font-mono tracking-tight"
                    :class="getStatusColor(true, isStealth) + ' opacity-70'"
                  >
                    {{
                      new Date(stock.successDate).toLocaleDateString('zh-TW', {
                        year: 'numeric',
                        month: '2-digit',
                        day: '2-digit',
                      })
                    }}
                  </span>
                  <span
                    v-else-if="stock.isSuccess === false && stock.updatedAt"
                    class="text-[10px] font-mono tracking-tight"
                    :class="getStatusColor(false, isStealth) + ' opacity-70'"
                  >
                    {{
                      new Date(stock.updatedAt).toLocaleDateString('zh-TW', {
                        year: 'numeric',
                        month: '2-digit',
                        day: '2-digit',
                      })
                    }}
                  </span>
                </div>
              </div>
            </td>

            <!-- 傳入時間 -->
            <td class="px-4 py-4 font-mono text-xs opacity-60">
              {{
                new Date(stock.updatedAt).toLocaleString('zh-TW', {
                  month: '2-digit',
                  day: '2-digit',
                  hour: '2-digit',
                  minute: '2-digit',
                })
              }}
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <!-- 統計資訊 -->
    <div
      class="mt-6 p-6 rounded-xl border"
      :class="isStealth ? 'bg-slate-50 border-slate-200' : 'bg-zinc-900/30 border-zinc-800'"
    >
      <h3 class="text-sm font-bold mb-4 opacity-60 uppercase tracking-wide">
        {{ isStealth ? 'Statistics' : '統計摘要' }}
      </h3>
      <div class="grid grid-cols-2 md:grid-cols-5 gap-4">
        <div>
          <div class="text-xs opacity-60 mb-1">總記錄數</div>
          <div class="text-2xl font-black">{{ recognizedStocks.length }}</div>
        </div>
        <div>
          <div class="text-xs opacity-60 mb-1">有新增時股價</div>
          <div class="text-2xl font-black text-slate-500">
            {{ recognizedStocks.filter((s) => s.currentPrice).length }}
          </div>
        </div>
        <div>
          <div class="text-xs opacity-60 mb-1">有即時股價</div>
          <div class="text-2xl font-black text-blue-500">
            {{ recognizedStocks.filter((s) => s.market && s.market.currentPrice).length }}
          </div>
        </div>
        <div>
          <div class="text-xs opacity-60 mb-1">成功案例</div>
          <div class="text-2xl font-black text-red-500">
            {{ recognizedStocks.filter((s) => s.isSuccess === true).length }}
          </div>
        </div>
        <div>
          <div class="text-xs opacity-60 mb-1">待評估</div>
          <div class="text-2xl font-black text-zinc-500">
            {{ recognizedStocks.filter((s) => s.isSuccess === null).length }}
          </div>
        </div>
      </div>
    </div>

    <PriceEditModal 
      :show="isPriceModalVisible" 
      :stock="editingStock"
      :is-stealth="isStealth"
      @close="handleCloseModal" 
      @save="handleSavePrice" 
    />
  </div>
</template>
