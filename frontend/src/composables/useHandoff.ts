// 「同じ場所の、直前 / 直後の担当」を出す。
//
// 引き継ぎで知りたいのは「この持ち場を次に誰が受け取るか」なので、判定は
// 部屋だけで行い、カテゴリは見ない。受付案内 → 懇親会 のように、同じ持ち場を
// 別カテゴリへ渡すデータが実際にある。
//
// 同じ部屋で時間が重なっている担当は、引き継ぎ相手ではなく「並行して立って
// いる人」なので外す (同じフロアで Coffee Break と Solutions Showcase が
// 同時に走る、という形のデータが実際にある)。
//
// 配置が空のものも出さない。名前が出ないのに枠だけ出しても、引き継ぎ先を
// 探す助けにはならないため。
import { computed } from 'vue'
import { useStore } from '../store'
import { toDate } from '../utils/datetime'
import type { ScheduleEntry } from '../types'

/** これ以上離れていたら引き継ぎとは見なさない (分) */
export const HANDOFF_WINDOW_MIN = 10

/** 引き継ぎの相手 1件 */
export interface HandoffSide {
    entry: ScheduleEntry
    /** 自分の担当との間隔 (分)。0 = 隙間なく続く */
    gapMin: number
}

export interface Handoff {
    /** 直前にこの場所を担当している (自分が引き継ぐ相手) */
    prev: HandoffSide[]
    /** 直後にこの場所を担当する (自分が引き継ぐ先) */
    next: HandoffSide[]
}

/** 判定対象。Session でも SessionSummary でも渡せるだけの項目。 */
export interface HandoffTarget {
    id: number
    room_id: number
    start_time: string
    end_time: string
}

function ms(value: string | null | undefined): number | null {
    return toDate(value)?.getTime() ?? null
}

/** 誰が入るのか分かるものだけを引き継ぎ相手として扱う */
function hasStaff(e: ScheduleEntry): boolean {
    return e.session.required_staff === -1 || e.assigned_staff.length > 0
}

export function findHandoff(
    target: HandoffTarget | null | undefined,
    schedule: ScheduleEntry[],
    windowMin: number = HANDOFF_WINDOW_MIN,
): Handoff {
    const prev: HandoffSide[] = []
    const next: HandoffSide[] = []
    if (!target) return { prev, next }

    const start = ms(target.start_time)
    const end = ms(target.end_time)
    if (start === null || end === null) return { prev, next }

    const limit = windowMin * 60_000
    // 同時に始まる (終わる) 担当が複数あることがあるので、最も近い1件では
    // なく「最も近い時刻に並ぶもの全部」を集める。
    let prevEnd = -Infinity
    let nextStart = Infinity

    for (const e of schedule) {
        const s = e.session
        if (s.id === target.id || s.room_id !== target.room_id) continue
        if (!hasStaff(e)) continue
        const es = ms(s.start_time)
        const ee = ms(s.end_time)
        if (es === null || ee === null) continue

        // 直後: 自分が終わったあとに始まるもの
        if (es >= end && es - end <= limit && es <= nextStart) {
            if (es < nextStart) {
                nextStart = es
                next.length = 0
            }
            next.push({ entry: e, gapMin: Math.round((es - end) / 60_000) })
        }
        // 直前: 自分が始まる前に終わるもの
        if (ee <= start && start - ee <= limit && ee >= prevEnd) {
            if (ee > prevEnd) {
                prevEnd = ee
                prev.length = 0
            }
            prev.push({ entry: e, gapMin: Math.round((start - ee) / 60_000) })
        }
    }

    return { prev, next }
}

/** 表示側から使う版。schedule はストアから取る。 */
export function useHandoff(target: () => HandoffTarget | null | undefined) {
    const { schedule } = useStore()
    return computed(() => findHandoff(target(), schedule.value))
}
