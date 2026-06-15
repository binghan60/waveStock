import { createRouter, createWebHistory } from 'vue-router'
import DashboardView from '../views/DashboardView.vue'
import ResultsView from '../views/ResultsView.vue'
import BacktestView from '../views/BacktestView.vue'
import TradeJournalView from '../views/TradeJournalView.vue'

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    {
      path: '/',
      redirect: '/dashboard'
    },
    {
      path: '/dashboard',
      name: 'dashboard',
      component: DashboardView
    },
    {
      path: '/results',
      name: 'results',
      component: ResultsView
    },
    {
      path: '/backtest',
      name: 'backtest',
      component: BacktestView
    },
    {
      path: '/trade-journal',
      name: 'trade-journal',
      component: TradeJournalView
    }
  ],
})

export default router
