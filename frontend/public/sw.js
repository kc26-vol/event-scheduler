/* Service Worker — 会場でつながらないときも担当表が読めるようにする。
 *
 * 想定している状況は「会場の電波が悪い / 一時的に切れた」であって、
 * 「最初から一度もつながらない」ではない。一度オンラインで開いていれば、
 * その時点のデータで閲覧できる。
 *
 * ## 3種類のキャッシュ
 *
 * | 名前     | 中身                        | 戦略                       |
 * |----------|-----------------------------|----------------------------|
 * | shell    | index.html + /assets/*      | precache → cache-first     |
 * | data     | 読み取り専用 API (許可制)   | network-first → cache      |
 * | media    | /uploads/* (写真・会場地図)  | cache-first                |
 *
 * shell を install 時に precache するのは、画面がルート単位で分割されている
 * ため (frontend/src/router.ts の動的 import)。実行時キャッシュだけだと
 * 「オンラインのときに一度も開いていない画面」がオフラインで白くなる。
 * precache する URL の一覧はビルド時に生成する (frontend/vite.config.ts)。
 *
 * 同じ理由で、data も起動のたびに穴を埋める (warmOfflineData)。画面が
 * 出せても中身が無ければ読み込み中のまま止まるため。
 *
 * ## 認証との関係 (重要)
 *
 * このアプリは共通パスワード認証の内側にある (app/auth_middleware.py)。
 * セッションが切れていると、あらゆるパスが 302 で /login.html に飛ぶ。
 * 素直にキャッシュすると `/assets/index-xxxx.js` の中身がログイン画面の
 * HTML になり、以後オフラインで永久に壊れる。
 * そのため保存前に必ず isStorable() を通し、リダイレクトされた応答・
 * 200 以外・想定外の HTML を弾いている。
 *
 * ## 更新のしかた
 *
 * skipWaiting() は呼ばない。新しい SW は waiting のまま待ち、すべてのタブが
 * 閉じられてから活性化する。オンラインならナビゲーションは network-first
 * なので、SW が古いままでも配信される HTML / アセットは最新であり、
 * SW の版が支配するのはオフライン時の内容だけ。
 * 代わりに clients.claim() は呼ぶ。初回インストール直後 (待つべき前任者が
 * 居ない場合) から、リロードを挟まずオフライン対応が効くようにするため。
 */

// ビルド時に生成される。self.__ES_PRECACHE = { version, urls } を定義する。
// importScripts したファイルの中身も SW の更新判定に含まれるので、
// デプロイでハッシュが変われば新しい SW として扱われる。
try {
    importScripts('/precache-manifest.js')
} catch (e) {
    // 未ビルド (開発サーバー) や取得失敗時。precache は諦め、実行時キャッシュだけで動く。
}

const PRECACHE = self.__ES_PRECACHE || { version: 'dev', urls: [] }

const SHELL_CACHE = `es-shell-${PRECACHE.version}`
// data / media は URL の中身が変わらない (uploads は UUID 名、API はキーが固定) ため
// 版を跨いで持ち越す。名前に版を入れると、デプロイのたびにオフライン用の
// データが空になり「更新直後に電波が無い」人が何も見られなくなる。
const DATA_CACHE = 'es-data-v1'
const MEDIA_CACHE = 'es-media-v1'
const KEEP = new Set([SHELL_CACHE, DATA_CACHE, MEDIA_CACHE])

const SHELL_FALLBACK = '/index.html'

/* オフラインでも読めるようにする GET API。
 *
 * 許可制にしているのは、含めてはいけないものがあるため。
 * /api/public-api/settings は公開APIキーと GitHub トークンを返す。
 * 端末のキャッシュに残す価値がない一方、残す危険はある。
 * 「増えたAPIは自動で入る」より「入るものを明示する」を選ぶ。
 *
 * app/api_cache.py の _CACHEABLE_PATHS と対応している (+ /api/settings/)。 */
const DATA_PATHS = new Set([
    '/api/rooms/',
    '/api/sessions/',
    '/api/staffs/',
    '/api/categories/',
    '/api/session-groups/',
    '/api/venue-maps/',
    '/api/assignments/schedule',
    '/api/assignments/staff-schedule',
    '/api/settings/',
])

// キャッシュから返したことと、その中身をいつ取得したかを画面に伝えるヘッダー。
// frontend/src/composables/useConnection.ts が読む。
const H_FROM_CACHE = 'X-ES-Offline-Cache'
const H_CACHED_AT = 'X-ES-Cached-At'

/** HTML を返してよい URL か (= アプリの殻そのもの)。 */
function isShellDoc(url) {
    const path = new URL(url, self.location.origin).pathname
    return path === '/' || path === SHELL_FALLBACK
}

/** 保存してよい応答か。HTML が紛れ込むのを防ぐのが主目的。
 *
 * このアプリは 200 で HTML を返す経路が2つある。どちらも素直にキャッシュすると
 * `/assets/index-xxxx.js` の中身が HTML になり、オフラインでその画面だけが
 * 壊れる。オンラインでは何も起きないので、会場で初めて気付くことになる。
 *
 * 1. 認証切れ … 302 で /login.html に飛ぶ。追跡後の応答は 200 なので、
 *    redirected を見て弾く。
 * 2. SPA 配信 … 実ファイルが無いパスに index.html を 200 で返す
 *    (app/main.py の SPAStaticFiles)。リダイレクトではないので redirected では
 *    捕まらない。precache の一覧がビルドとずれると、消えたアセットの URL に
 *    HTML が入る。Content-Type で弾く。 */
function isStorable(url, res) {
    if (!res || res.status !== 200 || res.redirected || res.type === 'opaque') return false
    const isHtml = (res.headers.get('content-type') || '').includes('text/html')
    return !isHtml || isShellDoc(url)
}

/** 応答を作り直す。ヘッダーの差し替えのため。
 *
 * Content-Encoding / Content-Length は落とす。fetch() が返す body は既に
 * 解凍済みなのに、ヘッダーには Content-Encoding: gzip が残っているため
 * (app/compression.py)。そのまま保存して返すと申告と実体が食い違う。 */
function rebuild(res, body, extra) {
    const headers = new Headers()
    res.headers.forEach((value, key) => {
        const k = key.toLowerCase()
        if (k === 'content-encoding' || k === 'content-length') return
        headers.set(key, value)
    })
    for (const [key, value] of Object.entries(extra || {})) headers.set(key, value)
    return new Response(body, { status: res.status, statusText: res.statusText, headers })
}

/** この本文がサーバーで作られた時刻。「最終更新」の表示はこれを見る。
 *
 * Date.now() を使わないのは、ブラウザの HTTP キャッシュ (max-age=180、
 * app/api_cache.py) が応えた場合に「たった今」と嘘をつくため。応答自身の
 * Date ヘッダーなら、どのキャッシュを経由しても本文が作られた時刻を指す。
 *
 * ただし Date はサーバーの時計で、比較する側は端末の時計。ずれていると
 * 大きく外れるので、max-age の幅を超える古さは信じない。これで誤差は
 * 「Date.now() を使った場合の誤差」以下に収まり、時計が正しければ正確になる。 */
function producedAt(res) {
    const now = Date.now()
    const date = Date.parse(res.headers.get('date') || '')
    if (!Number.isFinite(date)) return now
    const maxAge = /max-age=(\d+)/.exec(res.headers.get('cache-control') || '')
    const cap = maxAge ? Number(maxAge[1]) * 1000 : 0
    return now - Math.min(Math.max(now - date, 0), cap)
}

/* 直近にネットワークで失敗したか。
 *
 * HTTP キャッシュが応えた場合、SW から見ると fetch は普通に成功する。
 * 外に出られたのか、手元のキャッシュが答えたのかを区別できない。
 * このままだと圏外で開いても最大 max-age 秒のあいだ「オンライン」に見え、
 * オフラインの知らせがその分遅れる。
 *
 * そこで別の要求で起きた失敗を手掛かりにする。圏外で開いたときは、まず
 * ナビゲーション自体が失敗する。その直後に成功して見える取得は、
 * ネットワークではなくキャッシュが答えたものと見なせる。 */
let _failedAt = 0
const OFFLINE_HINT_MS = 10_000

function noteNetworkFailure() { _failedAt = Date.now() }
function offlineHinted() { return Date.now() - _failedAt < OFFLINE_HINT_MS }

// ---------------------------------------------------------------------------
// ライフサイクル
// ---------------------------------------------------------------------------
self.addEventListener('install', (event) => {
    event.waitUntil((async () => {
        const cache = await caches.open(SHELL_CACHE)
        // addAll を使わないのは、応答の中身を検査してから保存したいため
        // (上の「認証との関係」)。1本の失敗で install 全体を落とさないよう
        // 個別に握り潰す — precache が欠けても実行時キャッシュで埋まる。
        await Promise.all(PRECACHE.urls.map(async (url) => {
            try {
                const res = await fetch(url, { cache: 'reload', credentials: 'same-origin' })
                if (isStorable(url, res)) await cache.put(url, rebuild(res, await res.arrayBuffer()))
            } catch (e) {
                /* 個別の失敗は無視 */
            }
        }))
    })())
})

self.addEventListener('activate', (event) => {
    event.waitUntil((async () => {
        const names = await caches.keys()
        await Promise.all(
            names.filter(n => n.startsWith('es-') && !KEEP.has(n)).map(n => caches.delete(n))
        )
        await self.clients.claim()
    })())
})

// 画面側 (frontend/src/App.vue) が初期ロードを終えたら知らせてくる
self.addEventListener('message', (event) => {
    if (event.data && event.data.type === 'ES_WARM') event.waitUntil(warmOfflineData())
})

// ---------------------------------------------------------------------------
// オフライン用の下地を埋める
// ---------------------------------------------------------------------------

/* 起動時のロードは「その画面に必要なもの」しか取らない (store.ts の
 * _initialLoad / _enterTab)。そのため会場地図のように「開くまで取らない」
 * データは、オンラインで一度もその画面を開いていないとキャッシュに無く、
 * オフラインで読み込み中の見た目のまま止まる。
 *
 * 会場に居る人が電波を失ったときに一番困るのがフロアマップなので、
 * ここで先に埋めておく。呼ばれるのは初期表示の通信が済んだあと。 */
const WARM_STALE_MS = 10 * 60 * 1000
// 地図は数枚のはず。想定外の枚数を一気に取りに行かないよう上限を置く。
const WARM_IMAGE_LIMIT = 20

async function warmOfflineData() {
    const cache = await caches.open(DATA_CACHE)
    for (const path of DATA_PATHS) {
        const hit = await cache.match(path)
        // 既にあって新しければ触らない。画面を開いたときの network-first が更新する。
        if (hit && Date.now() - Number(hit.headers.get(H_CACHED_AT) || 0) < WARM_STALE_MS) continue
        await warmOne(cache, path)
    }
    await warmVenueMapImages(cache)
}

/** 1本取ってキャッシュに入れる。失敗は無視 (次の起動でまた試す)。 */
async function warmOne(cache, url) {
    try {
        const res = await fetch(url, { credentials: 'same-origin' })
        if (!isStorable(url, res)) return
        await cache.put(url, rebuild(res, await res.arrayBuffer(), {
            [H_CACHED_AT]: String(producedAt(res)),
        }))
    } catch (e) {
        noteNetworkFailure()
    }
}

/** フロアマップの画像そのもの。一覧だけあっても、画像が無ければ用をなさない。 */
async function warmVenueMapImages(dataCache) {
    const hit = await dataCache.match('/api/venue-maps/')
    if (!hit) return
    let maps
    try {
        maps = await hit.json()
    } catch (e) {
        return
    }
    if (!Array.isArray(maps)) return

    const media = await caches.open(MEDIA_CACHE)
    const urls = maps.map(m => m && m.image).filter(u => typeof u === 'string' && u.startsWith('/uploads/'))
    for (const url of urls.slice(0, WARM_IMAGE_LIMIT)) {
        if (await media.match(url)) continue
        try {
            const res = await fetch(url, { credentials: 'same-origin' })
            if (isStorable(url, res)) await media.put(url, rebuild(res, await res.arrayBuffer()))
        } catch (e) {
            noteNetworkFailure()
        }
    }
}

// ---------------------------------------------------------------------------
// 戦略
// ---------------------------------------------------------------------------

/** 中身が変わらない URL 用 (ハッシュ付きアセット / UUID 名の画像)。 */
async function cacheFirst(request, cacheName) {
    const cache = await caches.open(cacheName)
    const hit = await cache.match(request)
    if (hit) return hit
    try {
        const res = await fetch(request)
        if (isStorable(request.url, res)) await cache.put(request, rebuild(res, await res.clone().arrayBuffer()))
        return res
    } catch (err) {
        noteNetworkFailure()
        throw err
    }
}

/** 読み取り専用 API 用。つながれば最新、つながらなければ前回の中身。 */
async function dataNetworkFirst(request) {
    const cache = await caches.open(DATA_CACHE)
    try {
        const res = await fetch(request)
        if (!isStorable(request.url, res)) return res

        const body = await res.clone().arrayBuffer()
        const stamp = { [H_CACHED_AT]: String(producedAt(res)) }
        await cache.put(request, rebuild(res, body, stamp))
        // 直前にネットワークで失敗している = これはどこかのキャッシュが答えた
        if (offlineHinted()) return rebuild(res, body, { ...stamp, [H_FROM_CACHE]: '1' })
        // 成功時も刻んだものを返す。画面が「最終更新」に使う時刻を、
        // HTTP キャッシュ経由かどうかに関わらず本文の実際の鮮度に合わせるため。
        return rebuild(res, body, stamp)
    } catch (err) {
        noteNetworkFailure()
        const hit = await cache.match(request)
        if (hit) return rebuild(hit, await hit.arrayBuffer(), { [H_FROM_CACHE]: '1' })
        throw err
    }
}

/** 画面遷移。オンラインなら常にサーバーの HTML (デプロイ直後に古い殻を出さない)。 */
async function navigate(request) {
    try {
        return await fetch(request)
    } catch (err) {
        noteNetworkFailure()
        const cache = await caches.open(SHELL_CACHE)
        const hit = await cache.match(SHELL_FALLBACK)
        if (hit) return hit
        throw err
    }
}

self.addEventListener('fetch', (event) => {
    const request = event.request

    // 更新系は素通し。オフラインで編集を溜める仕組みは持たない
    // (配置の衝突をどう解くかという別の問題になるため)。
    if (request.method !== 'GET') return

    const url = new URL(request.url)
    if (url.origin !== self.location.origin) return

    if (request.mode === 'navigate') {
        event.respondWith(navigate(request))
        return
    }

    if (url.pathname.startsWith('/assets/')) {
        event.respondWith(cacheFirst(request, SHELL_CACHE))
        return
    }

    if (url.pathname.startsWith('/uploads/')) {
        event.respondWith(cacheFirst(request, MEDIA_CACHE))
        return
    }

    if (DATA_PATHS.has(url.pathname)) {
        event.respondWith(dataNetworkFirst(request))
        return
    }

    // /auth/*、/public/*、許可外の /api/*、アイコン等はそのまま通す。
})
