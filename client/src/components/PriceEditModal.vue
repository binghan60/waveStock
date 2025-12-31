<script setup>
import { ref, watch, nextTick } from 'vue'

const props = defineProps({
  show: Boolean,
  stock: Object,
  isStealth: Boolean
})

const emit = defineEmits(['close', 'save'])

const newPrice = ref('')
const inputRef = ref(null)

watch(() => props.show, (newVal) => {
  if (newVal) {
    newPrice.value = props.stock?.currentPrice || ''
    // 當 Modal 顯示時，自動 focus 到 input
    nextTick(() => {
      inputRef.value?.focus()
    })
  }
})

const save = () => {
  const price = parseFloat(newPrice.value)
  if (!isNaN(price) && price > 0) {
    emit('save', price.toString())
  } else {
    alert('請輸入有效的價格')
  }
}

const closeModal = () => {
  emit('close')
}
</script>

<template>
  <div
    v-if="show"
    class="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 transition-opacity"
    @click.self="closeModal"
  >
    <div
      class="rounded-xl border p-5 w-full max-w-sm m-4 transform transition-all"
      :class="
        isStealth
          ? 'bg-white border-gray-200 shadow-xl'
          : 'bg-zinc-900 border-zinc-800 hover:border-zinc-700'
      "
    >
      <header class="mb-5">
        <h3 class="text-lg font-bold" :class="isStealth ? 'text-slate-800' : 'text-white'">
          修改新增時股價
        </h3>
        <p v-if="stock" class="text-sm" :class="isStealth ? 'text-slate-500' : 'text-zinc-400'">
          {{ stock.code }} - {{ stock.market?.name }}
        </p>
      </header>

      <main class="mb-6">
        <label
          class="block text-xs font-bold mb-2"
          :class="isStealth ? 'text-slate-600' : 'text-zinc-400'"
          for="price-input"
        >
          新價格
        </label>
        <input
          id="price-input"
          ref="inputRef"
          v-model="newPrice"
          type="number"
          step="0.01"
          placeholder="請輸入價格"
          class="w-full px-3 py-2 rounded-lg border-2 outline-none transition-all text-lg font-mono"
          :class="
            isStealth
              ? 'bg-slate-50 border-slate-200 focus:border-purple-500 focus:ring-2 focus:ring-purple-500/20'
              : 'bg-zinc-800 border-zinc-700 text-white focus:border-purple-500 focus:ring-2 focus:ring-purple-500/20'
          "
          @keyup.enter="save"
          @keyup.esc="closeModal"
        />
      </main>

      <footer class="flex justify-end gap-3">
        <button
          @click="closeModal"
          class="px-5 py-2 rounded-lg font-bold text-sm transition-colors"
          :class="
            isStealth
              ? 'text-slate-600 bg-slate-100 hover:bg-slate-200'
              : 'text-zinc-400 bg-transparent hover:bg-zinc-800 hover:text-zinc-100'
          "
        >
          取消
        </button>
        <button
          @click="save"
          class="px-5 py-2 rounded-lg font-bold text-sm text-white transition-colors"
          :class="
            isStealth
              ? 'bg-purple-600 hover:bg-purple-700'
              : 'bg-purple-600 hover:bg-purple-500'
          "
        >
          儲存
        </button>
      </footer>
    </div>
  </div>
</template>
