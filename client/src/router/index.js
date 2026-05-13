import { createRouter, createWebHistory } from 'vue-router'
import DashboardView from '../views/DashboardView.vue'
import ResultsView from '../views/ResultsView.vue'
import BacktestView from '../views/BacktestView.vue'

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
    }
  ],
})

export default router
