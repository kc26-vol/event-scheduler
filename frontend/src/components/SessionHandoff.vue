<!-- 同じ場所の、直前 / 直後の担当。
     セッションを開いたときに「誰から引き継ぎ、誰に渡すのか」がその場で
     分かるようにする。10分より離れていれば引き継ぎではないので何も出さない
     (判定は useHandoff)。 -->
<template>
    <div v-if="handoff.prev.length || handoff.next.length" class="ho">
        <div class="ho-head">
            <strong class="ho-label">引き継ぎ</strong>
            <span class="ho-scope">同じ場所</span>
        </div>

        <div
            v-for="row in rows"
            :key="row.dir + row.side.entry.session.id"
            class="ho-row"
            :class="`is-${row.dir}`"
        >
            <span class="ho-dir">{{ row.dir === 'prev' ? '前' : '次' }}</span>

            <div class="ho-body">
                <div class="ho-line">
                    <TimeRange
                        :start="row.side.entry.session.start_time"
                        :end="row.side.entry.session.end_time"
                        :show-date="!sameDay(row.side.entry.session.start_time)"
                        size="sm"
                        inline />
                    <span class="ho-gap">{{ gapText(row) }}</span>
                    <span class="ho-cat">{{ catLabel(row.side.entry.session.category) }}</span>
                </div>

                <div class="ho-title">{{ row.side.entry.session.title }}</div>

                <div class="ho-people">
                    <span v-if="row.side.entry.session.required_staff === -1" class="badge ho-all">全員</span>
                    <template v-else>
                        <PersonChip
                            v-for="a in row.side.entry.assigned_staff"
                            :key="a.assignment_id"
                            :staff="a.staff"
                            size="sm">
                            <span v-if="a.staff.id === myStaffId" class="ho-you">自分</span>
                        </PersonChip>
                    </template>
                </div>
            </div>
        </div>
    </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import PersonChip from './PersonChip.vue'
import TimeRange from './TimeRange.vue'
import { useStore } from '../store'
import { useMe } from '../composables/useMe'
import { useHandoff, type HandoffSide, type HandoffTarget } from '../composables/useHandoff'
import { isSameDay } from '../utils/datetime'

const props = defineProps<{ session: HandoffTarget | null }>()

const { catLabel } = useStore()
const { myStaffId } = useMe()

const handoff = useHandoff(() => props.session)

type Row = { dir: 'prev' | 'next'; side: HandoffSide }

// 前 → 次 の順。時系列で読めるようにする。
const rows = computed<Row[]>(() => [
    ...handoff.value.prev.map(side => ({ dir: 'prev' as const, side })),
    ...handoff.value.next.map(side => ({ dir: 'next' as const, side })),
])

/** 同じ日なら日付を省く。日をまたぐ引き継ぎは滅多にないが、出たときは要る。 */
function sameDay(value: string): boolean {
    return isSameDay(value, props.session?.start_time)
}

function gapText(row: Row): string {
    if (row.side.gapMin === 0) return row.dir === 'prev' ? '直前' : 'すぐ'
    return row.dir === 'prev' ? `${row.side.gapMin}分前` : `${row.side.gapMin}分後`
}
</script>

<style scoped>
.ho {
    margin-top: var(--sp-4);
    padding: var(--sp-3);
    background: var(--c-surface-2);
    border: 1px solid var(--c-border);
    border-radius: var(--r-md);
}

.ho-head { display: flex; align-items: baseline; gap: var(--sp-2); margin-bottom: var(--sp-2); }
.ho-label { font-size: var(--fs-sm); }
.ho-scope { font-size: var(--fs-xs); color: var(--c-text-3); }

.ho-row { display: flex; gap: var(--sp-2); padding: var(--sp-2) 0; }
.ho-row + .ho-row { border-top: 1px dashed var(--c-border); }

/* 前 / 次 は色で分ける。並んだときにどちらへ渡すのかを取り違えない。 */
.ho-dir {
    flex-shrink: 0; align-self: flex-start;
    min-width: 2em; text-align: center;
    font-size: var(--fs-xs); font-weight: 700; line-height: 1.6;
    padding: 1px var(--sp-2); border-radius: var(--r-full); color: #fff;
}
.is-prev .ho-dir { background: var(--c-text-3); }
.is-next .ho-dir { background: var(--c-primary); }

.ho-body { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 3px; }
.ho-line { display: flex; align-items: baseline; flex-wrap: wrap; gap: var(--sp-2); }
.ho-gap { font-size: var(--fs-xs); font-weight: 600; color: var(--c-text-3); }
.ho-cat { font-size: var(--fs-xs); color: var(--c-text-2); }

.ho-title {
    font-size: var(--fs-sm); color: var(--c-text-2);
    overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}

.ho-people { display: flex; flex-wrap: wrap; gap: var(--sp-1); margin-top: 2px; }
.ho-all { background: #e65100; color: #fff; }
.ho-you {
    font-size: var(--fs-xs); font-weight: 700; color: var(--c-primary);
}
</style>
