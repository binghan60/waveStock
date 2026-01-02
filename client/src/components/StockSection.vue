<script setup>
import StockCard from './StockCard.vue'
import StockCardSkeleton from './StockCardSkeleton.vue'

const props = defineProps({
  title: String,
  stealthTitle: String,
  count: Number,
  stocks: Array,
  isLoading: Boolean,
  isStealth: Boolean,
  emptyMessage: {
    type: String,
    default: 'No records found.'
  },
  gridCols: {
    type: String,
    default: 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3'
  },
  badgeClass: String,
  showIfEmpty: {
    type: Boolean,
    default: true
  },
  allowDelete: {
    type: Boolean,
    default: true
  }
})

defineEmits(['remove', 'togglePin'])
</script>

<template>
  <section v-if="showIfEmpty || stocks.length > 0 || isLoading" class="mb-14">
    <!-- Header -->
    <div class="flex items-center justify-between mb-6 pl-1">
      <div class="flex items-center gap-3">
        <h2 class="text-xl font-bold tracking-tight">
          {{ isStealth ? stealthTitle : title }}
        </h2>
        <span
          class="px-2 py-0.5 rounded text-[10px] font-mono font-bold"
          :class="[
            badgeClass || (isStealth ? 'bg-slate-200 text-slate-500' : 'bg-blue-500/10 text-blue-400 border border-blue-500/20')
          ]"
        >
          {{ isStealth ? 'COUNT' : '數量' }}: {{ count }}
        </span>
      </div>
      <!-- Right slot for extra actions like "Run Bot Test" -->
      <slot name="actions"></slot>
    </div>

    <!-- Skeletons -->
    <div v-if="isLoading && stocks.length === 0" :class="['grid gap-6', gridCols]">
      <StockCardSkeleton v-for="i in 3" :key="i" :is-stealth="isStealth" />
    </div>

    <!-- Empty State -->
    <div
      v-else-if="stocks.length === 0"
      class="py-12 text-center border-2 border-dashed rounded-2xl transition-colors"
      :class="isStealth ? 'border-slate-200 text-slate-400' : 'border-zinc-800 text-zinc-600'"
    >
      <p class="text-sm font-medium">{{ emptyMessage }}</p>
    </div>

    <!-- Grid List -->
    <div v-else :class="['grid gap-6', gridCols]">
      <StockCard
        v-for="item in stocks"
        :key="item._id || item.id"
        :item="item"
        :is-stealth="isStealth"
        :allow-delete="allowDelete && item.listType !== 'recognized'"
        @remove="$emit('remove', item)"
        @togglePin="$emit('togglePin', $event)"
      />
    </div>
  </section>
</template>
