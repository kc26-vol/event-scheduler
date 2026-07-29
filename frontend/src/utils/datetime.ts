// 日時整形のヘルパー。
//
// store.ts にも fmt / fmtShort があるが、あれはストアのクロージャ内にあり
// 単体で import できない。コンポーネントから使えるものをここに置く。
// 表示は端末のローカルタイムゾーン基準 (会場に居る人が見る前提)。

const WEEKDAYS = ['日', '月', '火', '水', '木', '金', '土']

export function toDate(value: string | Date | null | undefined): Date | null {
    if (!value) return null
    const d = value instanceof Date ? value : new Date(value)
    return Number.isNaN(d.getTime()) ? null : d
}

/** "12:05" */
export function hhmm(value: string | Date | null | undefined): string {
    const d = toDate(value)
    if (!d) return ''
    return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

/** "7/29" */
export function md(value: string | Date | null | undefined): string {
    const d = toDate(value)
    if (!d) return ''
    return `${d.getMonth() + 1}/${d.getDate()}`
}

/** "7/29(火)" */
export function mdw(value: string | Date | null | undefined): string {
    const d = toDate(value)
    if (!d) return ''
    return `${md(d)}(${WEEKDAYS[d.getDay()]})`
}

/** ローカル日付の "YYYY-MM-DD"。Date.toISOString() はUTCに寄るので使わない。 */
export function dateKey(value: string | Date | null | undefined): string {
    const d = toDate(value)
    if (!d) return ''
    const p = (n: number) => String(n).padStart(2, '0')
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

export function isSameDay(a: string | Date | null | undefined, b: string | Date | null | undefined): boolean {
    const ka = dateKey(a)
    return ka !== '' && ka === dateKey(b)
}

/** 分数。開始・終了のどちらかが不正なら null */
export function durationMin(start: string | Date | null | undefined, end: string | Date | null | undefined): number | null {
    const s = toDate(start)
    const e = toDate(end)
    if (!s || !e) return null
    return Math.round((e.getTime() - s.getTime()) / 60000)
}

/** 90 -> "1時間30分" / 45 -> "45分" / 120 -> "2時間" */
export function humanDuration(minutes: number | null): string {
    if (minutes === null || minutes < 0) return ''
    const h = Math.floor(minutes / 60)
    const m = minutes % 60
    if (h === 0) return `${m}分`
    if (m === 0) return `${h}時間`
    return `${h}時間${m}分`
}

/**
 * 過去方向の相対表現。"たった今" / "12分前" / "3時間前" / "7/29 14:05"。
 *
 * 1日以上前は相対表現をやめる。「28時間前」と言われても、それが今日の朝か
 * 昨日の夜かを頭で戻す手間が増えるだけなので、日付と時刻をそのまま出す。
 */
export function agoText(target: number | string | Date | null | undefined, now: Date): string {
    const d = target === null || target === undefined
        ? null
        : toDate(typeof target === 'number' ? new Date(target) : target)
    if (!d) return ''
    const diffSec = Math.round((now.getTime() - d.getTime()) / 1000)
    // 端末の時計が進んでいる場合など、未来を指していたら「たった今」に丸める
    if (diffSec < 60) return 'たった今'
    const diffMin = Math.floor(diffSec / 60)
    if (diffMin < 60) return `${diffMin}分前`
    const h = Math.floor(diffMin / 60)
    if (h < 24) return `${h}時間前`
    return `${md(d)} ${hhmm(d)}`
}

/**
 * 現在時刻との相対表現。
 * 未来なら "あと25分" / "あと2時間"、過去なら "" を返す。
 */
export function untilText(target: string | Date | null | undefined, now: Date): string {
    const d = toDate(target)
    if (!d) return ''
    const diffMin = Math.round((d.getTime() - now.getTime()) / 60000)
    if (diffMin < 0) return ''
    if (diffMin < 1) return 'まもなく'
    if (diffMin < 60) return `あと${diffMin}分`
    const h = Math.floor(diffMin / 60)
    const m = diffMin % 60
    if (h < 24) return m === 0 ? `あと${h}時間` : `あと${h}時間${m}分`
    return `あと${Math.floor(h / 24)}日`
}
