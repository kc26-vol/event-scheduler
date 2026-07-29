import { createRouter, createWebHistory } from 'vue-router'

// マイページだけを開く利用者が大多数なので、管理画面のコードは
// 初期チャンクに載せない。各ルートは遷移時に初めて読み込む。
// (以前は全19ビューが単一チャンクに同梱されていた)
import MyDashboardView from './views/MyDashboardView.vue'

// meta.tab: 旧来のタブ名。文字列、またはルートからタブ名を導く関数。
// ストア側のデータロード分岐 (_enterTab) はこのタブ名を基準に動く。
const routes = [
    // 既定はマイページ。全体スケジュールは /schedule へ移した。
    { path: '/', component: MyDashboardView, meta: { tab: 'my' } },
    { path: '/schedule', component: () => import('./views/AllMatrixView.vue'), meta: { tab: 'all-matrix' } },
    { path: '/staff-detail', component: () => import('./views/StaffDetailView.vue'), meta: { tab: 'staff-detail' } },
    { path: '/venue', component: () => import('./views/VenueView.vue'), meta: { tab: 'venue-view' } },
    { path: '/overall/manage', component: () => import('./views/OverallManageView.vue'), meta: { tab: 'overall-manage' } },
    { path: '/groups/:id(\\d+)/manage', component: () => import('./views/GroupManageView.vue'), meta: { tab: (r) => `grp-${r.params.id}-manage` } },
    { path: '/categories/:key/manage', component: () => import('./views/CategoryManageView.vue'), meta: { tab: (r) => `${r.params.key}-manage` } },
    { path: '/staffs', component: () => import('./views/StaffsView.vue'), meta: { tab: 'staffs' } },
    { path: '/staffs/:id(\\d+)', component: () => import('./views/StaffDetailPageView.vue'), meta: { tab: 'staffs' } },
    { path: '/rooms', component: () => import('./views/RoomsView.vue'), meta: { tab: 'rooms' } },
    // 場所ごとの担当表。参加者が見るページで、部屋管理 (tab: 'rooms') とは別物。
    // タブ名を 'all-matrix' にしているのは、必要なデータ (部屋・セッション・
    // 配置) の読み込みが全体スケジュールと同じで、サイドバーで指すべき場所も
    // そこだから (/staffs/:id が 'staffs' を借りているのと同じ扱い)。
    { path: '/rooms/:id(\\d+)/roster', component: () => import('./views/RoomRosterView.vue'), meta: { tab: 'all-matrix' } },
    { path: '/venue-maps', component: () => import('./views/VenueMapsView.vue'), meta: { tab: 'venue-maps' } },
    { path: '/overall/assign', component: () => import('./views/OverallAssignView.vue'), meta: { tab: 'overall-assign' } },
    { path: '/groups/:id(\\d+)/assign', component: () => import('./views/GroupAssignView.vue'), meta: { tab: (r) => `grp-${r.params.id}-assign` } },
    { path: '/categories/:key/assign', component: () => import('./views/CategoryAssignView.vue'), meta: { tab: (r) => r.params.key } },
    { path: '/algorithm', component: () => import('./views/AlgorithmView.vue'), meta: { tab: 'algorithm' } },
    { path: '/settings', component: () => import('./views/SettingsView.vue'), meta: { tab: 'settings' } },
    { path: '/backup', component: () => import('./views/BackupView.vue'), meta: { tab: 'auto-backup' } },
    { path: '/export', component: () => import('./views/IoView.vue'), meta: { tab: 'io' } },
    { path: '/public-api', component: () => import('./views/PublicApiView.vue'), meta: { tab: 'public-api' } },
    { path: '/help', component: () => import('./views/HelpView.vue'), meta: { tab: 'help' } },
    { path: '/:pathMatch(.*)*', redirect: '/' },
]

export const router = createRouter({
    history: createWebHistory(),
    routes,
    scrollBehavior(to, from, saved) {
        return saved ?? { top: 0 }
    },
})

// ルート -> タブ名
export function routeToTab(route) {
    const t = route.meta.tab
    return typeof t === 'function' ? t(route) : t
}

// タブ名 -> パス (静的タブ)
const TAB_PATHS = {
    'my': '/',
    'all-matrix': '/schedule',
    'staff-detail': '/staff-detail',
    'venue-view': '/venue',
    'overall-manage': '/overall/manage',
    'staffs': '/staffs',
    'rooms': '/rooms',
    'venue-maps': '/venue-maps',
    'overall-assign': '/overall/assign',
    'algorithm': '/algorithm',
    'settings': '/settings',
    'auto-backup': '/backup',
    'io': '/export',
    'public-api': '/public-api',
    'help': '/help',
}

// タブ名 -> パス (動的タブ: セッショングループ / カテゴリ)
export function tabToPath(name) {
    if (TAB_PATHS[name]) return TAB_PATHS[name]
    let m = name.match(/^grp-(\d+)-manage$/)
    if (m) return `/groups/${m[1]}/manage`
    m = name.match(/^grp-(\d+)-assign$/)
    if (m) return `/groups/${m[1]}/assign`
    m = name.match(/^(.+)-manage$/)
    if (m) return `/categories/${m[1]}/manage`
    // カテゴリの担当タブはタブ名 = カテゴリキー
    return `/categories/${name}/assign`
}
