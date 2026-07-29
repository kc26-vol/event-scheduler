<!-- 場所ごとの担当表。
     引き継ぎのとき「この持ち場に、いつ誰が入るのか」は場所を軸に並べないと
     追えない。全体スケジュールは部屋を列に並べた横スクロールの表なので、
     会場に立っている人が自分の持ち場の列だけを見るには向いていない。

     シフト (マイページの担当カード / セッション詳細) の場所からここへ来る。 -->
<template>
    <div class="panel active rr">
        <div class="rr-nav">
            <button type="button" class="btn btn-sm rr-back" @click="goBack">&#8592; 戻る</button>
        </div>

        <template v-if="!ready">
            <SkeletonBlock :lines="1" :height="52" label="担当表を読み込み中" />
            <SkeletonBlock :lines="4" :height="64" class="rr-skel" />
        </template>

        <EmptyState
            v-else-if="!room"
            icon="&#128205;"
            title="この場所は見つかりませんでした"
            hint="削除された部屋かもしれません。全体スケジュールから探し直してください。" />

        <template v-else>
            <header class="rr-head">
                <h2 class="rr-title">{{ room.name }}</h2>
                <p class="rr-sub">この場所の担当表 &middot; 全 {{ entries.length }} 件</p>
            </header>

            <EmptyState
                v-if="!entries.length"
                icon="&#128197;"
                title="この場所に登録された予定はありません"
                hint="部屋を選び直すか、全体スケジュールで当日の流れを確認してください。" />

            <template v-else>
                <!-- 日程。マイページと同じく、開いた時点で当日が選ばれる。 -->
                <nav v-if="days.length > 1" class="rr-days" aria-label="日程">
                    <button
                        v-for="d in days"
                        :key="d.key"
                        type="button"
                        class="rr-day-btn"
                        :class="{ 'is-active': d.key === selectedDay }"
                        :aria-pressed="d.key === selectedDay"
                        @click="selectedDay = d.key"
                    >
                        <span class="rr-day-date">{{ d.label }}</span>
                        <span class="rr-day-count">{{ d.entries.length }}件</span>
                    </button>
                </nav>

                <ol ref="listEl" class="rr-list">
                    <li
                        v-for="e in dayEntries"
                        :key="e.session.id"
                        :data-session-id="e.session.id"
                        class="rr-item"
                        :class="[`is-${stateOf(e.session)}`, { 'is-mine': isMine(e) }]"
                        :style="{ '--accent': accentFor(e.session.category) }"
                    >
                        <button type="button" class="rr-item-btn" @click="toggleSessionDetail(e.session.id)">
                            <div class="rr-time">
                                <TimeRange :start="e.session.start_time" :end="e.session.end_time" :show-date="false" size="sm" />
                                <span v-if="stateOf(e.session) === 'now'" class="rr-now">進行中</span>
                            </div>

                            <div class="rr-main">
                                <div class="rr-head-line">
                                    <span class="rr-cat">{{ catLabel(e.session.category) }}</span>
                                    <span v-if="isMine(e)" class="rr-mine">自分の担当</span>
                                </div>
                                <div class="rr-name">{{ e.session.title }}</div>
                                <div class="rr-people">
                                    <span v-if="e.session.required_staff === -1" class="badge rr-all">全員</span>
                                    <template v-else-if="e.assigned_staff.length">
                                        <PersonChip v-for="a in e.assigned_staff" :key="a.assignment_id" :staff="a.staff" size="xs" />
                                    </template>
                                    <span v-else-if="e.session.required_staff === 0" class="badge rr-none">配置不要</span>
                                    <span v-else class="badge warn">未配置</span>
                                </div>
                            </div>
                        </button>
                    </li>
                </ol>
            </template>

            <nav class="rr-links" aria-label="関連ページ">
                <RouterLink class="rr-link" to="/"><span aria-hidden="true">&#128100;</span> マイページ</RouterLink>
                <RouterLink class="rr-link" to="/schedule"><span aria-hidden="true">&#128197;</span> 全体スケジュール</RouterLink>
            </nav>
        </template>
    </div>
</template>

<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'
import { RouterLink, useRoute, useRouter } from 'vue-router'
import PersonChip from '../components/PersonChip.vue'
import TimeRange from '../components/TimeRange.vue'
import SkeletonBlock from '../components/SkeletonBlock.vue'
import EmptyState from '../components/EmptyState.vue'
import { useStore } from '../store'
import { useMe } from '../composables/useMe'
import { useNow } from '../composables/useShifts'
import { dateKey, mdw, toDate } from '../utils/datetime'
import type { ScheduleEntry, Session } from '../types'

const route = useRoute()
const router = useRouter()
const { rooms, schedule, loaded, catLabel, CAT_BG, toggleSessionDetail } = useStore()
const { myStaffId } = useMe()
const now = useNow()

const roomId = computed(() => Number(route.params.id))
const ready = computed(() => loaded.rooms && loaded.schedule)
const room = computed(() => rooms.value.find(r => r.id === roomId.value) ?? null)

/** この場所の予定。同時刻に並行する担当もあるので、開始が同じなら終了の早い順。 */
const entries = computed(() =>
    schedule.value
        .filter(e => e.session.room_id === roomId.value)
        .sort((a, b) => {
            const s = (a.session.start_time || '').localeCompare(b.session.start_time || '')
            return s !== 0 ? s : (a.session.end_time || '').localeCompare(b.session.end_time || '')
        })
)

const days = computed(() => {
    const map = new Map<string, ScheduleEntry[]>()
    for (const e of entries.value) {
        const k = dateKey(e.session.start_time)
        if (!k) continue
        const list = map.get(k)
        if (list) list.push(e)
        else map.set(k, [e])
    }
    return [...map.entries()]
        .sort((a, b) => a[0].localeCompare(b[0]))
        .map(([key, list]) => ({ key, label: mdw(list[0].session.start_time), entries: list }))
})

const selectedDay = ref('')
const dayEntries = computed(() => days.value.find(d => d.key === selectedDay.value)?.entries ?? [])

/* --- どの日を出すか ---
 * シフトから辿って来たときは、その日 (query.date) を開く。当日に寄せると、
 * 翌日のシフトから来た人が別の日を見せられることになる。
 * 直接開かれた場合は当日、開催日でなければこれから来る最初の日、最後に最終日。 */
watch(days, list => {
    if (!list.length) { selectedDay.value = ''; return }
    if (list.some(d => d.key === selectedDay.value)) return
    const wanted = typeof route.query.date === 'string' ? route.query.date : ''
    const today = dateKey(now.value)
    selectedDay.value = (
        list.find(d => d.key === wanted)
        ?? list.find(d => d.key === today)
        ?? list.find(d => d.key > today)
        ?? list[list.length - 1]
    ).key
}, { immediate: true })

/* --- 開いたら見たい行まで送っておく ---
 * 辿って来た元のシフト (query.from) があればそこ、無ければ今の時間帯。
 * 初回だけ。以降はユーザーのスクロール位置を勝手に動かさない。 */
const listEl = ref<HTMLElement | null>(null)
let autoScrolled = false

watch([ready, dayEntries], async () => {
    if (autoScrolled || !ready.value || !dayEntries.value.length) return
    const from = Number(route.query.from)
    const target = dayEntries.value.find(e => e.session.id === from)
        ?? (selectedDay.value === dateKey(now.value)
            ? dayEntries.value.find(e => (toDate(e.session.end_time)?.getTime() ?? 0) > now.value.getTime())
            : undefined)
    if (!target) return
    await nextTick()
    const el = listEl.value?.querySelector(`[data-session-id="${target.session.id}"]`)
    if (!el) return
    el.scrollIntoView({ block: 'center' })
    autoScrolled = true
}, { immediate: true, flush: 'post' })

function stateOf(s: Session): 'past' | 'now' | 'future' {
    const t = now.value.getTime()
    const st = toDate(s.start_time)?.getTime()
    const en = toDate(s.end_time)?.getTime()
    if (st === undefined || en === undefined) return 'future'
    if (en <= t) return 'past'
    return st <= t ? 'now' : 'future'
}

function isMine(e: ScheduleEntry): boolean {
    if (myStaffId.value === null) return false
    return e.assigned_staff.some(a => a.staff.id === myStaffId.value)
}

function accentFor(category: string): string {
    return CAT_BG.value[category]?.borderColor || 'var(--c-primary)'
}

// 直前の画面 (シフトを開いていたページ) へ戻す。URL を直接開かれた場合は
// アプリ内に戻り先が無いので、マイページを出す。
function goBack() {
    if (window.history.state?.back) router.back()
    else router.push('/')
}
</script>

<style scoped>
.rr { display: flex; flex-direction: column; gap: var(--sp-4); }
.rr-nav { display: flex; }
.rr-back { background: var(--c-surface-2); color: var(--c-text-2); border: 1px solid var(--c-border); }
.rr-back:hover { background: var(--c-primary-weak); color: var(--c-primary); }
.rr-skel { margin-top: var(--sp-3); }

.rr-head { padding-bottom: var(--sp-3); border-bottom: 1px solid var(--c-border); }
.rr-title { margin: 0; font-size: var(--fs-xl); overflow-wrap: anywhere; }
.rr-sub { margin: 2px 0 0; font-size: var(--fs-sm); color: var(--c-text-2); }

/* --- 日程 --- */
.rr-days {
    display: flex; gap: var(--sp-2); overflow-x: auto;
    -webkit-overflow-scrolling: touch; overscroll-behavior-x: contain;
    padding-bottom: 2px;
}
.rr-day-btn {
    display: flex; flex-direction: column; align-items: center; gap: 1px;
    flex-shrink: 0; min-width: 78px;
    padding: 4px var(--sp-3);
    background: var(--c-surface-2); color: var(--c-text-2);
    border: 1px solid var(--c-border); border-radius: var(--r-md);
    font-family: inherit; cursor: pointer; transition: all .15s;
}
.rr-day-btn:hover { border-color: var(--c-primary); }
.rr-day-btn.is-active { background: var(--c-primary); color: #fff; border-color: var(--c-primary); }
.rr-day-date { font-size: var(--fs-md); font-weight: 700; }
.rr-day-count { font-size: var(--fs-xs); opacity: .85; }

/* --- 一覧 --- */
.rr-list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: var(--sp-2); }
.rr-item { scroll-margin-top: var(--sp-6); scroll-margin-bottom: var(--sp-6); }

.rr-item-btn {
    display: flex; align-items: stretch; gap: var(--sp-3);
    width: 100%; text-align: left; font-family: inherit;
    background: var(--c-surface);
    border: 1px solid var(--c-border); border-left: 4px solid var(--accent);
    border-radius: var(--r-md); padding: var(--sp-3);
    cursor: pointer; transition: box-shadow .15s, border-color .15s;
}
.rr-item-btn:hover { box-shadow: var(--sh-2); }
.rr-item-btn:focus-visible { outline: 2px solid var(--c-primary); outline-offset: 2px; }

/* 済んだ枠は沈める。読めなくはしない。 */
.is-past .rr-item-btn { opacity: 0.5; }
.is-now .rr-item-btn {
    background: #fff8f7;
    background: color-mix(in srgb, var(--accent) 14%, var(--c-surface));
    border-color: var(--accent); border-left-width: 6px; box-shadow: var(--sh-2);
}
/* 自分が入っている枠は、担当表の中から目で拾えるようにする。 */
.is-mine .rr-item-btn { border-color: var(--c-primary); }

.rr-time {
    flex-shrink: 0; display: flex; flex-direction: column; align-items: center; gap: 4px;
    min-width: 62px; padding-right: var(--sp-3); border-right: 1px solid var(--c-border);
}
.rr-now {
    font-size: var(--fs-xs); font-weight: 700; line-height: 1.4; color: #fff;
    background: var(--c-danger); padding: 1px var(--sp-2); border-radius: var(--r-full);
    white-space: nowrap;
}

.rr-main { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 3px; }
.rr-head-line { display: flex; align-items: center; gap: var(--sp-2); flex-wrap: wrap; }
.rr-cat {
    font-size: var(--fs-xs); font-weight: 700; color: var(--accent);
    background: color-mix(in srgb, var(--accent) 12%, transparent);
    padding: 1px var(--sp-2); border-radius: var(--r-full);
}
.rr-mine {
    font-size: var(--fs-xs); font-weight: 700; color: #fff;
    background: var(--c-primary); padding: 1px var(--sp-2); border-radius: var(--r-full);
}
.rr-name { font-size: var(--fs-md); font-weight: 600; line-height: var(--lh-tight); overflow-wrap: anywhere; }
.rr-people { display: flex; flex-wrap: wrap; gap: var(--sp-1); margin-top: 2px; }
.rr-all { background: #e65100; color: #fff; }
.rr-none { background: #e8eaed; color: #5f6368; }

/* --- 導線 --- */
.rr-links { display: flex; flex-wrap: wrap; gap: var(--sp-2); }
.rr-link {
    display: inline-flex; align-items: center; gap: 6px;
    padding: var(--sp-2) var(--sp-4); min-height: var(--tap);
    background: var(--c-surface-2); color: var(--c-primary);
    border: 1px solid var(--c-border); border-radius: var(--r-md);
    text-decoration: none; font-size: var(--fs-md); font-weight: 600;
}
.rr-link:hover { background: var(--c-primary-weak); border-color: var(--c-primary); }

@media (max-width: 480px) {
    .rr-item-btn { gap: var(--sp-2); padding: var(--sp-2); }
    .rr-time { min-width: 54px; padding-right: var(--sp-2); }
    .rr-links { flex-direction: column; }
    .rr-link { justify-content: center; }
}
</style>
