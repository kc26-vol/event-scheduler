<!-- マイページ。アプリを開いた最初の画面。
     「自分の次の担当が、捲らずに分かる」ことだけを目的にしている。
     全体を俯瞰したい場合は「全体スケジュール」へ誘導する。 -->
<template>
    <div class="panel active my-page">
        <!-- 誰を見ているか。切り替えは右上のボタンに寄せる (アプリバーとは別) -->
        <header class="my-head">
            <AvatarIcon class="my-head-avatar" :name="viewing?.name || ''" :src="viewing?.photo" :size="44" />
            <div class="my-head-text">
                <h2 class="my-head-name">
                    {{ viewing?.name || 'スタッフ未選択' }}
                    <span v-if="viewing && !isViewingSelf" class="my-head-tag">他のスタッフを表示中</span>
                </h2>
                <div v-if="viewing" class="my-head-badges">
                    <span v-for="r in viewingRoles" :key="r" class="badge">{{ catLabel(r) }}</span>
                    <span v-if="viewing.english_ok" class="badge" style="background:var(--c-primary-weak);color:#00695c">EN</span>
                    <span v-if="viewing.experience_count === 0" class="badge warn">初参加</span>
                    <span v-else class="badge avail">{{ viewing.experience_count }}回目</span>
                </div>
            </div>
            <!-- 「自分の既定を変える」と「他の人を一時的に見る」は結果が違うので分ける。
                 自分を変更できるのは自分を見ているときだけ (他人を見ている最中に
                 出すと、どちらを差し替えるのか紛らわしい)。
                 まだ自分が未設定の人には、設定手段として常に出す。 -->
            <div class="my-head-actions">
                <PersonSwitcher v-if="isViewingSelf || myStaffId === null" mode="identity" compact />
                <PersonSwitcher mode="view" compact />
            </div>
        </header>

        <!-- 読み込み中は「担当なし」に見せない -->
        <template v-if="!ready">
            <SkeletonBlock :lines="1" :height="112" label="担当を読み込み中" />
            <SkeletonBlock :lines="3" :height="72" class="my-skel-list" />
        </template>

        <!-- スタッフ登録が無い人 (マネージャー等) はここに留まる。
             行き止まりにせず、誰かを選んで見る・全体を見る導線を残す。 -->
        <template v-else-if="!viewing">
            <EmptyState
                icon="&#128100;"
                title="表示するスタッフが選ばれていません"
                hint="上の検索欄から名前を選ぶと、その人の担当を時系列で確認できます。スタッフ登録がなくても全体スケジュールは閲覧できます。" />
            <nav class="my-links" aria-label="関連ページ">
                <RouterLink class="my-link" to="/schedule"><span aria-hidden="true">&#128197;</span> 全体スケジュール</RouterLink>
                <RouterLink class="my-link" to="/staff-detail"><span aria-hidden="true">&#128101;</span> スタッフ別詳細</RouterLink>
                <RouterLink class="my-link" to="/venue"><span aria-hidden="true">&#128506;</span> 会場地図</RouterLink>
            </nav>
        </template>

        <template v-else>
            <!-- 日程バー。スクロールしても残るようメニューバーのように固定する。 -->
            <nav class="day-bar" aria-label="日程">
                <div v-if="days.length > 1" class="day-seg">
                    <button
                        v-for="d in days"
                        :key="d.key"
                        type="button"
                        class="day-seg-btn"
                        :class="{ 'is-active': d.key === selectedDay }"
                        :aria-pressed="d.key === selectedDay"
                        @click="selectDay(d.key)"
                    >
                        <span class="day-seg-date">{{ d.label }}</span>
                        <span class="day-seg-count">{{ d.shifts.length }}件</span>
                    </button>
                </div>
                <div class="day-bar-meta">
                    <!-- 日程が複数あるときは、選択中のセグメントが日付を示しているので繰り返さない -->
                    <span v-if="days.length <= 1" class="day-bar-label">{{ selectedDayLabel }}</span>
                    <span v-if="daySummary" class="day-bar-sum">{{ daySummary }}</span>
                    <button v-if="canJumpToNow" type="button" class="day-bar-now" @click="jumpToNow(true)">
                        現在位置へ
                    </button>
                </div>
            </nav>

            <!-- その日のタイムライン。開いた時点で現在/次の担当まで送ってあるので、
                 上に捲れば済んだ担当も見られる。 -->
            <section class="my-timeline" aria-label="担当一覧">
                <EmptyState
                    v-if="!dayShifts.length"
                    icon="&#128197;"
                    title="この日の担当はありません"
                    hint="日程を切り替えるか、全体スケジュールで当日の流れを確認できます。" />

                <ol v-else ref="timelineEl" class="my-tl-list">
                    <li v-for="(item, i) in dayTimeline" :key="item.kind === 'shift' ? 's' + item.session.id : 'g' + i">
                        <ShiftCard
                            v-if="item.kind === 'shift'"
                            :data-session-id="item.session.id"
                            :session="item.session"
                            :co-staff="coStaffOf(item.session)"
                            :cat-label="labelFor(item.session)"
                            :accent="accentFor(item.session)"
                            :show-date="false"
                            :state="stateOf(item.session)"
                            :now="now"
                            @open="openDetail(item.session.id)" />
                        <!-- 担当と担当のあいだ。どこで休めるかが一目で分かるように出す。 -->
                        <div v-else class="my-gap">
                            <span class="my-gap-line" aria-hidden="true"></span>
                            <span class="my-gap-text">空き {{ humanDuration(item.minutes) }}</span>
                            <span class="my-gap-line" aria-hidden="true"></span>
                        </div>
                    </li>
                </ol>

                <p v-if="dayShifts.length && !currentShift && !nextShift" class="my-done">
                    これ以降の担当はありません。おつかれさまでした。
                </p>
            </section>

            <!-- 活動可能時間 -->
            <section v-if="viewing.availabilities?.length" class="my-avail">
                <h3>活動可能時間</h3>
                <div class="my-avail-list">
                    <div v-for="a in viewing.availabilities" :key="a.id" class="my-avail-item">
                        <TimeRange :start="a.start_time" :end="a.end_time" size="sm" inline />
                    </div>
                </div>
            </section>

            <!-- 導線 -->
            <nav class="my-links" aria-label="関連ページ">
                <RouterLink class="my-link" to="/schedule"><span aria-hidden="true">&#128197;</span> 全体スケジュール</RouterLink>
                <RouterLink class="my-link" to="/venue"><span aria-hidden="true">&#128506;</span> 会場地図</RouterLink>
                <RouterLink v-if="viewing" class="my-link" :to="`/staffs/${viewing.id}`"><span aria-hidden="true">&#9881;</span> 登録情報を編集</RouterLink>
            </nav>
        </template>
    </div>
</template>

<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'
import { RouterLink, useRoute, useRouter } from 'vue-router'
import AvatarIcon from '../components/AvatarIcon.vue'
import PersonSwitcher from '../components/PersonSwitcher.vue'
import ShiftCard from '../components/ShiftCard.vue'
import SkeletonBlock from '../components/SkeletonBlock.vue'
import EmptyState from '../components/EmptyState.vue'
import TimeRange from '../components/TimeRange.vue'
import { useStore } from '../store'
import { useMe } from '../composables/useMe'
import { useShiftsOf } from '../composables/useShifts'
import { dateKey, mdw, durationMin, humanDuration, toDate } from '../utils/datetime'
import type { SessionSummary, StaffBrief } from '../types'

const { schedule, loaded, catLabel, CAT_BG, toggleSessionDetail } = useStore()
const { viewing, viewingStaffId, isViewingSelf, myStaffId, viewAs, backToMe } = useMe()

/* --- 閲覧対象を URL に載せる ---
 * 「他の人を表示」は端末に保存しない一時的な状態なので、リロードすると
 * 自分に戻ってしまっていた。保存はせずURLに持たせることで、
 * リロード・戻る・URL共有のいずれでも同じ人を見られる。
 * 自分を見ているときは query を付けない (URLを汚さない)。 */
const route = useRoute()
const router = useRouter()
let applyingQuery = false

watch(() => route.query.staff, (s) => {
    applyingQuery = true
    if (typeof s === 'string' && s) viewAs(Number(s))
    else if (viewingStaffId.value !== myStaffId.value) backToMe()
    nextTick(() => { applyingQuery = false })
}, { immediate: true })

watch(viewingStaffId, id => {
    if (applyingQuery) return
    const query = (id !== null && id !== myStaffId.value) ? { staff: String(id) } : {}
    router.replace({ query })
})

/* --- 閲覧対象の担当と、そのうち今どれか ---
 * サイドバーの「自分」ブロックと同じ判定を使う (useShifts)。 */
const { now, shifts, current: currentShift, next: nextShift, anchor: anchorShift } = useShiftsOf(viewingStaffId)

const ready = computed(() => loaded.staffAssignments && loaded.schedule && loaded.staffs)

const viewingRoles = computed(() => {
    const r = viewing.value?.role
    if (!r) return []
    return Array.isArray(r) ? r : [r]
})

/* --- 日程ごとにまとめる --- */
const days = computed(() => {
    const map = new Map<string, SessionSummary[]>()
    for (const s of shifts.value) {
        const k = dateKey(s.start_time)
        if (!k) continue
        const list = map.get(k)
        if (list) list.push(s)
        else map.set(k, [s])
    }
    return [...map.entries()]
        .sort((a, b) => a[0].localeCompare(b[0]))
        .map(([key, list]) => ({ key, label: mdw(list[0].start_time), shifts: list }))
})

const selectedDay = ref('')

const dayShifts = computed(() => days.value.find(d => d.key === selectedDay.value)?.shifts ?? [])
const selectedDayLabel = computed(() => days.value.find(d => d.key === selectedDay.value)?.label ?? '')

const daySummary = computed(() => {
    const list = dayShifts.value
    if (!list.length) return ''
    const total = list.reduce((sum, s) => sum + (durationMin(s.start_time, s.end_time) ?? 0), 0)
    return `${list.length}件 · 計 ${humanDuration(total)}`
})

/* --- タイムライン (担当と空き時間を交互に並べる) --- */
type TimelineItem =
    | { kind: 'shift'; session: SessionSummary }
    | { kind: 'gap'; minutes: number }

const GAP_THRESHOLD_MIN = 15  // これ未満は「空き」として出すほどでもない

const dayTimeline = computed<TimelineItem[]>(() => {
    const out: TimelineItem[] = []
    const list = dayShifts.value
    list.forEach((s, i) => {
        if (i > 0) {
            const gap = durationMin(list[i - 1].end_time, s.start_time)
            if (gap !== null && gap >= GAP_THRESHOLD_MIN) out.push({ kind: 'gap', minutes: gap })
        }
        out.push({ kind: 'shift', session: s })
    })
    return out
})

// 既定の日程は「見せたい担当がある日」。それが無ければ当日、
// 当日も開催日でなければこれから来る最初の日、最後に最終日。
watch([days, anchorShift], ([list, anchor]) => {
    if (!list.length) { selectedDay.value = ''; return }
    if (list.some(d => d.key === selectedDay.value)) return
    const today = dateKey(now.value)
    const hit = (anchor ? list.find(d => d.key === dateKey(anchor.start_time)) : undefined)
        ?? list.find(d => d.key === today)
        ?? list.find(d => d.key > today)
        ?? list[list.length - 1]
    selectedDay.value = hit.key
}, { immediate: true })

/* --- 開いたら現在/次の担当までスクロールしておく --- */
const timelineEl = ref<HTMLElement | null>(null)
let autoScrolled = false

const canJumpToNow = computed(() =>
    anchorShift.value !== null && dateKey(anchorShift.value.start_time) === selectedDay.value
)

async function jumpToNow(smooth = false) {
    const id = anchorShift.value?.id
    if (id === undefined) return
    await nextTick()
    const el = timelineEl.value?.querySelector(`[data-session-id="${id}"]`)
    if (!el) return false
    el.scrollIntoView({ block: 'center', behavior: smooth ? 'smooth' : 'auto' })
    return true
}

// 初回だけ自動で送る。以降ユーザーのスクロール位置を勝手に動かさない。
watch([ready, dayTimeline], async () => {
    if (autoScrolled || !ready.value || !canJumpToNow.value) return
    autoScrolled = (await jumpToNow()) === true
}, { immediate: true, flush: 'post' })

// 日程を切り替えたら先頭から読む
function selectDay(key: string) {
    selectedDay.value = key
    nextTick(() => timelineEl.value?.scrollIntoView({ block: 'start' }))
}

function stateOf(s: SessionSummary): 'past' | 'now' | 'next' | 'future' {
    const t = now.value.getTime()
    const st = toDate(s.start_time)?.getTime()
    const en = toDate(s.end_time)?.getTime()
    if (st === undefined || en === undefined) return 'future'
    if (en <= t) return 'past'
    if (st <= t) return 'now'
    return s.id === nextShift.value?.id ? 'next' : 'future'
}

/* --- 同じセッションに入る他のスタッフ --- */
function coStaffOf(session: SessionSummary): StaffBrief[] {
    // 「全員」対象のセッションで全スタッフを並べても情報にならないので出さない
    if (session.required_staff === -1) return []
    const entry = schedule.value.find(e => e.session.id === session.id)
    if (!entry) return []
    return entry.assigned_staff
        .map(a => a.staff)
        .filter(s => s.id !== viewingStaffId.value)
}

function labelFor(session: SessionSummary): string {
    return session.required_staff === -1 ? `${catLabel(session.category)} · 全員` : catLabel(session.category)
}

function accentFor(session: SessionSummary): string {
    return CAT_BG.value[session.category]?.borderColor || 'var(--c-primary)'
}

function openDetail(id: number) {
    toggleSessionDetail(id)
}
</script>

<style scoped>
.my-page { display: flex; flex-direction: column; gap: var(--sp-5); }

/* --- ヘッダ --- */
.my-head {
    display: flex; align-items: flex-start; gap: var(--sp-3);
    padding-bottom: var(--sp-4); border-bottom: 1px solid var(--c-border);
}
.my-head-avatar { flex-shrink: 0; }
.my-head-text { flex: 1; min-width: 0; }
/* 切り替えは右上に固定。名前が長くても位置が動かない。 */
.my-head-actions {
    flex-shrink: 0; margin-left: auto;
    display: flex; flex-direction: column; align-items: flex-end; gap: var(--sp-1);
}
.my-head-name {
    display: flex; align-items: center; gap: var(--sp-2); flex-wrap: wrap;
    font-size: var(--fs-xl); margin: 0;
}
.my-head-tag {
    font-size: var(--fs-xs); font-weight: 600;
    color: var(--c-warn-text); background: var(--c-warn-weak);
    padding: 2px var(--sp-2); border-radius: var(--r-full);
}
.my-head-badges { display: flex; flex-wrap: wrap; gap: 2px; margin-top: 2px; }

.my-skel-list { margin-top: var(--sp-3); }

/* --- 日程バー (固定) ---
   スクロールしても「どの日を見ているか」と現在位置への復帰手段を残す。
   アプリバーは .main-content 内で sticky top:0 なので、その下にぶら下げる。 */
.day-bar {
    position: sticky; top: 0; z-index: var(--z-sticky);
    display: flex; flex-direction: column; gap: 6px;
    margin: 0 calc(var(--sp-6) * -1);
    padding: var(--sp-2) var(--sp-6);
    background: var(--c-surface);
    border-bottom: 1px solid var(--c-border);
}
.day-bar-meta {
    display: flex; align-items: baseline; gap: var(--sp-2);
    font-size: var(--fs-sm);
}
.day-bar-label { font-weight: 700; color: var(--c-text); }
.day-bar-sum { color: var(--c-text-2); }
.day-bar-now {
    margin-left: auto; flex-shrink: 0;
    background: none; border: 1px solid var(--c-border-strong); border-radius: var(--r-full);
    color: var(--c-primary); font-size: var(--fs-xs); font-family: inherit;
    padding: 3px var(--sp-3); cursor: pointer; white-space: nowrap;
}
.day-bar-now:hover { background: var(--c-primary-weak); border-color: var(--c-primary); }

.my-done {
    margin-top: var(--sp-4); padding: var(--sp-4);
    font-size: var(--fs-md); color: var(--c-text-2); text-align: center;
    background: var(--c-surface-2); border-radius: var(--r-md);
}

/* --- 日程セグメント --- */
.day-seg {
    display: flex; gap: var(--sp-2); overflow-x: auto;
    -webkit-overflow-scrolling: touch; overscroll-behavior-x: contain;
    padding-bottom: 2px;
}
.day-seg-btn {
    display: flex; flex-direction: column; align-items: center; gap: 1px;
    flex-shrink: 0; min-width: 78px;
    padding: 4px var(--sp-3);
    background: var(--c-surface-2); color: var(--c-text-2);
    border: 1px solid var(--c-border); border-radius: var(--r-md);
    font-family: inherit; cursor: pointer; transition: all .15s;
}
.day-seg-btn:hover { border-color: var(--c-primary); }
.day-seg-btn.is-active {
    background: var(--c-primary); color: #fff; border-color: var(--c-primary);
}
.day-seg-date { font-size: var(--fs-md); font-weight: 700; }
.day-seg-count { font-size: var(--fs-xs); opacity: .85; }

/* --- タイムライン --- */
.my-tl-list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: var(--sp-2); }
/* 固定した日程バーの下に潜り込まないよう、スクロール先に余白を確保する */
.my-tl-list [data-session-id] { scroll-margin-top: 120px; scroll-margin-bottom: var(--sp-6); }

.my-gap {
    display: flex; align-items: center; gap: var(--sp-2);
    padding: 2px 0;
}
.my-gap-line { flex: 1; height: 1px; background: repeating-linear-gradient(90deg, var(--c-border-strong) 0 4px, transparent 4px 8px); }
.my-gap-text { font-size: var(--fs-xs); color: var(--c-text-3); white-space: nowrap; }

/* --- 活動可能時間 --- */
.my-avail h3 { margin: 0 0 var(--sp-2); font-size: var(--fs-lg); }
.my-avail-list { display: flex; flex-wrap: wrap; gap: var(--sp-2); }
.my-avail-item {
    background: var(--c-success-weak); color: var(--c-success-text);
    border-radius: var(--r-md); padding: var(--sp-1) var(--sp-3);
}

/* --- 導線 --- */
.my-links { display: flex; flex-wrap: wrap; gap: var(--sp-2); }
.my-link {
    display: inline-flex; align-items: center; gap: 6px;
    padding: var(--sp-2) var(--sp-4); min-height: var(--tap);
    background: var(--c-surface-2); color: var(--c-primary);
    border: 1px solid var(--c-border); border-radius: var(--r-md);
    text-decoration: none; font-size: var(--fs-md); font-weight: 600;
}
.my-link:hover { background: var(--c-primary-weak); border-color: var(--c-primary); }

@media (max-width: 768px) {
    /* パネルの左右余白がモバイルでは狭くなるので、固定バーの逃げ幅も合わせる。
       また、アプリバー自体が sticky top:0 なので、その分だけ下にずらさないと
       日程セグメントがアプリバーの裏に潜る。 */
    .day-bar {
        top: calc(var(--appbar-h) + var(--safe-top));
        margin: 0 calc(var(--sp-3) * -1);
        padding: var(--sp-2) var(--sp-3);
    }
    .my-tl-list [data-session-id] { scroll-margin-top: 170px; }
}

@media (max-width: 480px) {
    .my-links { flex-direction: column; }
    .my-link { justify-content: center; }
    .day-bar { margin: 0 calc(var(--sp-2) * -1); padding: var(--sp-2); }
}
</style>
