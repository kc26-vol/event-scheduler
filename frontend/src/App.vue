<template>
    <div class="app-layout">
        <!-- ハンバーガーボタン（モバイル用） -->
        <button class="hamburger-btn" @click="sidebarOpen = !sidebarOpen" aria-label="メニュー">&#9776;</button>
        <div class="sidebar-overlay" :class="{ open: sidebarOpen }" @click="sidebarOpen = false"></div>
        <!-- 左サイドバー -->
        <nav class="sidebar" :class="{ open: sidebarOpen }">
            <h1 class="sidebar-title">{{ appTitle }}</h1>
            <button class="sidebar-item" :class="{ active: tab === 'all-matrix' }" @click="switchTab('all-matrix')">スケジュール</button>
            <button class="sidebar-item" :class="{ active: tab === 'staff-detail' }" @click="switchTab('staff-detail')">スタッフ別詳細</button>
            <button class="sidebar-item" :class="{ active: tab === 'venue-view' }" @click="switchTab('venue-view')">会場</button>
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
            <button class="sidebar-item" :class="{ active: tab === 'help' }" @click="switchTab('help')">利用方法</button>
            <div style="padding:12px 16px;font-size:0.75rem;color:#999;text-align:center;margin-top:auto">version 0.1.14</div>
        </nav>
        <!-- メインコンテンツ -->
        <main class="main-content" @click="roleDropdownOpen = false">
            <router-view />
        </main>
    </div>

    <div v-if="gridMenu.show" style="position:fixed;inset:0;z-index:150" @click="gridMenu.show=false">
        <div :style="{position:'fixed', left: gridMenu.x+'px', top: gridMenu.y+'px', background:'#fff', borderRadius:'8px', boxShadow:'0 4px 24px rgba(0,0,0,0.18)', padding:'4px 0', minWidth:'120px', zIndex:151}"
             @click.stop>
            <div v-if="gridMenu.entry" style="padding:6px 16px;font-size:0.8rem;color:#888;border-bottom:1px solid #eee;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:240px">{{ gridMenu.entry.session.title }}</div>
            <button @click="gridMenuDetail()" style="display:block;width:100%;text-align:left;padding:10px 16px;border:none;background:none;cursor:pointer;font-size:0.9rem;color:#333" onmouseover="this.style.background='#f5f5f5'" onmouseout="this.style.background='none'">&#128269; 詳細</button>
            <button @click="gridMenuEdit()" style="display:block;width:100%;text-align:left;padding:10px 16px;border:none;background:none;cursor:pointer;font-size:0.9rem;color:#1a73e8" onmouseover="this.style.background='#f5f5f5'" onmouseout="this.style.background='none'">&#9998; 編集</button>
            <button @click="gridMenuDelete()" style="display:block;width:100%;text-align:left;padding:10px 16px;border:none;background:none;cursor:pointer;font-size:0.9rem;color:#d93025" onmouseover="this.style.background='#fce8e6'" onmouseout="this.style.background='none'">&#128465; 削除</button>
        </div>
    </div>

    <div v-if="sessDetailSession" style="position:fixed;inset:0;background:rgba(0,0,0,0.5);z-index:100;display:flex;align-items:center;justify-content:center" @click.self="sessDetailSession=null">
        <div style="background:#fff;border-radius:12px;padding:28px;max-width:640px;width:90%;max-height:85vh;overflow-y:auto;box-shadow:0 8px 32px rgba(0,0,0,0.2)">
            <div style="display:flex;justify-content:space-between;align-items:flex-start">
                <h3 style="margin:0 0 16px 0;font-size:1.3rem">{{ sessDetailSession.title }}</h3>
                <button @click="sessDetailSession=null" style="background:none;border:none;font-size:1.4rem;cursor:pointer;color:#666;padding:0 4px">&#10005;</button>
            </div>

            <!-- 登壇者情報 -->
            <template v-if="dynamicCatKeys.includes(sessDetailSession.category)">
                <!-- 動的カテゴリは登壇者情報なし -->
            </template>
            <template v-else-if="isMultiSpeakerCat(sessDetailSession.category) && sessDetailSession.lt_talks && sessDetailSession.lt_talks.length">
                <div style="margin-bottom:16px">
                    <strong style="font-size:0.9rem;color:#555">{{ sessDetailSession.category === 'panel' ? 'パネリスト一覧' : 'LT登壇者一覧' }}</strong>
                    <div v-for="(t, idx) in sessDetailSession.lt_talks" :key="t.id" style="display:flex;align-items:center;gap:12px;padding:10px 0;border-bottom:1px solid #f0f0f0">
                        <span style="font-weight:700;color:#1a73e8;min-width:24px">{{ idx + 1 }}.</span>
                        <img v-if="t.speaker_photo" :src="t.speaker_photo" :alt="t.speaker" style="width:48px;height:48px;border-radius:50%;object-fit:cover;flex-shrink:0">
                        <div v-else style="width:48px;height:48px;border-radius:50%;background:#1a73e8;display:flex;align-items:center;justify-content:center;color:#fff;font-weight:700;font-size:1rem;flex-shrink:0">{{ t.speaker.charAt(0) }}</div>
                        <div>
                            <strong>{{ t.speaker }}</strong>
                            <span v-if="t.speaker_kana" style="color:#888;font-size:0.8rem;margin-left:4px">({{ t.speaker_kana }})</span>
                            <span v-if="t.is_representative" class="badge" style="background:#ff9800;color:#fff;font-size:0.7rem;margin-left:6px;padding:1px 6px">{{ sessDetailSession.category === 'panel' ? 'モデレーター' : '司会者' }}</span>
                            <span v-if="t.speaker_org || t.speaker_title" style="color:#666;font-size:0.85rem"> / {{ [t.speaker_title, t.speaker_org].filter(Boolean).join(' / ') }}</span>
                            <br><span style="color:#555;font-size:0.85rem">{{ t.title }}</span>
                            <br v-if="t.start_time"><span v-if="t.start_time" style="color:#888;font-size:0.8rem">{{ fmt(t.start_time) }} - {{ fmtShort(t.end_time) }}</span>
                        </div>
                    </div>
                </div>
            </template>
            <template v-else-if="sessDetailSession.category !== 'overall'">
                <div style="display:flex;align-items:flex-start;gap:20px;margin-bottom:16px;padding:12px;background:#f8f9fa;border-radius:8px">
                    <img v-if="sessDetailSession.speaker_photo" :src="sessDetailSession.speaker_photo" :alt="sessDetailSession.speaker"
                         style="width:180px;height:180px;border-radius:8px;object-fit:cover;border:2px solid #e0e0e0;flex-shrink:0">
                    <div v-else style="width:180px;height:180px;border-radius:8px;background:#1a73e8;display:flex;align-items:center;justify-content:center;font-size:3rem;color:#fff;font-weight:700;flex-shrink:0">
                        {{ sessDetailSession.speaker.charAt(0) }}
                    </div>
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
            <div style="display:flex;flex-wrap:wrap;gap:12px;margin-bottom:16px;font-size:0.9rem">
                <div style="display:flex;align-items:center;gap:4px;color:#555">
                    <strong>時間:</strong> {{ fmt(sessDetailSession.start_time) }} - {{ fmt(sessDetailSession.end_time) }}
                </div>
                <div style="display:flex;align-items:center;gap:4px;color:#555">
                    <strong>部屋:</strong> {{ sessDetailSession.room ? sessDetailSession.room.name : '' }}
                </div>
                <div>
                    <span class="badge">{{ catLabel(sessDetailSession.category) }}</span>
                    <span v-if="sessDetailSession.english_required" class="badge" style="background:#e0f2f1;color:#00695c;margin-left:4px">EN</span>
                </div>
                <div style="color:#555"><strong>必要人数:</strong> {{ sessDetailSession.required_staff === -1 ? '全員' : sessDetailSession.required_staff + '名' }}</div>
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
                <template v-if="tab !== 'all-matrix'">
                    <button v-if="sessDetailLocked" @click="toggleSessDetailLock" class="badge" style="margin-left:8px;background:#e8eaed;color:#5f6368;cursor:pointer;border:none" title="クリックでロック解除">&#128274; ロック中</button>
                    <button v-else @click="toggleSessDetailLock" class="badge" style="margin-left:8px;background:#e8f5e9;color:#2e7d32;cursor:pointer;border:none" title="クリックでロック">&#128275; 編集可能</button>
                </template>
                <!-- ロック中 -->
                <div v-if="sessDetailLocked" style="margin-top:10px;display:flex;flex-wrap:wrap;gap:12px">
                    <span v-if="sessDetailSession.required_staff === -1" class="badge" style="background:#e65100;color:#fff;font-size:0.9rem">全員</span>
                    <template v-else-if="sessDetailEntry.assigned_staff.length">
                        <div v-for="a in sessDetailEntry.assigned_staff" :key="a.assignment_id" style="display:flex;align-items:center;gap:8px;padding:8px 12px;background:#fff;border-radius:8px;box-shadow:0 1px 3px rgba(0,0,0,0.1)">
                            <img v-if="a.staff.photo" :src="a.staff.photo" :alt="a.staff.name" style="width:40px;height:40px;border-radius:50%;object-fit:cover">
                            <div v-else style="width:40px;height:40px;border-radius:50%;background:#1a73e8;display:flex;align-items:center;justify-content:center;color:#fff;font-weight:700;font-size:0.9rem;flex-shrink:0">{{ a.staff.name.charAt(0) }}</div>
                            <div>
                                <div style="font-weight:600;font-size:0.9rem">{{ a.staff.name }}</div>
                                <div v-if="a.staff.role && a.staff.role.length" style="font-size:0.75rem;color:#888">{{ a.staff.role.map(r => catLabel(r)).join(', ') }}</div>
                            </div>
                        </div>
                    </template>
                    <span v-else class="badge warn">未配置</span>
                </div>
                <!-- 編集可能 -->
                <div v-else style="margin-top:8px;display:flex;flex-wrap:wrap;gap:6px;align-items:center">
                    <span v-if="sessDetailSession.required_staff === -1" class="badge" style="background:#e65100;color:#fff;display:inline-flex;align-items:center;gap:4px">
                        全員
                        <button @click="unsetAllStaff(sessDetailSession.id)" style="background:none;border:none;color:#fff;cursor:pointer;font-size:0.9rem;padding:0 2px" title="解除">&#10005;</button>
                    </span>
                    <template v-else-if="sessDetailEntry.assigned_staff.length">
                        <span class="badge" v-for="a in sessDetailEntry.assigned_staff" :key="a.assignment_id" style="display:inline-flex;align-items:center;gap:4px;padding:4px 10px">
                            {{ a.staff.name }}
                            <button @click="removeAssignment(a.assignment_id)" style="background:none;border:none;color:#d93025;cursor:pointer;font-size:0.9rem;padding:0 2px" title="削除">&#10005;</button>
                        </span>
                    </template>
                    <span v-else class="badge warn">未配置</span>
                </div>
                <div v-if="!sessDetailLocked" style="margin-top:8px;display:flex;align-items:center;gap:6px">
                    <select v-model="assignStaffSelect[sessDetailSession.id]" style="padding:4px 8px;font-size:0.85rem;border:1px solid #ccc;border-radius:4px;flex:1;max-width:240px">
                        <option value="0">＋ スタッフ追加</option>
                        <option v-if="sessDetailSession.category === 'overall'" value="all">全員</option>
                        <option v-for="s in availableStaffs(sessDetailEntry)" :key="s.id" :value="s.id">{{ s.name }}</option>
                    </select>
                    <button v-if="assignStaffSelect[sessDetailSession.id] && assignStaffSelect[sessDetailSession.id] !== '0'" class="btn btn-sm" @click="addAssignmentOrAll(sessDetailSession.id)" style="padding:4px 12px">追加</button>
                </div>
            </div>
        </div>
    </div>
</template>

<script>
import { onMounted } from 'vue'
import { useRoute } from 'vue-router'
import { useStore, runInitialLoad, enterTab } from './store'
import { routeToTab } from './router'

export default {
    setup() {
        const route = useRoute()
        onMounted(async () => {
            await runInitialLoad()
            // リロード時など初期ルートに応じたデータロードを保証する
            const name = routeToTab(route)
            if (name) await enterTab(name)
        })
        return useStore()
    },
}
</script>
