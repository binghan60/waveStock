<script setup>
import { computed, onMounted, ref } from 'vue'
import { storeToRefs } from 'pinia'
import { Check, Loader2, RefreshCw, Send, X } from 'lucide-vue-next'
import api from '@/services/api'
import { useStockStore } from '@/stores/stockStore'

const stockStore = useStockStore()
const { isStealth } = storeToRefs(stockStore)

const intents = ref([])
const isLoading = ref(false)
const actionId = ref('')
const error = ref('')
const draftText = ref('')

const panelClass = computed(() => isStealth.value
  ? 'bg-white border-slate-200 shadow-sm'
  : 'bg-zinc-900/40 border-zinc-800')

const statusTone = (status) => {
  if (status === 'pending_confirm') return isStealth.value ? 'bg-blue-50 text-blue-700' : 'bg-blue-500/15 text-blue-300'
  if (status === 'submitted') return isStealth.value ? 'bg-emerald-50 text-emerald-700' : 'bg-emerald-500/15 text-emerald-300'
  if (status === 'failed') return isStealth.value ? 'bg-red-50 text-red-700' : 'bg-red-500/15 text-red-300'
  if (status === 'rejected' || status === 'cancelled') return isStealth.value ? 'bg-slate-100 text-slate-500' : 'bg-zinc-800 text-zinc-400'
  return isStealth.value ? 'bg-slate-100 text-slate-700' : 'bg-zinc-800 text-zinc-300'
}

const formatDateTime = (value) => {
  if (!value) return '-'
  return new Intl.DateTimeFormat('zh-TW', {
    timeZone: 'Asia/Taipei',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(new Date(value))
}

const formatNumber = (value) => {
  if (value === null || value === undefined || Number.isNaN(Number(value))) return '-'
  return Number(value).toLocaleString('zh-TW', { maximumFractionDigits: 2 })
}

const loadIntents = async () => {
  isLoading.value = true
  error.value = ''
  try {
    const { data } = await api.getOrderIntents({ limit: 100, status: 'all' })
    intents.value = data
  } catch (err) {
    error.value = err.response?.data?.error || err.message
  } finally {
    isLoading.value = false
  }
}

const createFromDraft = async () => {
  if (!draftText.value.trim()) return
  actionId.value = 'draft'
  error.value = ''
  try {
    await api.createOrderIntentsFromMessage({ text: draftText.value, senderName: '?(??)' })
    draftText.value = ''
    await loadIntents()
  } catch (err) {
    error.value = err.response?.data?.error || err.message
  } finally {
    actionId.value = ''
  }
}

const confirmIntent = async (intent) => {
  actionId.value = intent._id
  error.value = ''
  try {
    await api.confirmOrderIntent(intent._id)
    await loadIntents()
  } catch (err) {
    error.value = err.response?.data?.error || err.message
  } finally {
    actionId.value = ''
  }
}

const rejectIntent = async (intent) => {
  actionId.value = intent._id
  error.value = ''
  try {
    await api.rejectOrderIntent(intent._id)
    await loadIntents()
  } catch (err) {
    error.value = err.response?.data?.error || err.message
  } finally {
    actionId.value = ''
  }
}

onMounted(loadIntents)
</script>

<template>
  <section class="space-y-5">
    <div class="flex flex-col md:flex-row md:items-end justify-between gap-4">
      <div>
        <h2 class="text-xl font-black tracking-tight">跟單確認</h2>
        <p class="text-sm opacity-60 mt-1">確認解析後的老師訊號，確認後才送到 broker service。</p>
      </div>
      <button
        class="inline-flex items-center justify-center gap-2 px-4 py-2 rounded-md text-sm font-bold border transition-colors"
        :class="isStealth ? 'bg-white border-slate-300 hover:bg-slate-50' : 'bg-zinc-900 border-zinc-700 hover:bg-zinc-800'"
        @click="loadIntents"
        :disabled="isLoading"
      >
        <Loader2 v-if="isLoading" class="w-4 h-4 animate-spin" />
        <RefreshCw v-else class="w-4 h-4" />
        重新整理
      </button>
    </div>

    <div class="border rounded-lg p-4" :class="panelClass">
      <div class="text-xs font-black uppercase tracking-widest opacity-50 mb-2">手動訊號測試</div>
      <div class="grid md:grid-cols-[1fr_auto] gap-3">
        <textarea
          v-model="draftText"
          rows="3"
          class="w-full rounded-md border px-3 py-2 text-sm outline-none resize-none"
          :class="isStealth ? 'bg-white border-slate-200' : 'bg-zinc-950 border-zinc-800'"
          placeholder="貼上老師訊息"
        />
        <button
          class="inline-flex items-center justify-center gap-2 px-4 py-2 rounded-md text-sm font-bold border transition-colors min-w-32"
          :class="isStealth ? 'bg-slate-900 text-white border-slate-900 hover:bg-slate-700' : 'bg-blue-500 text-white border-blue-400 hover:bg-blue-400'"
          @click="createFromDraft"
          :disabled="actionId === 'draft'"
        >
          <Loader2 v-if="actionId === 'draft'" class="w-4 h-4 animate-spin" />
          <Send v-else class="w-4 h-4" />
          解析
        </button>
      </div>
    </div>

    <div v-if="error" class="border rounded-md px-4 py-3 text-sm" :class="isStealth ? 'border-red-200 bg-red-50 text-red-700' : 'border-red-500/30 bg-red-500/10 text-red-300'">
      {{ error }}
    </div>

    <div class="overflow-hidden border rounded-lg" :class="panelClass">
      <table class="w-full text-sm">
        <thead :class="isStealth ? 'bg-slate-50 text-slate-500' : 'bg-zinc-950/60 text-zinc-500'">
          <tr>
            <th class="px-4 py-3 text-left font-black">訊號</th>
            <th class="px-4 py-3 text-left font-black">建議委託</th>
            <th class="px-4 py-3 text-left font-black">狀態</th>
            <th class="px-4 py-3 text-right font-black">操作</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="intent in intents" :key="intent._id" class="border-t" :class="isStealth ? 'border-slate-100' : 'border-zinc-800'">
            <td class="px-4 py-4 align-top">
              <div class="font-black">{{ intent.name }}({{ intent.code }})</div>
              <div class="text-xs opacity-50 mt-1">{{ formatDateTime(intent.occurredAt) }}</div>
              <div class="text-xs opacity-50 mt-1">{{ intent.tradeType }}</div>
            </td>
            <td class="px-4 py-4 align-top">
              <div class="font-bold">{{ intent.action }} {{ formatNumber(intent.suggestedQuantity) }} 股</div>
              <div class="text-xs opacity-50 mt-1">參考價 {{ formatNumber(intent.referencePrice) }} / {{ intent.is市價Order ? '市價' : '未指定' }}</div>
              <div v-if="intent.warnings?.length" class="text-xs mt-2" :class="isStealth ? 'text-amber-700' : 'text-amber-300'">
                {{ intent.warnings.join(', ') }}
              </div>
            </td>
            <td class="px-4 py-4 align-top">
              <span class="inline-flex px-2 py-1 rounded-full text-xs font-black" :class="statusTone(intent.status)">{{ intent.status }}</span>
              <div v-if="intent.brokerMessage" class="text-xs opacity-50 mt-2 max-w-xs">{{ intent.brokerMessage }}</div>
            </td>
            <td class="px-4 py-4 align-top text-right">
              <div v-if="intent.status === 'pending_confirm'" class="inline-flex gap-2">
                <button
                  class="inline-flex items-center gap-1 px-3 py-2 rounded-md text-xs font-black border transition-colors"
                  :class="isStealth ? 'bg-slate-900 text-white border-slate-900 hover:bg-slate-700' : 'bg-blue-500 text-white border-blue-400 hover:bg-blue-400'"
                  @click="confirmIntent(intent)"
                  :disabled="actionId === intent._id"
                >
                  <Loader2 v-if="actionId === intent._id" class="w-3.5 h-3.5 animate-spin" />
                  <Check v-else class="w-3.5 h-3.5" />
                  確認
                </button>
                <button
                  class="inline-flex items-center gap-1 px-3 py-2 rounded-md text-xs font-black border transition-colors"
                  :class="isStealth ? 'bg-white border-slate-300 hover:bg-slate-50' : 'bg-zinc-900 border-zinc-700 hover:bg-zinc-800'"
                  @click="rejectIntent(intent)"
                  :disabled="actionId === intent._id"
                >
                  <X class="w-3.5 h-3.5" />
                  拒絕
                </button>
              </div>
              <span v-else class="text-xs opacity-40">無可用操作</span>
            </td>
          </tr>
          <tr v-if="!isLoading && intents.length === 0">
            <td colspan="4" class="px-4 py-10 text-center text-sm opacity-50">目前沒有跟單確認單。</td>
          </tr>
        </tbody>
      </table>
    </div>
  </section>
</template>
