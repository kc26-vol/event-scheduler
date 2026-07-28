// 「あるスタッフの担当」と「そのうち今どれか」を出す。
//
// マイページ (閲覧対象) とサイドバー (自分) の両方が同じ判定を使うために
// 切り出している。判定がずれると、サイドバーは「次」なのに本文は「進行中」
// といった食い違いが起きる。
import { computed, onScopeDispose, ref, type Ref } from 'vue'
import { useStore } from '../store'
import { toDate } from '../utils/datetime'
import type { Session } from '../types'

// 現在時刻はアプリ全体で1本。コンポーネントごとに setInterval を持つと
// 更新タイミングが数十秒ずれ、画面の中で状態が食い違う。
const now = ref(new Date())
let users = 0
let timer = 0

const TICK_MS = 30_000

/** 30秒ごとに進む共有の現在時刻。参照者がいなくなればタイマーも止まる。 */
export function useNow(): Ref<Date> {
    if (users === 0) {
        now.value = new Date()
        timer = window.setInterval(() => { now.value = new Date() }, TICK_MS)
    }
    users++
    onScopeDispose(() => {
        users--
        if (users === 0) {
            window.clearInterval(timer)
            timer = 0
        }
    })
    return now
}

export function useShiftsOf(staffId: Ref<number | null>) {
    const { staffAssignmentsWithAll } = useStore()
    const now = useNow()

    /** 開始時刻順。「全員」対象の全体セッションもマージ済みのものを使う。 */
    const shifts = computed<Session[]>(() => {
        const id = staffId.value
        if (id === null) return []
        const entry = staffAssignmentsWithAll.value.find(e => e.staff.id === id)
        if (!entry) return []
        return [...entry.assigned_sessions].sort((a, b) =>
            (a.start_time || '').localeCompare(b.start_time || '')
        )
    })

    const current = computed(() => {
        const t = now.value.getTime()
        return shifts.value.find(s => {
            const st = toDate(s.start_time)?.getTime()
            const en = toDate(s.end_time)?.getTime()
            return st !== undefined && en !== undefined && st <= t && t < en
        }) ?? null
    })

    const next = computed(() => {
        const t = now.value.getTime()
        return shifts.value.find(s => {
            const st = toDate(s.start_time)?.getTime()
            return st !== undefined && st > t
        }) ?? null
    })

    /** 開いたときに目を向けさせたい1件。進行中があればそれ、無ければ次。 */
    const anchor = computed(() => current.value ?? next.value)

    return { now, shifts, current, next, anchor }
}
