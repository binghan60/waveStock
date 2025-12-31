<script setup>
defineProps(['isStealth'])
</script>

<template>
  <div
    class="rounded-xl p-5 border animate-pulse"
    :class="
      isStealth
        ? 'bg-white border-gray-200'
        : 'bg-zinc-900 border-zinc-800'
    "
  >
    <!-- Header -->
    <div class="flex justify-between items-start mb-3">
      <div>
        <div class="flex items-baseline gap-2">
          <!-- Symbol Placeholder -->
          <div class="h-8 w-20 rounded" :class="isStealth ? 'bg-slate-200' : 'bg-zinc-800'"></div>
          <!-- Market Name Placeholder -->
          <div class="h-4 w-12 rounded" :class="isStealth ? 'bg-slate-100' : 'bg-zinc-800/50'"></div>
        </div>
      </div>
      <div class="flex gap-1">
        <!-- Pin Button Placeholder -->
        <div class="h-6 w-6 rounded-full" :class="isStealth ? 'bg-slate-100' : 'bg-zinc-800'"></div>
      </div>
    </div>

    <!-- Content -->
    <div class="space-y-3">
      <div class="flex items-end gap-3">
        <!-- Price Placeholder -->
        <div class="h-10 w-32 rounded" :class="isStealth ? 'bg-slate-200' : 'bg-zinc-800'"></div>
        <!-- Diff/Percent Placeholder -->
        <div class="flex flex-col gap-1">
          <div class="h-3 w-12 rounded" :class="isStealth ? 'bg-slate-100' : 'bg-zinc-800/50'"></div>
          <div class="h-3 w-10 rounded" :class="isStealth ? 'bg-slate-100' : 'bg-zinc-800/50'"></div>
        </div>
      </div>

      <!-- Footer -->
      <div
        class="flex justify-between items-center pt-3 border-t"
        :class="isStealth ? 'border-gray-100' : 'border-zinc-800'"
      >
        <div class="flex flex-col gap-1">
          <div class="h-2 w-8 rounded" :class="isStealth ? 'bg-slate-100' : 'bg-zinc-800/50'"></div>
          <div class="h-3 w-14 rounded" :class="isStealth ? 'bg-slate-200' : 'bg-zinc-800'"></div>
        </div>
        <div class="flex flex-col items-end gap-1">
          <div class="h-2 w-8 rounded" :class="isStealth ? 'bg-slate-100' : 'bg-zinc-800/50'"></div>
          <div class="h-3 w-16 rounded" :class="isStealth ? 'bg-slate-200' : 'bg-zinc-800'"></div>
        </div>
      </div>
    </div>
  </div>
</template>
