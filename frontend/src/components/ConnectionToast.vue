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
import { useConnection } from '../composables/useConnection'
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

const agoLabel = computed(() => agoText(lastSyncAt.value, now.value))

const mode = computed<'offline' | 'online' | null>(() => {
    if (!online.value) return dismissed.value ? null : 'offline'
    return recovered.value ? 'online' : null
})

watch(online, (isOnline) => {
    if (isOnline) {
        recovered.value = true
        window.clearTimeout(recoverTimer)
        recoverTimer = window.setTimeout(() => { recovered.value = false }, 4000)
        dismissed.value = false
    } else {
        recovered.value = false
    }
})

/** 疎通を確かめ、通っていれば今の画面のデータを取り直す。
 *
 * 疎通確認に軽い GET を1本置いているのは、タブによっては _enterTab が何も
 * 取得しないため (設定画面など)。それだけを頼りにすると、そういう画面に
 * 居る間はいつまでも「オフライン」のままになる。
 *
 * 通っていなければ _enterTab には進まない。オフラインのまま 30 秒ごとに
 * 数本ずつ失敗する fetch を投げても、得るものがない。 */
async function refresh(): Promise<void> {
    if (retrying.value) return
    retrying.value = true
    try {
        // 切断中に取り込んだ max-age の残りではなく、新鮮な応答が欲しい
        bypassCacheFor(15_000)
        await fetch('/api/settings/')
        // 判定は store の fetch ラッパー経由で useConnection が済ませている。
        // Service Worker のキャッシュが答えただけなら、まだ外に出られていない。
        if (!online.value) return
        await _enterTab(tab.value)
    } catch {
        /* オフライン表示のまま。noteFailure() が呼ばれている */
    } finally {
        retrying.value = false
    }
}

function retry() {
    void refresh()
}

function dismiss() {
    if (mode.value === 'offline') dismissed.value = true
    else recovered.value = false
}

/* 圏内に戻ったら自動で追いつく。会場では「電波の悪い部屋から出る」ことで
 * 直るケースが多く、そのたびに再試行を押させたくない。
 * navigator.onLine の online イベントは当てにならない (つながった "かもしれない")
 * ので、それも含めて定期的に試すだけにしている。 */
const RETRY_MS = 30_000
let retryTimer = 0

function tick() {
    if (online.value) return
    if (document.visibilityState !== 'visible') return  // 裏のタブで通信を試みても意味がない
    void refresh()
}

function onVisible() {
    if (document.visibilityState === 'visible') tick()
}

onMounted(() => {
    retryTimer = window.setInterval(tick, RETRY_MS)
    window.addEventListener('online', tick)
    document.addEventListener('visibilitychange', onVisible)
})

onBeforeUnmount(() => {
    window.clearInterval(retryTimer)
    window.clearTimeout(recoverTimer)
    window.removeEventListener('online', tick)
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
