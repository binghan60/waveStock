<script setup>
defineProps(['isStealth'])
</script>

<template>
  <div
    class="rounded-xl p-4 border animate-pulse"
    :class="isStealth ? 'bg-white border-gray-200' : 'bg-zinc-900 border-zinc-800'"
  >
    <!-- Badge -->
    <div class="absolute -top-2 -right-2 h-4 w-12 rounded" :class="isStealth ? 'bg-slate-100' : 'bg-zinc-800'" />

    <!-- Header -->
    <div class="flex justify-between items-start mb-2">
      <div class="flex items-center gap-2">
        <div class="h-8 w-20 rounded" :class="isStealth ? 'bg-slate-200' : 'bg-zinc-800'" />
        <div class="h-4 w-4 rounded-full" :class="isStealth ? 'bg-slate-100' : 'bg-zinc-800'" />
        <div class="h-3 w-14 rounded" :class="isStealth ? 'bg-slate-100' : 'bg-zinc-800/50'" />
      </div>
      <div class="h-5 w-5 rounded" :class="isStealth ? 'bg-slate-100' : 'bg-zinc-800'" />
    </div>

    <!-- Market Data -->
    <div class="space-y-2 mb-3 pb-3 border-b" :class="isStealth ? 'border-gray-200' : 'border-zinc-700'">
      <div class="flex items-end gap-3">
        <div class="h-10 w-28 rounded" :class="isStealth ? 'bg-slate-200' : 'bg-zinc-800'" />
        <div class="flex flex-col gap-1 mb-1">
          <div class="h-3 w-12 rounded" :class="isStealth ? 'bg-slate-100' : 'bg-zinc-800/50'" />
          <div class="h-3 w-10 rounded" :class="isStealth ? 'bg-slate-100' : 'bg-zinc-800/50'" />
        </div>
      </div>
      <div class="flex justify-between">
        <div class="flex flex-col gap-1">
          <div class="h-2 w-8 rounded" :class="isStealth ? 'bg-slate-100' : 'bg-zinc-800/50'" />
          <div class="h-3 w-14 rounded" :class="isStealth ? 'bg-slate-200' : 'bg-zinc-800'" />
        </div>
        <div class="flex flex-col items-end gap-1">
          <div class="h-2 w-6 rounded" :class="isStealth ? 'bg-slate-100' : 'bg-zinc-800/50'" />
          <div class="h-3 w-16 rounded" :class="isStealth ? 'bg-slate-200' : 'bg-zinc-800'" />
        </div>
      </div>
    </div>

    <!-- Price Chart Placeholder -->
    <div class="mb-3">
      <div class="h-2 w-16 rounded mb-2" :class="isStealth ? 'bg-slate-100' : 'bg-zinc-800/50'" />
      <div class="h-16 rounded-lg" :class="isStealth ? 'bg-slate-100' : 'bg-zinc-800/30'" />
    </div>

    <!-- Indicator Grid -->
    <div class="grid grid-cols-2 gap-2 mt-3">
      <div
        v-for="i in 4" :key="i"
        class="h-16 rounded-xl"
        :class="isStealth ? 'bg-slate-100' : 'bg-white/5'"
      />
    </div>

    <!-- Timestamp -->
    <div class="mt-3 pt-2 border-t" :class="isStealth ? 'border-gray-100' : 'border-zinc-700/50'">
      <div class="h-3 w-24 rounded" :class="isStealth ? 'bg-slate-100' : 'bg-zinc-800/50'" />
    </div>
  </div>
</template>
