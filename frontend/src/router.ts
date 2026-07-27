import { createRouter, createWebHistory } from 'vue-router'
import AllMatrixView from './views/AllMatrixView.vue'
import StaffDetailView from './views/StaffDetailView.vue'
import VenueView from './views/VenueView.vue'
import OverallManageView from './views/OverallManageView.vue'
import GroupManageView from './views/GroupManageView.vue'
import CategoryManageView from './views/CategoryManageView.vue'
import StaffsView from './views/StaffsView.vue'
import StaffDetailPageView from './views/StaffDetailPageView.vue'
import RoomsView from './views/RoomsView.vue'
import VenueMapsView from './views/VenueMapsView.vue'
import OverallAssignView from './views/OverallAssignView.vue'
import GroupAssignView from './views/GroupAssignView.vue'
import CategoryAssignView from './views/CategoryAssignView.vue'
import AlgorithmView from './views/AlgorithmView.vue'
import SettingsView from './views/SettingsView.vue'
import BackupView from './views/BackupView.vue'
import IoView from './views/IoView.vue'
import PublicApiView from './views/PublicApiView.vue'
import HelpView from './views/HelpView.vue'

// meta.tab: 旧来のタブ名。文字列、またはルートからタブ名を導く関数。
// ストア側のデータロード分岐 (_enterTab) はこのタブ名を基準に動く。
const routes = [
    { path: '/', component: AllMatrixView, meta: { tab: 'all-matrix' } },
    { path: '/staff-detail', component: StaffDetailView, meta: { tab: 'staff-detail' } },
    { path: '/venue', component: VenueView, meta: { tab: 'venue-view' } },
    { path: '/overall/manage', component: OverallManageView, meta: { tab: 'overall-manage' } },
    { path: '/groups/:id(\\d+)/manage', component: GroupManageView, meta: { tab: (r) => `grp-${r.params.id}-manage` } },
    { path: '/categories/:key/manage', component: CategoryManageView, meta: { tab: (r) => `${r.params.key}-manage` } },
    { path: '/staffs', component: StaffsView, meta: { tab: 'staffs' } },
    { path: '/staffs/:id(\\d+)', component: StaffDetailPageView, meta: { tab: 'staffs' } },
    { path: '/rooms', component: RoomsView, meta: { tab: 'rooms' } },
    { path: '/venue-maps', component: VenueMapsView, meta: { tab: 'venue-maps' } },
    { path: '/overall/assign', component: OverallAssignView, meta: { tab: 'overall-assign' } },
    { path: '/groups/:id(\\d+)/assign', component: GroupAssignView, meta: { tab: (r) => `grp-${r.params.id}-assign` } },
    { path: '/categories/:key/assign', component: CategoryAssignView, meta: { tab: (r) => r.params.key } },
    { path: '/algorithm', component: AlgorithmView, meta: { tab: 'algorithm' } },
    { path: '/settings', component: SettingsView, meta: { tab: 'settings' } },
    { path: '/backup', component: BackupView, meta: { tab: 'auto-backup' } },
    { path: '/export', component: IoView, meta: { tab: 'io' } },
    { path: '/public-api', component: PublicApiView, meta: { tab: 'public-api' } },
    { path: '/help', component: HelpView, meta: { tab: 'help' } },
    { path: '/:pathMatch(.*)*', redirect: '/' },
]

export const router = createRouter({
    history: createWebHistory(),
    routes,
})

// ルート -> タブ名
export function routeToTab(route) {
    const t = route.meta.tab
    return typeof t === 'function' ? t(route) : t
}

// タブ名 -> パス (静的タブ)
const TAB_PATHS = {
    'all-matrix': '/',
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
