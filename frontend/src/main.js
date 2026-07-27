import { createApp } from 'vue'
import App from './App.vue'
import TlGrid from './components/TlGrid.vue'
import { router, routeToTab, tabToPath } from './router'
import { setTabNavigator, enterTab } from './store'
import './assets/style.css'

const app = createApp(App)

// タイムライングリッド共通コンポーネント (全ビューで使用)
app.component('tl-grid', TlGrid)

app.use(router)

// ストアの switchTab -> ルーター遷移、遷移完了 -> ストアのタブ処理 (_enterTab)
setTabNavigator((name) => {
    router.push(tabToPath(name))
})
router.afterEach((to) => {
    const name = routeToTab(to)
    if (name) enterTab(name)
})

app.mount('#app')
