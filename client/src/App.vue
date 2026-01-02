<script setup>
import { onMounted, onUnmounted } from 'vue'
import { storeToRefs } from 'pinia'
import ConfirmModal from './components/ConfirmModal.vue'
import { useStockStore } from '@/stores/stockStore'

const stockStore = useStockStore()
const { 
  isLoading, 
  lastUpdated, 
  isStealth,
} = storeToRefs(stockStore)

const { 
  toggleStealth, 
  triggerBot,
  startAutoRefresh,
  stopAutoRefresh,
} = stockStore

// --- Lifecycle ---
onMounted(() => {
  startAutoRefresh()
})

onUnmounted(() => {
  stopAutoRefresh()
})
</script>

<template>
  <div
    class="min-h-screen transition-colors duration-500 font-sans pb-20 selection:bg-blue-500/30"
    :class="isStealth ? 'bg-slate-50 text-slate-700' : 'bg-[#0f0f0f] text-gray-100'"
  >
    <div class="max-w-7xl mx-auto p-4 md:p-8">
      <header
        class="flex flex-col md:flex-row justify-between items-center border-b pb-6 mb-8 gap-4"
        :class="isStealth ? 'border-gray-200' : 'border-zinc-800'"
      >
        <div class="flex items-center gap-4">
          <h1 class="text-2xl font-black tracking-tight italic">
            {{ isStealth ? 'Core_System_Report' : '🚀 2026 財富自由戰情室' }}
          </h1>
          <button
            v-if="!isStealth"
            @click="triggerBot"
            class="px-2 py-1 rounded text-[10px] border border-zinc-700 text-zinc-500 hover:border-blue-500 hover:text-blue-400 transition-all uppercase tracking-tighter"
          >
            Run Bot Test
          </button>
        </div>

        <div class="flex items-center gap-6">
          <div class="flex flex-col items-end">
            <div
              class="flex items-center gap-2 text-[10px] font-mono opacity-50 uppercase tracking-widest"
            >
              <span
                class="w-1.5 h-1.5 rounded-full bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.6)]"
              ></span>
              Live Syncing
            </div>
            <span class="text-xs font-mono opacity-70">{{ lastUpdated }}</span>
          </div>

          <button
            @click="toggleStealth"
            class="px-5 py-2 rounded-full text-xs font-bold border transition-all hover:scale-105 active:scale-95 shadow-sm"
            :class="
              isStealth
                ? 'border-slate-300 text-slate-500 bg-white hover:bg-slate-100'
                : 'border-zinc-700 text-zinc-400 hover:border-blue-500 hover:text-blue-400 bg-zinc-900/50'
            "
          >
            {{ isStealth ? '🏢 OFFICE MODE' : '🚀 TRADER MODE' }}
          </button>
        </div>
      </header>

      <!-- Tab Navigation -->
      <div class="mb-8 flex flex-col md:flex-row justify-between items-center border-b gap-4" :class="isStealth ? 'border-slate-200' : 'border-zinc-800'">
        <div class="flex">
          <router-link
            to="/dashboard"
            class="px-6 py-3 text-sm font-bold tracking-wider uppercase transition-all whitespace-nowrap border-b-2"
            :class="[
              $route.path.startsWith('/dashboard')
                ? (isStealth ? 'text-blue-600 border-blue-600' : 'text-blue-400 border-blue-400')
                : (isStealth ? 'text-slate-500 border-transparent hover:bg-slate-100' : 'text-zinc-500 border-transparent hover:bg-zinc-800/50'),
            ]"
          >
            戰情室
          </router-link>
          <router-link
            to="/results"
            class="px-6 py-3 text-sm font-bold tracking-wider uppercase transition-all whitespace-nowrap border-b-2"
            :class="[
              $route.path.startsWith('/results')
                ? (isStealth ? 'text-blue-600 border-blue-600' : 'text-blue-400 border-blue-400')
                : (isStealth ? 'text-slate-500 border-transparent hover:bg-slate-100' : 'text-zinc-500 border-transparent hover:bg-zinc-800/50'),
            ]"
          >
            戰果榜
          </router-link>
        </div>
      </div>

      <!-- Tab Content -->
      <main>
        <router-view v-slot="{ Component }">
          <transition 
            name="fade" 
            mode="out-in"
          >
            <component :is="Component" />
          </transition>
        </router-view>
      </main>
    </div>
    <ConfirmModal :is-stealth="isStealth" />
  </div>
</template>

<style>
.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.2s ease;
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}
</style>
