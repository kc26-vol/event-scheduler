// 一覧の絞り込みで使う正規化。
// 空白 (半角・全角) を無視するので「山田 太郎」を「山田太郎」でも引ける。
export function normalizeForSearch(s: string): string {
    return s.toLowerCase().replace(/[\s　]/g, '')
}

/** haystack のいずれかに query が部分一致するか。query が空なら常に true。 */
export function matchesQuery(query: string, ...haystack: (string | null | undefined)[]): boolean {
    const q = normalizeForSearch(query)
    if (!q) return true
    return normalizeForSearch(haystack.filter(Boolean).join(' ')).includes(q)
}
