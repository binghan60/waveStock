<script setup>
import { computed, onMounted, ref } from 'vue'
import { storeToRefs } from 'pinia'
import { Check, Loader2, RefreshCw, Send, Trash2, X } from 'lucide-vue-next'
import api from '@/services/api'
import { useStockStore } from '@/stores/stockStore'

const TEXT = {
  title: '\u8ddf\u55ae\u78ba\u8a8d',
  subtitle: '\u89e3\u6790\u8a0a\u865f\u5f8c\u5148\u5efa\u7acb\u78ba\u8a8d\u55ae\uff0c\u6309\u4e0b\u78ba\u8a8d\u624d\u6703\u9001\u5230 broker service\u3002',
  refresh: '\u91cd\u65b0\u6574\u7406',
  manualTitle: '\u624b\u52d5\u8cbc\u4e0a\u8a0a\u865f',
  pastePlaceholder: '\u8cbc\u4e0a\u8001\u5e2b\u7684\u4ea4\u6613\u8a0a\u865f',
  parse: '\u89e3\u6790',
  signal: '\u8a0a\u865f',
  order: '\u5efa\u8b70\u59d4\u8a17',
  status: '\u72c0\u614b',
  actions: '\u64cd\u4f5c',
  shares: '\u80a1',
  refPrice: '\u53c3\u8003\u50f9',
  market: '\u5e02\u50f9',
  limit: '\u9650\u50f9',
  confirm: '\u78ba\u8a8d',
  reject: '\u53d6\u6d88',
  delete: '\u522a\u9664',
  locked: '\u5df2\u8655\u7406',
  empty: '\u76ee\u524d\u6c92\u6709\u8ddf\u55ae\u78ba\u8a8d\u55ae\u3002',
  buy: '\u8cb7\u9032',
  sell: '\u8ce3\u51fa',
}

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

const actionLabel = (action) => action === 'buy' ? TEXT.buy : TEXT.sell

const canDelete = (intent) => ['pending_confirm', 'rejected', 'failed', 'cancelled'].includes(intent.status)

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
    await api.createOrderIntentsFromMessage({ text: draftText.value, senderName: '\u7db8(\u83c1\u82f1)' })
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

const deleteIntent = async (intent) => {
  actionId.value = `delete:${intent._id}`
  error.value = ''
  try {
    await api.deleteOrderIntent(intent._id)
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
    <div class="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
      <div>
        <h2 class="text-xl font-black tracking-tight">{{ TEXT.title }}</h2>
        <p class="mt-1 text-sm opacity-60">{{ TEXT.subtitle }}</p>
      </div>
      <button
        class="inline-flex items-center justify-center gap-2 rounded-md border px-4 py-2 text-sm font-bold transition-colors"
        :class="isStealth ? 'bg-white border-slate-300 hover:bg-slate-50' : 'bg-zinc-900 border-zinc-700 hover:bg-zinc-800'"
        :disabled="isLoading"
        @click="loadIntents"
      >
        <Loader2 v-if="isLoading" class="h-4 w-4 animate-spin" />
        <RefreshCw v-else class="h-4 w-4" />
        {{ TEXT.refresh }}
      </button>
    </div>

    <div class="rounded-lg border p-4" :class="panelClass">
      <div class="mb-2 text-xs font-black uppercase tracking-widest opacity-50">{{ TEXT.manualTitle }}</div>
      <div class="grid gap-3 md:grid-cols-[1fr_auto]">
        <textarea
          v-model="draftText"
          rows="3"
          class="w-full resize-none rounded-md border px-3 py-2 text-sm outline-none"
          :class="isStealth ? 'bg-white border-slate-200' : 'bg-zinc-950 border-zinc-800'"
          :placeholder="TEXT.pastePlaceholder"
        />
        <button
          class="inline-flex min-w-32 items-center justify-center gap-2 rounded-md border px-4 py-2 text-sm font-bold transition-colors"
          :class="isStealth ? 'bg-slate-900 text-white border-slate-900 hover:bg-slate-700' : 'bg-blue-500 text-white border-blue-400 hover:bg-blue-400'"
          :disabled="actionId === 'draft'"
          @click="createFromDraft"
        >
          <Loader2 v-if="actionId === 'draft'" class="h-4 w-4 animate-spin" />
          <Send v-else class="h-4 w-4" />
          {{ TEXT.parse }}
        </button>
      </div>
    </div>

    <div
      v-if="error"
      class="rounded-md border px-4 py-3 text-sm"
      :class="isStealth ? 'border-red-200 bg-red-50 text-red-700' : 'border-red-500/30 bg-red-500/10 text-red-300'"
    >
      {{ error }}
    </div>

    <div class="overflow-hidden rounded-lg border" :class="panelClass">
      <table class="w-full text-sm">
        <thead :class="isStealth ? 'bg-slate-50 text-slate-500' : 'bg-zinc-950/60 text-zinc-500'">
          <tr>
            <th class="px-4 py-3 text-left font-black">{{ TEXT.signal }}</th>
            <th class="px-4 py-3 text-left font-black">{{ TEXT.order }}</th>
            <th class="px-4 py-3 text-left font-black">{{ TEXT.status }}</th>
            <th class="px-4 py-3 text-right font-black">{{ TEXT.actions }}</th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="intent in intents"
            :key="intent._id"
            class="border-t"
            :class="isStealth ? 'border-slate-100' : 'border-zinc-800'"
          >
            <td class="px-4 py-4 align-top">
              <div class="font-black">{{ intent.name }}({{ intent.code }})</div>
              <div class="mt-1 text-xs opacity-50">{{ formatDateTime(intent.occurredAt) }}</div>
              <div class="mt-1 text-xs opacity-50">{{ intent.tradeType }}</div>
            </td>
            <td class="px-4 py-4 align-top">
              <div class="font-bold">{{ actionLabel(intent.action) }} {{ formatNumber(intent.suggestedQuantity) }} {{ TEXT.shares }}</div>
              <div class="mt-1 text-xs opacity-50">
                {{ TEXT.refPrice }} {{ formatNumber(intent.referencePrice) }} / {{ intent.isMarketOrder ? TEXT.market : TEXT.limit }}
              </div>
              <div
                v-if="intent.warnings?.length"
                class="mt-2 text-xs"
                :class="isStealth ? 'text-amber-700' : 'text-amber-300'"
              >
                {{ intent.warnings.join(', ') }}
              </div>
            </td>
            <td class="px-4 py-4 align-top">
              <span class="inline-flex rounded-full px-2 py-1 text-xs font-black" :class="statusTone(intent.status)">
                {{ intent.status }}
              </span>
              <div v-if="intent.brokerMessage" class="mt-2 max-w-xs text-xs opacity-50">{{ intent.brokerMessage }}</div>
            </td>
            <td class="px-4 py-4 text-right align-top">
              <div class="inline-flex flex-wrap justify-end gap-2">
                <template v-if="intent.status === 'pending_confirm'">
                  <button
                    class="inline-flex items-center gap-1 rounded-md border px-3 py-2 text-xs font-black transition-colors"
                    :class="isStealth ? 'bg-slate-900 text-white border-slate-900 hover:bg-slate-700' : 'bg-blue-500 text-white border-blue-400 hover:bg-blue-400'"
                    :disabled="actionId === intent._id"
                    @click="confirmIntent(intent)"
                  >
                    <Loader2 v-if="actionId === intent._id" class="h-3.5 w-3.5 animate-spin" />
                    <Check v-else class="h-3.5 w-3.5" />
                    {{ TEXT.confirm }}
                  </button>
                  <button
                    class="inline-flex items-center gap-1 rounded-md border px-3 py-2 text-xs font-black transition-colors"
                    :class="isStealth ? 'bg-white border-slate-300 hover:bg-slate-50' : 'bg-zinc-900 border-zinc-700 hover:bg-zinc-800'"
                    :disabled="actionId === intent._id"
                    @click="rejectIntent(intent)"
                  >
                    <X class="h-3.5 w-3.5" />
                    {{ TEXT.reject }}
                  </button>
                </template>
                <button
                  v-if="canDelete(intent)"
                  class="inline-flex items-center gap-1 rounded-md border px-3 py-2 text-xs font-black transition-colors"
                  :class="isStealth ? 'bg-white border-red-200 text-red-700 hover:bg-red-50' : 'bg-red-500/10 border-red-500/30 text-red-300 hover:bg-red-500/20'"
                  :disabled="actionId === `delete:${intent._id}`"
                  @click="deleteIntent(intent)"
                >
                  <Loader2 v-if="actionId === `delete:${intent._id}`" class="h-3.5 w-3.5 animate-spin" />
                  <Trash2 v-else class="h-3.5 w-3.5" />
                  {{ TEXT.delete }}
                </button>
                <span v-if="!canDelete(intent) && intent.status !== 'pending_confirm'" class="py-2 text-xs opacity-40">
                  {{ TEXT.locked }}
                </span>
              </div>
            </td>
          </tr>
          <tr v-if="!isLoading && intents.length === 0">
            <td colspan="4" class="px-4 py-10 text-center text-sm opacity-50">{{ TEXT.empty }}</td>
          </tr>
        </tbody>
      </table>
    </div>
  </section>
</template>
