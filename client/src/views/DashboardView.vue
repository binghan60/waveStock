<script setup>
import { ref } from 'vue'
import { storeToRefs } from 'pinia'
import StockSection from '@/components/StockSection.vue'
import { useStockStore } from '@/stores/stockStore'

const stockStore = useStockStore()
const { 
  pinnedStocks, 
  unpinnedManualStocks: unpinnedStocks, 
  unpinnedRecognizedStocks, 
  isLoading, 
  isStealth 
} = storeToRefs(stockStore)

const { 
  addStock, 
  removeStock, 
  removeRecognizedStock, 
  togglePin, 
  triggerBot 
} = stockStore

// UI Input
const inputSymbol = ref('')

const handleAddStock = async () => {
  if (!inputSymbol.value) return
  await addStock(inputSymbol.value)
  inputSymbol.value = ''
}

const handleRemoveItem = (item) => {
  if (item.listType === 'manual') {
    removeStock(item.id || item._id)
  } else {
    removeRecognizedStock(item._id)
  }
}
</script>

<template>
  <div>
    <!-- Quick Add Section -->
    <div class="mb-8 flex justify-end">
      <div class="flex gap-2">
        <div class="relative w-48 md:w-64">
          <input
            v-model="inputSymbol"
            @keyup.enter="handleAddStock"
            :placeholder="isStealth ? 'Symbol...' : '快速加入代號'"
            class="w-full px-3 py-1.5 text-sm rounded-lg border outline-none transition-all"
            :class="
              isStealth
                ? 'bg-white border-slate-200 focus:border-blue-400 focus:ring-2 focus:ring-blue-100'
                : 'bg-zinc-900 border-zinc-800 text-white focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20'
            "
          />
        </div>
        <button
          @click="handleAddStock"
          :disabled="isLoading"
          class="px-4 py-1.5 rounded-lg text-xs font-bold transition-all active:scale-95 disabled:opacity-50"
          :class="
            isStealth
              ? 'bg-slate-700 text-white hover:bg-slate-800'
              : 'bg-blue-600 text-white hover:bg-blue-500 shadow-lg shadow-blue-500/20'
          "
        >
          {{ isLoading ? '...' : 'ADD' }}
        </button>
      </div>
    </div>

    <!-- 置頂區域 -->
    <StockSection
      title="📌 置頂監控"
      stealthTitle="PINNED_WATCHLIST"
      :stocks="pinnedStocks"
      :count="pinnedStocks.length"
      :is-loading="isLoading"
      :is-stealth="isStealth"
      :show-if-empty="false"
      badge-class="bg-yellow-500/10 text-yellow-400 border border-yellow-500/20"
      @remove="handleRemoveItem"
      @togglePin="togglePin"
    />

    <!-- 圖片辨識區域 -->
    <StockSection
      title="圖片辨識分析"
      stealthTitle="AI_ANALYTICS_DATA"
      :stocks="unpinnedRecognizedStocks"
      :count="unpinnedRecognizedStocks.length"
      :is-loading="isLoading"
      :is-stealth="isStealth"
      :allow-delete="false"
      badge-class="bg-green-500/10 text-green-400 border border-green-500/20"
      @remove="handleRemoveItem"
      @togglePin="togglePin"
    >
      <template #actions v-if="!isStealth">
        <button
          @click="triggerBot"
          class="px-2 py-1 rounded text-[10px] border border-zinc-700 text-zinc-500 hover:border-blue-500 hover:text-blue-400 transition-all uppercase tracking-tighter"
        >
          Run Bot Test
        </button>
      </template>
    </StockSection>

    <!-- 個人自選區域 -->
    <StockSection
      title="個人自選清單"
      stealthTitle="USER_WATCHLIST_LOCAL"
      :stocks="unpinnedStocks"
      :count="unpinnedStocks.length"
      :is-loading="isLoading"
      :is-stealth="isStealth"
      grid-cols="grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4"
      empty-message="Watchlist is empty."
      @remove="handleRemoveItem"
      @togglePin="togglePin"
    />
  </div>
</template>
