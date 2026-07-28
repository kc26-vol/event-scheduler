<template>
        <div class="panel active">
            <h2>全体スケジュール</h2>

            <!-- 日程タブ -->
            <div v-if="catDates.length > 0" class="tab-bar">
                <button class="tab-btn"
                    :style="allGroupTab === 0 ? {background:'#333', color:'#fff'} : {background:'#f5f5f5', color:'#666'}"
                    @click="allGroupTab = 0">
                    全日程
                </button>
                <button v-for="date in catDates" :key="'all-tab-'+date"
                    class="tab-btn"
                    :style="allGroupTab === date ? {background:'#1a73e8', color:'#fff'} : {background:'#f5f5f5', color:'#666'}"
                    @click="allGroupTab = date">
                    {{ date }}<span v-if="isTodayDate(date)" class="today-dot">今日</span>
                </button>
            </div>

            <!-- スタッフフィルター -->
            <div class="filter-row">
                <label class="filter-label" for="all-staff-filter">スタッフ絞り込み</label>
                <SearchSelect
                    id="all-staff-filter"
                    v-model="staffFilter"
                    :options="staffFilterOptions"
                    placeholder="全員表示"
                    search-placeholder="名前で検索…"
                    aria-label="スタッフで絞り込む"
                    clearable
                    class="filter-select">
                    <!-- 選択済みの表示にもアイコンを出す。名前だけだと
                         「誰で絞っているか」が一覧の中の表示と揃わない。 -->
                    <template #selected="{ option }">
                        <span v-if="option" class="filter-selected">
                            <AvatarIcon :name="option.label" :src="option.data?.photo" :size="22" />
                            <span class="filter-selected-name">{{ option.label }}</span>
                        </span>
                        <span v-else>全員表示</span>
                    </template>
                    <template #option="{ option }">
                        <AvatarIcon v-if="option.data" :name="option.label" :src="option.data.photo" :size="24" />
                        <span>{{ option.label }}</span>
                    </template>
                </SearchSelect>
                <!-- 1人に絞ったなら、その人の一日を縦に読めるページの方が見やすい。
                     選択中の日付も引き継いで渡す。 -->
                <RouterLink v-if="staffFilter" class="detail-link" :to="detailLink">
                    <span aria-hidden="true">&#128100;</span> 詳細で見る
                </RouterLink>
            </div>

            <!-- 凡例 -->
            <div class="tl-legend" style="margin-bottom:12px">
                <span style="font-weight:600">凡例:</span>
                <span class="tl-legend-item">
                    <span class="tl-legend-swatch" style="background:linear-gradient(135deg,#fff3e0,#ffe0b2);border-color:#e65100"></span>
                    全体
                </span>
                <span v-for="grp in sessionGroups" :key="'legend-grp-'+grp.id" class="tl-legend-item">
                    <span class="tl-legend-swatch" :style="{background: 'linear-gradient(135deg,#e8f0fe,#d2e3fc)', borderColor: grp.color}"></span>
                    {{ grp.label }}
                </span>
                <span v-for="cat in categories" :key="'legend-'+cat.key" class="tl-legend-item">
                    <span class="tl-legend-swatch" :style="{background: CAT_BG[cat.key]?.background, borderColor: cat.color}"></span>
                    {{ cat.label }}
                </span>
            </div>

            <!-- 読み込み中は「登録されていません」を出さない (未登録と誤読されるため) -->
            <SkeletonBlock v-if="!loaded.schedule" :lines="5" :height="64" label="スケジュールを読み込み中" />

            <EmptyState v-else-if="!allSchedule.length"
                icon="&#128197;"
                title="セッションがまだ登録されていません"
                hint="「管理」→「全体スケジュール管理」または各日程の管理画面から追加してください。" />

            <!-- グループ別: マトリクス表示 -->
            <template v-else-if="allGroupTab !== 0">
                <div class="tl-wrapper">
                    <div class="tl-grid" :style="allGridStyle">
                        <div class="tl-corner">時間</div>
                        <div v-for="(col, ci) in allColumns" :key="'arh'+col.id"
                             class="tl-room-header" :style="{gridColumn: ci+2, background: col.type==='overall' ? '#e65100' : (CAT_BG[col.type] ? CAT_BG[col.type].borderColor : '')}">
                            {{ col.name }}
                        </div>
                        <template v-for="(lbl, i) in allLabels" :key="'at'+i">
                            <div class="tl-time-label"
                                 :class="{ 'hour-mark': lbl.isHour, 'quarter-mark': lbl.isQuarter }"
                                 :style="{ gridRow: lbl.gridRow + ' / span ' + lbl.span }">
                                {{ lbl.text }}
                            </div>
                            <div v-for="(col, ci) in allColumns" :key="'abg'+i+'-'+col.id"
                                 class="tl-bg-cell"
                                 :class="{ 'hour-mark': lbl.isHour, 'half-mark': lbl.isHalf, 'quarter-mark': lbl.isQuarter }"
                                 :style="{ gridRow: lbl.gridRow + ' / span ' + lbl.span, gridColumn: ci+2 }">
                            </div>
                        </template>
                        <div v-for="entry in allSchedule" :key="'as'+entry.session.id"
                             class="tl-session" :style="{...allSessionStyle(entry), opacity: allSessionOpacity(entry), ...allSessionBg(entry.session.category), cursor:'pointer'}"
                             @click="toggleSessionDetail(entry.session.id)">
                            <div class="tl-session-time">
                                {{ hhmm(entry.session.start_time) }} - {{ hhmm(entry.session.end_time) }}
                            </div>
                            <div class="tl-session-title">{{ entry.session.title }}</div>
                            <div v-if="isMultiSpeakerCat(entry.session.category) && entry.session.lt_talks && entry.session.lt_talks.length" class="tl-session-speaker">
                                <span v-for="t in entry.session.lt_talks" :key="t.id" style="display:block;font-size:0.7rem">{{ t.speaker }}{{ t.title ? ' - ' + t.title : '' }}</span>
                            </div>
                            <div v-else-if="entry.session.speaker && entry.session.speaker !== '-' && entry.session.speaker !== 'スタッフ'" class="tl-session-speaker">{{ entry.session.speaker }}</div>
                            <div class="tl-session-staff">
                                <span v-if="entry.session.required_staff === -1" class="badge" style="background:#e65100;color:#fff">全員</span>
                                <template v-else-if="entry.assigned_staff.length">
                                    <PersonChip v-for="a in entry.assigned_staff" :key="a.assignment_id" :staff="a.staff" size="xs" />
                                </template>
                                <span v-else-if="entry.session.required_staff === 0" class="badge" style="background:#e8eaed;color:#5f6368">配置不要</span>
                                <span v-else class="badge warn">未配置</span>
                            </div>
                        </div>
                    </div>
                </div>
            </template>

            <!-- 全日程: タイムライン表示 -->
            <template v-else>
                <div ref="timelineEl" class="tl-days">
                <div v-for="date in catDates" :key="'timeline-grp-'+date" :data-date="date" style="margin-bottom:32px">
                    <h3 class="day-heading" :class="{ 'is-today': isTodayDate(date) }"
                        style="margin:0 0 12px;padding:8px 16px;border-radius:6px;color:#fff;font-size:1rem;background:#1a73e8">
                        {{ date }}<span v-if="isTodayDate(date)" class="today-dot">今日</span>
                    </h3>
                    <div class="tl-list">
                        <div v-for="entry in allTimelineByGroup[date]" :key="'tl-'+entry.session.id"
                             class="tl-list-row"
                             :style="{opacity: allSessionOpacity(entry)}"
                             @click="toggleSessionDetail(entry.session.id)">
                            <div class="tl-list-time">
                                <TimeRange :start="entry.session.start_time" :end="entry.session.end_time" :show-date="false" size="sm" />
                            </div>
                            <div class="tl-list-main"
                                 :style="allSessionBg(entry.session.category)">
                                <div style="font-weight:600;font-size:0.9rem">{{ entry.session.title }}</div>
                                <div v-if="entry.session.speaker && entry.session.speaker !== '-' && entry.session.speaker !== 'スタッフ'" style="font-size:0.8rem;color:#555;margin-top:2px">{{ entry.session.speaker }}</div>
                                <div v-if="entry.session.room && entry.session.category !== 'overall'" style="font-size:0.75rem;color:#888;margin-top:2px">{{ entry.session.room.name }}</div>
                            </div>
                            <div class="tl-list-staff">
                                <template v-if="entry.session.required_staff === -1">
                                    <span class="badge" style="font-size:0.7rem;background:#e65100;color:#fff">全員</span>
                                </template>
                                <template v-else-if="entry.assigned_staff.length">
                                    <PersonChip v-for="a in entry.assigned_staff" :key="a.assignment_id" :staff="a.staff" size="xs" />
                                </template>
                                <span v-else-if="entry.session.required_staff === 0" class="badge" style="background:#e8eaed;color:#5f6368;font-size:0.7rem">配置不要</span>
                                <span v-else class="badge warn" style="font-size:0.7rem">未配置</span>
                            </div>
                        </div>
                    </div>
                </div>
                </div>
            </template>
        </div>
</template>

<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'
import { RouterLink, useRoute, useRouter } from 'vue-router'
import { useStore } from '../store'
import { hhmm } from '../utils/datetime'
import SearchSelect from '../components/SearchSelect.vue'
import PersonChip from '../components/PersonChip.vue'
import AvatarIcon from '../components/AvatarIcon.vue'
import TimeRange from '../components/TimeRange.vue'
import SkeletonBlock from '../components/SkeletonBlock.vue'
import EmptyState from '../components/EmptyState.vue'

const {
    isTodayDate,
    loaded, staffs, sessionGroups, categories, CAT_BG,
    catDates, allGroupTab, allStaffFilter, allSchedule, allTimelineByGroup,
    allColumns, allGridStyle, allLabels, allSessionStyle, allSessionBg, allSessionOpacity,
    isMultiSpeakerCat, toggleSessionDetail,
} = useStore()

const staffFilterOptions = computed(() =>
    staffs.value.map(s => ({ value: s.id, label: s.name, keywords: s.slack_name || '', data: s }))
)

// ストア側は「絞り込みなし」を 0 で表現している。SearchSelect は null。
const staffFilter = computed({
    get: () => (allStaffFilter.value ? allStaffFilter.value : null),
    set: (v: string | number | null) => { allStaffFilter.value = v === null ? 0 : Number(v) },
})

// 「全日程」表示に切り替えたときも今日の位置から読めるようにする。
// 日付タブの既定は当日なので、こちらは明示的に全日程を選んだ場合の面倒を見る。
const timelineEl = ref<HTMLElement | null>(null)
watch([() => allGroupTab.value, () => loaded.schedule], async ([tab, ready]) => {
    if (tab !== 0 || !ready) return
    await nextTick()
    const today = catDates.value.find(d => isTodayDate(d))
    if (!today) return
    timelineEl.value?.querySelector(`[data-date="${today}"]`)?.scrollIntoView({ block: 'start' })
})

/* --- URL との同期 ---
 * 日付とスタッフ絞り込みを query に載せる。リロードで選択が消えず、
 * URLをそのまま共有でき、スタッフ詳細ページへ状態を引き継げる。
 * date=all は「全日程」。date が無い場合は当日を選ぶ既定に任せる。 */
const route = useRoute()
const router = useRouter()
let applyingQuery = false

function applyQuery() {
    const { date, staff } = route.query
    applyingQuery = true
    if (typeof date === 'string' && date) allGroupTab.value = date === 'all' ? 0 : date
    allStaffFilter.value = typeof staff === 'string' && staff ? Number(staff) : 0
    nextTick(() => { applyingQuery = false })
}

// query の変化だけでなく、データ到着後にも当てる。
// セッション取得時に「当日を既定選択にする」処理が走るため、
// URL で明示された日付がそれに上書きされないようにする。
watch([() => route.query, () => loaded.sessions], applyQuery, { immediate: true })

watch([allGroupTab, allStaffFilter], () => {
    if (applyingQuery) return
    const query: Record<string, string> = { date: allGroupTab.value ? String(allGroupTab.value) : 'all' }
    if (allStaffFilter.value) query.staff = String(allStaffFilter.value)
    // 履歴を汚さないよう replace (日付タブは何度も切り替えるものなので)
    router.replace({ query })
})

const detailLink = computed(() => ({
    path: '/staff-detail',
    query: {
        staff: String(allStaffFilter.value),
        ...(allGroupTab.value ? { date: String(allGroupTab.value) } : {}),
    },
}))
</script>

<style scoped>
.filter-row { display: flex; align-items: center; gap: var(--sp-2); margin-bottom: var(--sp-3); }
.filter-label { font-weight: 600; font-size: var(--fs-md); flex-shrink: 0; }
/* 残り幅いっぱいまで伸ばす。固定幅だと選択中の名前が切れる。
   広い画面で間延びしないよう上限だけ決める。 */
.filter-select { flex: 1 1 auto; min-width: 0; max-width: 460px; }
.filter-selected { display: inline-flex; align-items: center; gap: 6px; min-width: 0; }
.filter-selected-name { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-weight: 600; }

.detail-link {
    display: inline-flex; align-items: center; gap: 4px; flex-shrink: 0;
    margin-left: auto;
    padding: 6px var(--sp-3); border-radius: var(--r-full);
    background: var(--c-primary-weak); color: var(--c-primary-text);
    border: 1px solid transparent;
    font-size: var(--fs-sm); font-weight: 600; text-decoration: none;
    white-space: nowrap;
}
.detail-link:hover { background: var(--c-primary-weak-2); border-color: var(--c-primary); }

@media (max-width: 600px) {
    /* ラベルは場所を食うだけ。SearchSelect 側に aria-label があるので落とす。 */
    .filter-label { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); }
    .filter-select { max-width: none; }
    .detail-link { min-height: 36px; padding: 6px var(--sp-2); }
}
</style>
