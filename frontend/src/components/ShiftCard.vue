<!-- 自分の担当1件。マイページのタイムラインの構成単位。
     左に TimeRange (日付 / 開始 / 終了 の縦積み)、右に内容。
     一緒に入るスタッフはアイコン付きチップで出す。 -->
<template>
    <component
        :is="clickable ? 'button' : 'div'"
        :type="clickable ? 'button' : undefined"
        class="shift-card"
        :class="[`is-${state}`, { 'is-clickable': clickable }]"
        :style="{ '--accent': accent }"
        @click="clickable && emit('open')"
    >
        <div class="sc-time">
            <TimeRange :start="session.start_time" :end="session.end_time" :show-date="showDate" size="md" />
            <!-- 「今どれか」は時刻の真下に置く。タイムラインを目で追うとき、
                 視線が時刻の列から離れずに済む。 -->
            <span v-if="stateChip" class="sc-state" :class="`is-${state}`">{{ stateChip }}</span>
        </div>

        <div class="sc-body">
            <div class="sc-head">
                <span v-if="catLabel" class="sc-cat">{{ catLabel }}</span>
                <!-- カウントダウンは次の1件だけ。全件に出すと数字が並びすぎて読めない。 -->
                <span v-if="countdown" class="sc-until">{{ countdown }}</span>
            </div>

            <div class="sc-title">{{ session.title }}</div>

            <div v-if="metaLine" class="sc-meta">{{ metaLine }}</div>

            <!-- 全員参加に近いセッションでは同担当が数十人になる。
                 既定は数人だけ出し、残りは畳んでカードの高さを抑える。 -->
            <div v-if="coStaff.length" class="sc-people">
                <span class="sc-people-label">一緒に</span>
                <PersonChip v-for="s in shownStaff" :key="s.id" :staff="s" size="xs" />
                <button
                    v-if="hiddenCount > 0"
                    type="button"
                    class="sc-more"
                    :aria-expanded="peopleExpanded"
                    @click.stop="peopleExpanded = !peopleExpanded"
                >
                    {{ peopleExpanded ? '閉じる' : `他 ${hiddenCount} 人` }}
                </button>
            </div>
        </div>
    </component>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import TimeRange from './TimeRange.vue'
import PersonChip from './PersonChip.vue'
import { durationMin, humanDuration, untilText } from '../utils/datetime'
import type { Session, Staff } from '../types'

const props = withDefaults(defineProps<{
    session: Session
    /** 同じセッションに入る他のスタッフ (本人は除いて渡す) */
    coStaff?: Staff[]
    catLabel?: string
    accent?: string
    showDate?: boolean
    state?: 'past' | 'now' | 'next' | 'future'
    /** カウントダウン計算の基準時刻。呼び出し側が一定間隔で更新する。 */
    now?: Date | null
    clickable?: boolean
    /** 「一緒に」で最初に見せる人数。超えた分は畳む。 */
    maxPeople?: number
}>(), {
    coStaff: () => [],
    catLabel: '',
    accent: 'var(--c-primary)',
    showDate: true,
    state: 'future',
    now: null,
    clickable: true,
    maxPeople: 4,
})

const emit = defineEmits<{ open: [] }>()

const peopleExpanded = ref(false)
const shownStaff = computed(() =>
    peopleExpanded.value ? props.coStaff : props.coStaff.slice(0, props.maxPeople)
)
const hiddenCount = computed(() => Math.max(0, props.coStaff.length - props.maxPeople))

const STATE_CHIP: Partial<Record<string, string>> = { now: '進行中', next: '次' }
const stateChip = computed(() => STATE_CHIP[props.state] ?? '')

const countdown = computed(() => {
    if (!props.now || props.state !== 'next') return ''
    return untilText(props.session.start_time, props.now)
})

/** "302号室 · 1時間30分" のように、あるものだけを中黒でつなぐ */
const metaLine = computed(() => {
    const parts: string[] = []
    const room = props.session.room?.name
    if (room && props.session.category !== 'overall') parts.push(room)
    const dur = humanDuration(durationMin(props.session.start_time, props.session.end_time))
    if (dur) parts.push(dur)
    return parts.join(' · ')
})
</script>

<style scoped>
.shift-card {
    display: flex;
    align-items: stretch;
    gap: var(--sp-3);
    width: 100%;
    text-align: left;
    font-family: inherit;
    background: var(--c-surface);
    border: 1px solid var(--c-border);
    border-left: 4px solid var(--accent);
    border-radius: var(--r-md);
    padding: var(--sp-3);
    transition: box-shadow .15s, border-color .15s;
}
.is-clickable { cursor: pointer; }
.is-clickable:hover { box-shadow: var(--sh-2); }
.is-clickable:focus-visible { outline: 2px solid var(--c-primary); outline-offset: 2px; }

/* 済んだ担当は沈める。ただし読めなくはしない。 */
.is-past { opacity: 0.5; }

/* 進行中と次は、並んだカードの中から目で拾えるように背景を起こす。
   色相はカテゴリ色 (--accent) から取るので、画面全体の配色とは喧嘩しない。
   color-mix 非対応ブラウザでは下の単色にフォールバックする。 */
.is-now, .is-next { border-color: var(--accent); }

.is-now {
    background: #fff8f7;
    background: color-mix(in srgb, var(--accent) 14%, var(--c-surface));
    border-left-width: 6px;
    box-shadow: var(--sh-2);
}
.is-next {
    background: #fafbfc;
    background: color-mix(in srgb, var(--accent) 6%, var(--c-surface));
    border-left-width: 6px;
}

.sc-time {
    flex-shrink: 0;
    /* 中央揃えだと、担当者が多くて背が高いカードで時刻が宙に浮く。
       タイトルと同じ高さに来るよう上揃えにする。 */
    display: flex; flex-direction: column; align-items: center; gap: 5px;
    min-width: 62px;
    padding-right: var(--sp-3);
    border-right: 1px solid var(--c-border);
}
.sc-state {
    font-size: var(--fs-xs); font-weight: 700; line-height: 1.4;
    padding: 2px var(--sp-2); border-radius: var(--r-full);
    white-space: nowrap; color: #fff;
}
/* 進行中は塗り、次は淡色。並べたときに優先順位が読める差をつける。 */
.sc-state.is-now { background: var(--c-danger); }
.sc-state.is-next { background: var(--c-primary); }

.sc-body { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 3px; }

.sc-head { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; }
.sc-cat {
    font-size: var(--fs-xs); font-weight: 700;
    color: var(--accent);
    background: color-mix(in srgb, var(--accent) 12%, transparent);
    padding: 1px var(--sp-2); border-radius: var(--r-full);
}
.sc-until { font-size: var(--fs-xs); font-weight: 600; color: var(--c-text-3); }

.sc-title {
    font-size: var(--fs-md); font-weight: 600; color: var(--c-text);
    line-height: var(--lh-tight);
    overflow-wrap: anywhere;
}
.sc-meta { font-size: var(--fs-sm); color: var(--c-text-2); }

.sc-people { display: flex; align-items: center; flex-wrap: wrap; gap: var(--sp-1); margin-top: 2px; }
.sc-people-label { font-size: var(--fs-xs); color: var(--c-text-3); flex-shrink: 0; }
.sc-more {
    background: none; border: 1px solid var(--c-border-strong); border-radius: var(--r-full);
    color: var(--c-text-2); font-size: var(--fs-xs); font-family: inherit;
    padding: 2px var(--sp-2); cursor: pointer;
}
.sc-more:hover { background: var(--c-surface-2); border-color: var(--c-text-3); }

@media (max-width: 480px) {
    .shift-card { gap: var(--sp-2); padding: var(--sp-2); }
    .sc-time { min-width: 54px; padding-right: var(--sp-2); }
}
</style>
