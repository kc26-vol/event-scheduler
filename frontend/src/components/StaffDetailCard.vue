<!-- スタッフ1人分の詳細 (プロフィール + 担当一覧)。
     スタッフ別詳細の1人表示・全員表示のどちらからも使う。 -->
<template>
    <section class="sdc">
        <header class="sdc-head">
            <AvatarIcon :name="entry.staff.name" :src="entry.staff.photo" :size="48" />
            <div class="sdc-head-text">
                <h3 class="sdc-name">
                    {{ entry.staff.name }}
                    <span v-if="entry.staff.slack_name" class="sdc-slack">a.k.a {{ entry.staff.slack_name }}</span>
                </h3>
                <div class="sdc-badges">
                    <span v-if="!roles.length" class="badge" style="background:#eceff1;color:#666">担当なし</span>
                    <span v-for="r in roles" :key="r" class="badge">{{ catLabel(r) }}</span>
                    <span v-if="entry.staff.english_ok" class="badge" style="background:#e0f2f1;color:#00695c">EN</span>
                    <span v-if="entry.staff.experience_count === 0" class="badge warn">初参加</span>
                    <span v-else class="badge avail">{{ entry.staff.experience_count }}回目</span>
                    <span class="badge" style="background:var(--c-primary-weak);color:var(--c-primary)">担当 {{ entry.assigned_sessions.length }}件</span>
                </div>
            </div>
        </header>

        <div v-if="entry.staff.availabilities?.length" class="sdc-avail">
            <span class="sdc-avail-label">活動可能時間</span>
            <span v-for="a in entry.staff.availabilities" :key="a.id" class="sdc-avail-item">
                <TimeRange :start="a.start_time" :end="a.end_time" size="sm" inline />
            </span>
        </div>

        <div v-if="days.length" class="sdc-shifts">
            <div v-for="(day, di) in days" :key="day.key" class="sdc-day">
                <div class="sdc-day-label">{{ day.label }}</div>
                <ShiftCard
                    v-for="s in day.sessions"
                    :key="'sds-' + s.id + '-' + di"
                    :session="s"
                    :co-staff="coStaffOf(s)"
                    :cat-label="labelFor(s)"
                    :accent="accentFor(s)"
                    :show-date="false"
                    @open="toggleSessionDetail(s.id)" />
            </div>
        </div>
        <p v-else class="sdc-none">{{ onlyDate ? 'この日の担当はありません' : '担当なし' }}</p>
    </section>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import AvatarIcon from './AvatarIcon.vue'
import ShiftCard from './ShiftCard.vue'
import TimeRange from './TimeRange.vue'
import { useStore } from '../store'
import { dateKey, mdw } from '../utils/datetime'
import type { SessionSummary, StaffBrief, StaffScheduleEntry } from '../types'

const props = withDefaults(defineProps<{
    entry: StaffScheduleEntry
    /** "YYYY-MM-DD"。指定するとその日の担当だけ表示する。 */
    onlyDate?: string
}>(), { onlyDate: '' })

const { schedule, catLabel, CAT_BG, toggleSessionDetail } = useStore()

const roles = computed(() => {
    const r = props.entry.staff.role
    if (!r) return []
    return Array.isArray(r) ? r : [r]
})

const days = computed(() => {
    const map = new Map<string, SessionSummary[]>()
    const sorted = [...props.entry.assigned_sessions].sort((a, b) =>
        (a.start_time || '').localeCompare(b.start_time || '')
    )
    for (const s of sorted) {
        const k = dateKey(s.start_time)
        if (!k) continue
        const list = map.get(k)
        if (list) list.push(s)
        else map.set(k, [s])
    }
    return [...map.entries()]
        .sort((a, b) => a[0].localeCompare(b[0]))
        .filter(([key]) => !props.onlyDate || key === props.onlyDate)
        .map(([key, sessions]) => ({ key, label: mdw(sessions[0].start_time), sessions }))
})

function coStaffOf(session: SessionSummary): StaffBrief[] {
    // 「全員」対象は全スタッフを並べても情報にならないので出さない
    if (session.required_staff === -1) return []
    const e = schedule.value.find(x => x.session.id === session.id)
    if (!e) return []
    return e.assigned_staff.map(a => a.staff).filter(s => s.id !== props.entry.staff.id)
}

function labelFor(session: SessionSummary): string {
    return session.required_staff === -1 ? `${catLabel(session.category)} · 全員` : catLabel(session.category)
}

function accentFor(session: SessionSummary): string {
    return CAT_BG.value[session.category]?.borderColor || 'var(--c-primary)'
}
</script>

<style scoped>
.sdc {
    border: 1px solid var(--c-border); border-radius: var(--r-md);
    padding: var(--sp-4); margin-bottom: var(--sp-4);
}
.sdc-head { display: flex; align-items: center; gap: var(--sp-3); margin-bottom: var(--sp-3); }
.sdc-head-text { min-width: 0; }
.sdc-name {
    display: flex; align-items: baseline; gap: var(--sp-2); flex-wrap: wrap;
    margin: 0; font-size: var(--fs-lg);
}
.sdc-slack { font-size: var(--fs-sm); font-weight: 400; color: var(--c-text-3); }
.sdc-badges { display: flex; flex-wrap: wrap; gap: 2px; margin-top: 2px; }

.sdc-avail {
    display: flex; align-items: center; flex-wrap: wrap; gap: var(--sp-2);
    margin-bottom: var(--sp-3); font-size: var(--fs-sm);
}
.sdc-avail-label { font-weight: 600; }
.sdc-avail-item {
    background: var(--c-success-weak); color: var(--c-success-text);
    border-radius: var(--r-sm); padding: 2px var(--sp-2);
}

.sdc-shifts { display: flex; flex-direction: column; gap: var(--sp-3); }
.sdc-day { display: flex; flex-direction: column; gap: var(--sp-2); }
.sdc-day-label {
    font-size: var(--fs-sm); font-weight: 700; color: var(--c-text-2);
    padding-bottom: 2px; border-bottom: 1px solid var(--c-border);
}
.sdc-none { color: var(--c-text-2); margin-top: var(--sp-2); font-size: var(--fs-md); }
</style>
