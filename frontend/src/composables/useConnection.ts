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
 * **成功した応答で online に戻すことはしない。** 応答が来たことは「サーバーに
 * 届いた」ことを意味しないため。max-age=180 のブラウザ HTTP キャッシュ
 * (app/api_cache.py) が答えれば、サーバーが落ちていても fetch は成功する。
 * これを復帰と見なすと、切れている最中に「オンラインに復帰しました」と出る。
 *
 * online に戻せるのは noteReachable() だけ = キャッシュが答えられない疎通確認
 * だけ、と決めている。既定値は online なので、通常の起動では何もしなくてよい。
 */
export function noteResponse(res: Response): void {
    const stamped = Number(res.headers.get(H_CACHED_AT))
    const producedAt = Number.isFinite(stamped) && stamped > 0 ? stamped : null

    // Service Worker が自分のキャッシュから答えた = ネットワークには出られていない
    if (res.headers.get(H_FROM_CACHE)) {
        _online.value = false
    } else if (!res.ok) {
        return  // 401 や 500 は「つながってはいる」ので鮮度の話ではない
    }

    // 鮮度だけは進める。Service Worker が本文の作られた時刻を刻んでくれている
    // 場合はそれを使う (ブラウザの HTTP キャッシュが答えた分だけ受信時刻より古い)。
    // 進める方向にしか動かさない — オフライン中に古い資源を引いて表示が
    // 巻き戻るのを避けるため。
    const at = producedAt ?? (_online.value ? Date.now() : null)
    if (at !== null && at > (_lastSyncAt.value ?? 0)) _lastSyncAt.value = at
}

/** fetch そのものが失敗した = ネットワークに出られなかった。 */
export function noteFailure(): void {
    _online.value = false
}

/**
 * サーバーまで届いたことが確かめられた (ConnectionToast.vue の疎通確認)。
 *
 * 応答の内容は問わない。401 が返ったとしても「つながっている」ことは確かで、
 * それはオフラインとは別の問題 (セッション切れ) である。
 * lastSyncAt は触らない — 疎通の確認は、表示中のデータを新しくしない。
 */
export function noteReachable(): void {
    _online.value = true
}

export function useConnection() {
    return {
        online: readonly(_online),
        lastSyncAt: readonly(_lastSyncAt),
    }
}

