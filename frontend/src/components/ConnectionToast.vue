<!-- 接続状態のトースト。右下に出す。
     オフラインのときだけ出し、復帰したら短く知らせて消える。
     「最終更新」を添えているのは、オフラインだと分かっただけでは
     「今見えている担当表を信じてよいか」が決まらないため。 -->
<template>
    <Transition name="ct">
        <div v-if="mode" class="ct" :class="`ct-${mode}`" role="status" aria-live="polite">
            <span class="ct-ico" aria-hidden="true">{{ mode === 'offline' ? '&#9888;' : '&#10003;' }}</span>

            <div class="ct-body">
                <template v-if="mode === 'offline'">
                    <div class="ct-title">オフライン</div>
                    <div class="ct-sub">
                        <template v-if="lastSyncAt">最終更新: {{ agoLabel }}</template>
                        <template v-else>保存されたデータがありません</template>
                    </div>
                </template>
                <div v-else class="ct-title">オンラインに復帰しました</div>
            </div>

            <button
                v-if="mode === 'offline'"
                type="button"
                class="ct-retry"
                :disabled="retrying"
                @click="retry">
                {{ retrying ? '確認中…' : '再試行' }}
            </button>
            <button type="button" class="ct-close" aria-label="閉じる" @click="dismiss">&#10005;</button>
        </div>
    </Transition>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { noteReachable, useConnection } from '../composables/useConnection'
import { useNow } from '../composables/useShifts'
import { bypassCacheFor, useStore } from '../store'
import { agoText } from '../utils/datetime'

const { online, lastSyncAt } = useConnection()
const { tab, _enterTab } = useStore()
const now = useNow()

// 「オフラインだと知らせたあと、本人が閉じた」状態。復帰すれば解除する。
const dismissed = ref(false)
const retrying = ref(false)
// 復帰の知らせを出している間だけ true。出しっぱなしにはしない。
const recovered = ref(false)
let recoverTimer = 0

/* 圏内に戻ったら自動で追いつく。会場では「電波の悪い部屋から出る」ことで
 * 直るケースが多く、そのたびに再試行を押させたくない。
 *
 * 間隔は倍々に伸ばす。会場の外に持ち出したまま画面を開いておくと、一定間隔では
 * 失敗する要求が延々と積み上がる (実際に数百件になった)。復帰の見込みは時間が
 * 経つほど薄いので、待ちを長くしていく。本人の操作やタブへの復帰で最短に戻す。 */
const RETRY_MIN_MS = 30_000
const RETRY_MAX_MS = 5 * 60_000
let retryTimer = 0
let retryDelay = RETRY_MIN_MS

const agoLabel = computed(() => agoText(lastSyncAt.value, now.value))

const mode = computed<'offline' | 'online' | null>(() => {
    if (!online.value) return dismissed.value ? null : 'offline'
    return recovered.value ? 'online' : null
})

/** サーバーまで届くかを確かめる。
 *
 * どのキャッシュにも答えられない要求にする必要がある。手元の何かが答えると
 * 「復帰した」と誤判定するため、
 *   - `es_ping` を付けて Service Worker に素通しさせ (frontend/public/sw.js)
 *   - クエリを毎回変えて no-store も指定し、ブラウザの HTTP キャッシュも避ける。
 *
 * 届いたかどうかだけを見て、応答の内容は問わない。/api/settings/ を選んだのは
 * 十分小さく、クエリ付きの GET はサーバー側でもキャッシュされないため
 * (app/api_cache.py)。 */
async function reachable(): Promise<boolean> {
    try {
        await fetch(`/api/settings/?es_ping=${Date.now()}`, { cache: 'no-store' })
        return true
    } catch {
        return false  // ネットワークに出られなかった
    }
}

/** 疎通を確かめ、通っていれば今の画面のデータを取り直す。
 *
 * 疎通確認を別に置いているのは、タブによっては _enterTab が何も取得しないため
 * (設定画面など)。それだけを頼りにすると、そういう画面に居る間はいつまでも
 * 「オフライン」のままになる。 */
async function refresh(): Promise<void> {
    if (retrying.value) return
    retrying.value = true
    try {
        if (!(await reachable())) return
        // 届いた時点で復帰。取り直しが失敗しても、この判定は巻き戻さない
        noteReachable()
        // 切断中に取り込んだ max-age の残りではなく、新鮮な応答が欲しい
        bypassCacheFor(15_000)
        await _enterTab(tab.value)
    } catch {
        /* 取り直しの失敗は握る。接続状態の判定は fetch ラッパーが行う */
    } finally {
        retrying.value = false
    }
}

function retry() {
    retryDelay = RETRY_MIN_MS  // 手で押したなら、次の自動再試行も間隔を戻す
    void refresh()
}

function dismiss() {
    if (mode.value === 'offline') dismissed.value = true
    else recovered.value = false
}

function schedule(delay: number) {
    window.clearTimeout(retryTimer)
    retryTimer = window.setTimeout(tick, delay)
}

async function tick() {
    // 裏のタブで通信を試みても意味がない。
    //
    // navigator.onLine が false のときも試す。これを条件にすると、環境の都合で
    // 常に false を返す端末で永久に復帰できなくなる。「疑わしければ実際に試す」に
    // 寄せる — 外れても失敗する要求が1本増えるだけで済む。
    if (document.visibilityState === 'visible') await refresh()
    if (online.value) return  // 復帰したら下の watch がタイマーを止める
    retryDelay = Math.min(retryDelay * 2, RETRY_MAX_MS)
    schedule(retryDelay)
}

/** すぐ試す価値がある出来事 (復帰の兆し・タブに戻った) が起きた。 */
function tryNow() {
    if (online.value) return
    retryDelay = RETRY_MIN_MS
    schedule(0)
}

function onVisible() {
    if (document.visibilityState === 'visible') tryNow()
}

// 復帰の知らせと、再試行タイマーの開始・停止。
// 常設のタイマーを持たないので、オンラインのあいだは何も動かない。
watch(online, (isOnline) => {
    if (isOnline) {
        window.clearTimeout(retryTimer)
        retryDelay = RETRY_MIN_MS
        recovered.value = true
        window.clearTimeout(recoverTimer)
        recoverTimer = window.setTimeout(() => { recovered.value = false }, 4000)
        dismissed.value = false
    } else {
        recovered.value = false
        schedule(retryDelay)
    }
})

onMounted(() => {
    if (!online.value) schedule(retryDelay)
    window.addEventListener('online', tryNow)
    document.addEventListener('visibilitychange', onVisible)
})

onBeforeUnmount(() => {
    window.clearTimeout(retryTimer)
    window.clearTimeout(recoverTimer)
    window.removeEventListener('online', tryNow)
    document.removeEventListener('visibilitychange', onVisible)
})
</script>

<style scoped>
.ct {
    position: fixed;
    right: calc(var(--sp-4) + var(--safe-right));
    bottom: calc(var(--sp-4) + var(--safe-bottom));
    z-index: var(--z-toast);
    display: flex; align-items: center; gap: var(--sp-3);
    max-width: min(360px, calc(100vw - var(--sp-8)));
    padding: var(--sp-3) var(--sp-3) var(--sp-3) var(--sp-4);
    border-radius: var(--r-lg);
    background: var(--c-nav-bg); color: var(--c-nav-fg-strong);
    box-shadow: var(--sh-4);
    font-size: var(--fs-md); line-height: var(--lh-tight);
}

.ct-ico { flex-shrink: 0; font-size: 1.1rem; }
.ct-offline .ct-ico { color: var(--c-warn); }
.ct-online .ct-ico { color: #6ee7a8; }

.ct-body { min-width: 0; flex: 1; }
.ct-title { font-weight: 700; }
.ct-sub {
    margin-top: 2px; font-size: var(--fs-sm); color: var(--c-nav-fg);
    /* 「x分前」は 1分ごとに幅が変わる。折り返させると行数が揺れて目に付く */
    white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}

.ct-retry {
    flex-shrink: 0;
    min-height: var(--tap); padding: 0 var(--sp-3);
    border: 1px solid var(--c-nav-section); border-radius: var(--r-sm);
    background: none; color: var(--c-nav-fg-strong);
    font-size: var(--fs-sm); font-weight: 600; cursor: pointer;
}
.ct-retry:hover:not(:disabled) { background: var(--c-nav-hover); }
.ct-retry:disabled { opacity: 0.6; cursor: default; }

.ct-close {
    flex-shrink: 0;
    width: var(--tap); height: var(--tap);
    display: flex; align-items: center; justify-content: center;
    background: none; border: none; cursor: pointer;
    color: var(--c-nav-section); font-size: 0.9rem;
}
.ct-close:hover { color: var(--c-nav-fg-strong); }

/* 画面が狭いときは横幅を使い切る。右下に寄せたままだと
   「再試行」と本文が押し合って最終更新が省略されてしまう。 */
@media (max-width: 480px) {
    .ct {
        left: calc(var(--sp-3) + var(--safe-left));
        right: calc(var(--sp-3) + var(--safe-right));
        bottom: calc(var(--sp-3) + var(--safe-bottom));
        max-width: none;
    }
}

.ct-enter-active, .ct-leave-active { transition: opacity 0.2s, transform 0.2s; }
.ct-enter-from, .ct-leave-to { opacity: 0; transform: translateY(8px); }

@media (prefers-reduced-motion: reduce) {
    .ct-enter-active, .ct-leave-active { transition: none; }
}

@media print { .ct { display: none; } }
</style>
