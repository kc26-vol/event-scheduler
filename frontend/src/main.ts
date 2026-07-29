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

/* Service Worker の登録 (本番ビルドのみ)。
 *
 * 開発サーバーでは登録しない。Vite は変換結果を都度返すので、SW が挟まると
 * 「直したのに直らない」を疑う時間が増えるだけで得がない。
 * また precache の一覧はビルドで生成されるため、開発時には存在しない。
 *
 * mount の後、さらに load を待ってから登録する。install の precache は
 * 全アセットを取りに行くので、初回表示に必要な通信と取り合わせたくない。 */
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('/sw.js').catch((err) => {
            // 登録できなくてもオンラインでは普通に動く。オフライン対応だけが無効になる。
            console.warn('[sw] 登録できませんでした', err)
        })
    })
}
