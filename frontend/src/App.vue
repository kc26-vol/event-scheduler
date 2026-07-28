<template>
    <div class="app-layout">
        <div class="sidebar-overlay" :class="{ open: sidebarOpen }" @click="sidebarOpen = false"></div>

        <!-- 左サイドバー。参加者が使うものを上に、管理系は折りたたむ。 -->
        <nav class="sidebar" :class="{ open: sidebarOpen }" aria-label="メインメニュー">
            <h1 class="sidebar-title">{{ appTitle }}</h1>

            <button class="sidebar-item" :class="{ active: tab === 'my' }" @click="switchTab('my')">
                <span class="nav-ico" aria-hidden="true">&#128100;</span>マイページ
            </button>
            <button class="sidebar-item" :class="{ active: tab === 'all-matrix' }" @click="switchTab('all-matrix')">
                <span class="nav-ico" aria-hidden="true">&#128197;</span>全体スケジュール
            </button>
            <button class="sidebar-item" :class="{ active: tab === 'staff-detail' }" @click="switchTab('staff-detail')">
                <span class="nav-ico" aria-hidden="true">&#128101;</span>スタッフ別詳細
            </button>
            <button class="sidebar-item" :class="{ active: tab === 'venue-view' }" @click="switchTab('venue-view')">
                <span class="nav-ico" aria-hidden="true">&#128506;</span>会場
            </button>
            <button class="sidebar-item" :class="{ active: tab === 'help' }" @click="switchTab('help')">
                <span class="nav-ico" aria-hidden="true">&#10068;</span>利用方法
            </button>

            <!-- 管理系。全員同じパスワードなので権限で隠せるものではなく、
                 あくまで日常的に使わないものを畳んでいるだけ。 -->
            <button class="sidebar-toggle" :class="{ open: adminOpen }" :aria-expanded="adminOpen" @click="toggleAdmin">
                <span class="caret" aria-hidden="true">&#9654;</span>管理
            </button>
            <div v-show="adminOpen" class="sidebar-sub">
                <div class="sidebar-section">イベント設定</div>
                <button class="sidebar-item" :class="{ active: tab === 'overall-manage' }" @click="switchTab('overall-manage')">全体スケジュール管理</button>
                <button v-for="grp in sessionGroups" :key="'nav-gm-'+grp.id" class="sidebar-item" :class="{ active: tab === 'grp-'+grp.id+'-manage' }" @click="switchTab('grp-'+grp.id+'-manage')">{{ grp.label }}管理</button>
                <button v-for="cat in categories" :key="'nav-m-'+cat.key" class="sidebar-item" :class="{ active: tab === cat.key+'-manage' }" @click="switchTab(cat.key+'-manage')">{{ cat.label }}管理</button>
                <button class="sidebar-item" :class="{ active: tab === 'staffs' }" @click="switchTab('staffs')">スタッフ管理</button>
                <button class="sidebar-item" :class="{ active: tab === 'rooms' }" @click="switchTab('rooms')">部屋管理</button>
                <button class="sidebar-item" :class="{ active: tab === 'venue-maps' }" @click="switchTab('venue-maps')">会場地図</button>

                <div class="sidebar-section">スタッフ配置</div>
                <button class="sidebar-item" :class="{ active: tab === 'overall-assign' }" @click="switchTab('overall-assign')">全体スケジュール担当</button>
                <button v-for="grp in sessionGroups" :key="'nav-ga-'+grp.id" class="sidebar-item" :class="{ active: tab === 'grp-'+grp.id+'-assign' }" @click="switchTab('grp-'+grp.id+'-assign')">{{ grp.label }}担当</button>
                <button v-for="cat in categories" :key="'nav-a-'+cat.key" class="sidebar-item" :class="{ active: tab === cat.key }" @click="switchTab(cat.key)">{{ cat.label }}担当</button>
                <button class="sidebar-item" :class="{ active: tab === 'algorithm' }" @click="switchTab('algorithm')">配置アルゴリズム</button>

                <div class="sidebar-section">システム</div>
                <button class="sidebar-item" :class="{ active: tab === 'settings' }" @click="switchTab('settings')">設定</button>
                <button class="sidebar-item" :class="{ active: tab === 'auto-backup' }" @click="switchTab('auto-backup')">バックアップ</button>
                <button class="sidebar-item" :class="{ active: tab === 'io' }" @click="switchTab('io')">エクスポート</button>
                <button class="sidebar-item" :class="{ active: tab === 'public-api' }" @click="switchTab('public-api')">公開API</button>
            </div>

            <div class="sidebar-version">version 0.1.14</div>
        </nav>

        <!-- メインコンテンツ -->
        <main class="main-content" @click="roleDropdownOpen = false">
            <!-- モバイル用アプリバー。sticky なので本文と重ならない。 -->
            <div class="app-bar">
                <div class="app-bar-inner">
                    <button class="hamburger-btn" @click.stop="sidebarOpen = !sidebarOpen" aria-label="メニューを開く">&#9776;</button>
                    <span class="app-bar-title">{{ appTitle }}</span>
                    <!-- ここは「自分」を表すアイコン。他の人を閲覧中でも変わらない
                         (閲覧対象はマイページ本文側の表示が担当する)。 -->
                    <button v-if="me" class="app-bar-me" @click.stop="switchTab('my')" :aria-label="`マイページ: ${me.name}`">
                        <AvatarIcon :name="me.name" :src="me.photo" :size="28" />
                    </button>
                </div>
            </div>
            <router-view />
        </main>
    </div>

    <!-- 初回アクセス時の本人選択 -->
    <IdentityGate v-if="needsIdentity" />

    <div v-if="gridMenu.show" style="position:fixed;inset:0;z-index:150" @click="gridMenu.show=false">
        <div :style="{position:'fixed', left: gridMenu.x+'px', top: gridMenu.y+'px', background:'#fff', borderRadius:'8px', boxShadow:'0 4px 24px rgba(0,0,0,0.18)', padding:'4px 0', minWidth:'120px', zIndex:151}"
             @click.stop>
            <div v-if="gridMenu.entry" style="padding:6px 16px;font-size:0.8rem;color:#888;border-bottom:1px solid #eee;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:240px">{{ gridMenu.entry.session.title }}</div>
            <button @click="gridMenuDetail()" style="display:block;width:100%;text-align:left;padding:10px 16px;border:none;background:none;cursor:pointer;font-size:0.9rem;color:#333" onmouseover="this.style.background='#f5f5f5'" onmouseout="this.style.background='none'">&#128269; 詳細</button>
            <button @click="gridMenuEdit()" style="display:block;width:100%;text-align:left;padding:10px 16px;border:none;background:none;cursor:pointer;font-size:0.9rem;color:#1a73e8" onmouseover="this.style.background='#f5f5f5'" onmouseout="this.style.background='none'">&#9998; 編集</button>
            <button @click="gridMenuDelete()" style="display:block;width:100%;text-align:left;padding:10px 16px;border:none;background:none;cursor:pointer;font-size:0.9rem;color:#d93025" onmouseover="this.style.background='#fce8e6'" onmouseout="this.style.background='none'">&#128465; 削除</button>
        </div>
    </div>

    <!-- セッション詳細 -->
    <div v-if="sessDetailSession" class="sd-overlay" @click.self="sessDetailSession=null">
        <div class="sd-panel">
            <div class="sd-head">
                <h3 class="sd-title">{{ sessDetailSession.title }}</h3>
                <button class="sd-close" @click="sessDetailSession=null" aria-label="閉じる">&#10005;</button>
            </div>

            <!-- 登壇者情報 -->
            <template v-if="dynamicCatKeys.includes(sessDetailSession.category)">
                <!-- 動的カテゴリは登壇者情報なし -->
            </template>
            <template v-else-if="isMultiSpeakerCat(sessDetailSession.category) && sessDetailSession.lt_talks && sessDetailSession.lt_talks.length">
                <div style="margin-bottom:16px">
                    <strong style="font-size:0.9rem;color:#555">{{ sessDetailSession.category === 'panel' ? 'パネリスト一覧' : 'LT登壇者一覧' }}</strong>
                    <div v-for="(t, idx) in sessDetailSession.lt_talks" :key="t.id" style="display:flex;align-items:center;gap:12px;padding:10px 0;border-bottom:1px solid #f0f0f0">
                        <span style="font-weight:700;color:#1a73e8;min-width:24px">{{ Number(idx) + 1 }}.</span>
                        <AvatarIcon :name="t.speaker" :src="t.speaker_photo" :size="48" />
                        <div>
                            <strong>{{ t.speaker }}</strong>
                            <span v-if="t.speaker_kana" style="color:#888;font-size:0.8rem;margin-left:4px">({{ t.speaker_kana }})</span>
                            <span v-if="t.is_representative" class="badge" style="background:#ff9800;color:#fff;font-size:0.7rem;margin-left:6px;padding:1px 6px">{{ sessDetailSession.category === 'panel' ? 'モデレーター' : '司会者' }}</span>
                            <span v-if="t.speaker_org || t.speaker_title" style="color:#666;font-size:0.85rem"> / {{ [t.speaker_title, t.speaker_org].filter(Boolean).join(' / ') }}</span>
                            <br><span style="color:#555;font-size:0.85rem">{{ t.title }}</span>
                            <div v-if="t.start_time" style="margin-top:2px">
                                <TimeRange :start="t.start_time" :end="t.end_time" size="sm" inline />
                            </div>
                        </div>
                    </div>
                </div>
            </template>
            <template v-else-if="sessDetailSession.category !== 'overall'">
                <div class="sd-speaker">
                    <img v-if="sessDetailSession.speaker_photo" :src="sessDetailSession.speaker_photo" :alt="sessDetailSession.speaker" class="sd-speaker-photo">
                    <AvatarIcon v-else :name="sessDetailSession.speaker" :size="120" />
                    <div style="flex:1;min-width:0">
                        <div style="font-size:1.3rem;font-weight:700">{{ sessDetailSession.speaker }}</div>
                        <div v-if="sessDetailSession.speaker_kana" style="font-size:0.85rem;color:#888;margin-top:2px">{{ sessDetailSession.speaker_kana }}</div>
                        <div v-if="sessDetailSession.speaker_title || sessDetailSession.speaker_org" style="font-size:0.95rem;color:#555;margin-top:6px">
                            {{ [sessDetailSession.speaker_title, sessDetailSession.speaker_org].filter(Boolean).join(' / ') }}
                        </div>
                        <div v-if="sessDetailSession.speaker_profile" style="font-size:0.85rem;color:#666;margin-top:10px;line-height:1.6">{{ sessDetailSession.speaker_profile }}</div>
                    </div>
                </div>
            </template>

            <!-- セッション情報 -->
            <div class="sd-facts">
                <div class="sd-fact">
                    <TimeRange :start="sessDetailSession.start_time" :end="sessDetailSession.end_time" size="md" show-duration />
                </div>
                <div class="sd-fact-text">
                    <div v-if="sessDetailSession.room"><strong>部屋:</strong> {{ sessDetailSession.room.name }}</div>
                    <div>
                        <span class="badge">{{ catLabel(sessDetailSession.category) }}</span>
                        <span v-if="sessDetailSession.english_required" class="badge" style="background:#e0f2f1;color:#00695c;margin-left:4px">EN</span>
                    </div>
                    <div><strong>必要人数:</strong> {{ sessDetailSession.required_staff === -1 ? '全員' : sessDetailSession.required_staff + '名' }}</div>
                </div>
            </div>

            <div v-if="sessDetailSession.description" style="margin-bottom:12px;padding:12px;background:#f8f9fa;border-radius:6px">
                <strong style="font-size:0.85rem;color:#333">セッション説明</strong>
                <p style="margin:6px 0 0;font-size:0.9rem;white-space:pre-wrap;line-height:1.6">{{ sessDetailSession.description }}</p>
            </div>
            <div v-if="sessDetailSession.notes" style="margin-bottom:12px;padding:12px;background:#fff8e1;border-radius:6px">
                <strong style="font-size:0.85rem;color:#e65100">備考</strong>
                <p style="margin:6px 0 0;font-size:0.9rem;white-space:pre-wrap;line-height:1.6;color:#666">{{ sessDetailSession.notes }}</p>
            </div>
            <div v-if="!sessDetailSession.description && !sessDetailSession.notes && !sessDetailSession.speaker_profile && sessDetailSession.category !== 'lt'" style="color:#aaa;font-size:0.85rem">詳細情報なし</div>

            <!-- スタッフ配置 -->
            <div v-if="sessDetailEntry" style="margin-top:16px;padding:16px;background:#f0f4ff;border-radius:8px">
                <strong style="font-size:0.9rem">担当スタッフ</strong>
                <span v-if="sessDetailSession.required_staff === -1" class="badge" style="margin-left:8px;background:#e65100;color:#fff;font-weight:600">全員</span>
                <span v-else style="font-size:0.8rem;color:#666;margin-left:8px">(必要: {{ sessDetailSession.required_staff }}名)</span>
                <template v-if="tab !== 'all-matrix' && tab !== 'my'">
                    <button v-if="sessDetailLocked" @click="toggleSessDetailLock" class="badge" style="margin-left:8px;background:#e8eaed;color:#5f6368;cursor:pointer;border:none" title="クリックでロック解除">&#128274; ロック中</button>
                    <button v-else @click="toggleSessDetailLock" class="badge" style="margin-left:8px;background:#e8f5e9;color:#2e7d32;cursor:pointer;border:none" title="クリックでロック">&#128275; 編集可能</button>
                </template>
                <!-- ロック中 -->
                <div v-if="sessDetailLocked" style="margin-top:10px;display:flex;flex-wrap:wrap;gap:8px">
                    <span v-if="sessDetailSession.required_staff === -1" class="badge" style="background:#e65100;color:#fff;font-size:0.9rem">全員</span>
                    <template v-else-if="sessDetailEntry.assigned_staff.length">
                        <PersonChip v-for="a in sessDetailEntry.assigned_staff" :key="a.assignment_id" :staff="a.staff" size="md" />
                    </template>
                    <span v-else-if="sessDetailSession.required_staff === 0" class="badge" style="background:#e8eaed;color:#5f6368">配置不要</span>
                    <span v-else class="badge warn">未配置</span>
                </div>
                <!-- 編集可能 -->
                <div v-else style="margin-top:8px;display:flex;flex-wrap:wrap;gap:6px;align-items:center">
                    <span v-if="sessDetailSession.required_staff === -1" class="badge" style="background:#e65100;color:#fff;display:inline-flex;align-items:center;gap:4px">
                        全員
                        <button @click="unsetAllStaff(sessDetailSession.id)" style="background:none;border:none;color:#fff;cursor:pointer;font-size:0.9rem;padding:0 2px" title="解除">&#10005;</button>
                    </span>
                    <template v-else-if="sessDetailEntry.assigned_staff.length">
                        <PersonChip v-for="a in sessDetailEntry.assigned_staff" :key="a.assignment_id" :staff="a.staff" size="md">
                            <button @click.stop="removeAssignment(a.assignment_id)" class="chip-x" title="削除">&#10005;</button>
                        </PersonChip>
                    </template>
                    <span v-else-if="sessDetailSession.required_staff === 0" class="badge" style="background:#e8eaed;color:#5f6368">配置不要</span>
                    <span v-else class="badge warn">未配置</span>
                </div>
                <div v-if="!sessDetailLocked" style="margin-top:8px;display:flex;align-items:center;gap:6px">
                    <SearchSelect
                        v-model="assignStaffSelect[sessDetailSession.id]"
                        :options="assignOptions"
                        placeholder="＋ スタッフを追加"
                        search-placeholder="名前で検索…"
                        empty-text="追加できるスタッフがいません"
                        aria-label="担当スタッフを追加"
                        style="flex:1;max-width:260px">
                        <template #option="{ option }">
                            <AvatarIcon v-if="option.data" :name="option.label" :src="option.data.photo" :size="24" />
                            <span>{{ option.label }}</span>
                        </template>
                    </SearchSelect>
                    <button v-if="assignStaffSelect[sessDetailSession.id] && assignStaffSelect[sessDetailSession.id] !== '0'" class="btn btn-sm" @click="addAssignmentOrAll(sessDetailSession.id)" style="padding:4px 12px">追加</button>
                </div>
            </div>
        </div>
    </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRoute } from 'vue-router'
import { useStore, runInitialLoad, enterTab } from './store'
import { useMe } from './composables/useMe'
import { routeToTab } from './router'
import AvatarIcon from './components/AvatarIcon.vue'
import PersonChip from './components/PersonChip.vue'
import TimeRange from './components/TimeRange.vue'
import SearchSelect from './components/SearchSelect.vue'
import IdentityGate from './components/IdentityGate.vue'

const route = useRoute()

onMounted(async () => {
    await runInitialLoad()
    // リロード時など初期ルートに応じたデータロードを保証する
    const name = routeToTab(route)
    if (name) await enterTab(name)
})

const {
    tab, sidebarOpen, appTitle, sessionGroups, categories, switchTab,
    roleDropdownOpen, catLabel, dynamicCatKeys, isMultiSpeakerCat,
    gridMenu, gridMenuEdit, gridMenuDelete, gridMenuDetail,
    sessDetailSession, sessDetailEntry, sessDetailLocked, toggleSessDetailLock,
    assignStaffSelect, availableStaffs, addAssignmentOrAll, removeAssignment, unsetAllStaff,
} = useStore()

const { me, needsIdentity } = useMe()

// 管理セクションの開閉。日常的に使わないので既定は閉じる。
const ADMIN_KEY = 'es.adminNavOpen'
const adminOpen = ref(readAdminOpen())
function readAdminOpen(): boolean {
    try { return localStorage.getItem(ADMIN_KEY) === '1' } catch { return false }
}
function toggleAdmin() {
    adminOpen.value = !adminOpen.value
    try { localStorage.setItem(ADMIN_KEY, adminOpen.value ? '1' : '0') } catch { /* 保存できなくても動く */ }
}

// 詳細モーダルの「スタッフ追加」候補。全体セッションだけ「全員」を選べる。
const assignOptions = computed(() => {
    const entry = sessDetailEntry.value
    if (!entry) return []
    const opts: { value: string | number; label: string; keywords?: string; data?: any }[] = []
    if (sessDetailSession.value?.category === 'overall') {
        opts.push({ value: 'all', label: '全員を配置' })
    }
    for (const s of availableStaffs(entry)) {
        opts.push({ value: s.id, label: s.name, keywords: s.slack_name || '', data: s })
    }
    return opts
})
</script>

<style scoped>
.sidebar-version {
    padding: 12px 16px; font-size: 0.75rem; color: #94a3b8;
    text-align: center; margin-top: auto;
}
.app-bar-me {
    flex-shrink: 0; background: none; border: none; cursor: pointer;
    padding: 0; display: flex; align-items: center;
    width: var(--tap); height: var(--tap); justify-content: center;
}

/* --- セッション詳細モーダル --- */
.sd-overlay {
    position: fixed; inset: 0; background: rgba(0,0,0,0.5); z-index: var(--z-overlay);
    display: flex; align-items: center; justify-content: center;
    padding: var(--sp-3);
    padding-top: calc(var(--sp-3) + var(--safe-top));
    padding-bottom: calc(var(--sp-3) + var(--safe-bottom));
}
.sd-panel {
    background: #fff; border-radius: var(--r-lg);
    padding: var(--sp-6); max-width: 640px; width: 100%;
    max-height: 100%; overflow-y: auto; overscroll-behavior: contain;
    box-shadow: var(--sh-4);
}
.sd-head { display: flex; justify-content: space-between; align-items: flex-start; gap: var(--sp-2); }
.sd-title { margin: 0 0 var(--sp-4); font-size: var(--fs-2xl); overflow-wrap: anywhere; }
.sd-close {
    background: none; border: none; font-size: 1.4rem; cursor: pointer; color: #666;
    width: var(--tap); height: var(--tap); flex-shrink: 0;
}

.sd-speaker {
    display: flex; align-items: flex-start; gap: var(--sp-5);
    margin-bottom: var(--sp-4); padding: var(--sp-3);
    background: var(--c-surface-2); border-radius: var(--r-md);
}
.sd-speaker-photo {
    width: 120px; height: 120px; border-radius: var(--r-md); object-fit: cover;
    border: 2px solid var(--c-border); flex-shrink: 0;
}

.sd-facts {
    display: flex; align-items: center; gap: var(--sp-4);
    margin-bottom: var(--sp-4); padding: var(--sp-3);
    background: var(--c-surface-2); border-radius: var(--r-md);
}
.sd-fact { flex-shrink: 0; padding-right: var(--sp-4); border-right: 1px solid var(--c-border); }
.sd-fact-text { display: flex; flex-direction: column; gap: var(--sp-1); font-size: var(--fs-md); color: #555; min-width: 0; }

@media (max-width: 480px) {
    .sd-panel { padding: var(--sp-4); }
    .sd-speaker { flex-direction: column; align-items: center; text-align: center; }
    .sd-speaker-photo { width: 96px; height: 96px; }
}
</style>
