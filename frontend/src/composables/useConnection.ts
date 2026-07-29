// 「今つながっているか」と「表示中のデータをいつ取ったか」を持つシングルトン。
//
// navigator.onLine だけでは足りない。会場の Wi-Fi につながっているが外に
// 出られない (キャプティブポータル・上流の輻輳) 状態でも true を返すためで、
// これはまさに会場で起きる状況そのものである。
// そこで判定の主体は実際の通信結果に置き、navigator.onLine と online/offline
// イベントは「切れたことを即座に知る」ための補助として使う。
//
// 通信結果は store.ts の fetch ラッパーから流し込まれる。API 呼び出しが
// 1箇所を通る作りになっているので、各 load 関数に手を入れる必要がない。
//
// このモジュールは store.ts から import されるため、逆向きの import を
// 持ってはいけない (循環参照になる)。再取得の指示は ConnectionToast.vue が
// 担当する。
import { readonly, ref } from 'vue'

/** SW がキャッシュから返した応答に付ける印 (frontend/public/sw.js と対応)。 */
const H_FROM_CACHE = 'X-ES-Offline-Cache'
const H_CACHED_AT = 'X-ES-Cached-At'

const _online = ref(typeof navigator === 'undefined' ? true : navigator.onLine !== false)
/** 最後にサーバーからデータを受け取った時刻 (ms)。未取得なら null。 */
const _lastSyncAt = ref<number | null>(null)

if (typeof window !== 'undefined') {
    // offline イベントは信頼できる (OS がリンクの切断を検知している)。
    // online イベントは「つながったかもしれない」程度の意味しかないので、
    // ここでは online に戻さない。実際の取得が成功した時点で戻す。
    window.addEventListener('offline', () => { _online.value = false })
}

/**
 * API 応答を1件見て状態を更新する。
 *
 * SW のキャッシュから返ってきた場合は「取得できた」とは数えない。
 * 数えてしまうと、オフラインのまま画面を切り替えるたびに「最終更新: たった今」に
 * なり、表示が嘘になる。代わりにキャッシュに刻まれた取得時刻を採用する
 * (オフラインでリロードした直後は、これが唯一の手がかりになる)。
 */
export function noteResponse(res: Response): void {
    const stamped = Number(res.headers.get(H_CACHED_AT))
    const producedAt = Number.isFinite(stamped) && stamped > 0 ? stamped : null

    if (res.headers.get(H_FROM_CACHE)) {
        _online.value = false
        // 進めるだけ。オフライン中に古い資源を引いても表示を巻き戻さない
        if (producedAt !== null && producedAt > (_lastSyncAt.value ?? 0)) {
            _lastSyncAt.value = producedAt
        }
        return
    }
    if (!res.ok) return  // 401 や 500 は「つながってはいる」のでオフライン判定には使わない
    _online.value = true
    // Service Worker が本文の鮮度を刻んでくれている場合はそれを使う。
    // ブラウザの HTTP キャッシュ (max-age) が答えた分だけ、受信時刻より古い。
    _lastSyncAt.value = producedAt ?? Date.now()
}

/** fetch そのものが失敗した = ネットワークに出られなかった。 */
export function noteFailure(): void {
    _online.value = false
}

export function useConnection() {
    return {
        online: readonly(_online),
        lastSyncAt: readonly(_lastSyncAt),
    }
}
