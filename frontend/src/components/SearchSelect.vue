<!-- 検索付きセレクト (コンボボックス)。
     素の <select> だと全件を目視しないと目当ての項目を見つけられないので、
     絞り込み・キーボード操作・任意描画のできるものに置き換える。

     ポップアップは body へ Teleport して fixed 配置する。
     .tl-wrapper や .panel など overflow を持つ祖先に切り取られるのを避けるため。
     狭い画面ではドロップダウンではなくボトムシートとして出す。 -->
<template>
    <div class="ss" ref="rootEl">
        <button
            ref="triggerEl"
            type="button"
            class="ss-trigger"
            :class="{ 'is-open': open, 'is-empty': !selected }"
            :disabled="disabled"
            :aria-expanded="open"
            aria-haspopup="listbox"
            :aria-label="ariaLabel"
            @click="toggle"
            @keydown="onTriggerKeydown"
        >
            <span class="ss-value">
                <slot name="selected" :option="selected">
                    <template v-if="selected">{{ selected.label }}</template>
                    <template v-else>{{ placeholder }}</template>
                </slot>
            </span>
            <span
                v-if="clearable && selected && !disabled"
                class="ss-clear"
                role="button"
                tabindex="-1"
                :aria-label="`${selected.label} の選択を解除`"
                @click.stop="clear"
            >&#10005;</span>
            <span class="ss-caret" aria-hidden="true">&#9662;</span>
        </button>

        <Teleport to="body">
            <div v-if="open" class="ss-backdrop" @click="close" @wheel.prevent @touchmove.prevent></div>
            <div
                v-if="open"
                ref="popupEl"
                class="ss-popup"
                :class="{ 'is-sheet': isSheet, 'has-keyboard': keyboardInset > 0 }"
                :style="popupStyle"
            >
                <div class="ss-search">
                    <input
                        ref="inputEl"
                        v-model="query"
                        type="text"
                        class="ss-input"
                        role="combobox"
                        aria-autocomplete="list"
                        :aria-controls="listId"
                        aria-expanded="true"
                        :aria-activedescendant="activeId"
                        :placeholder="searchPlaceholder"
                        autocomplete="off"
                        spellcheck="false"
                        @keydown="onInputKeydown"
                    >
                    <button v-if="isSheet" type="button" class="ss-close" @click="close">閉じる</button>
                </div>

                <ul :id="listId" class="ss-list" role="listbox" ref="listEl">
                    <li
                        v-for="(opt, i) in filtered"
                        :key="opt.value"
                        :id="`${listId}-opt-${i}`"
                        class="ss-opt"
                        :class="{ 'is-active': i === activeIndex, 'is-selected': opt.value === modelValue }"
                        role="option"
                        :aria-selected="opt.value === modelValue"
                        @click="pick(opt)"
                        @mousemove="activeIndex = i"
                    >
                        <slot name="option" :option="opt" :query="query">
                            <span class="ss-opt-label">{{ opt.label }}</span>
                            <span v-if="opt.sublabel" class="ss-opt-sub">{{ opt.sublabel }}</span>
                        </slot>
                    </li>
                    <li v-if="!filtered.length" class="ss-none">
                        {{ options.length ? '一致する項目がありません' : emptyText }}
                    </li>
                </ul>
            </div>
        </Teleport>
    </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue'
import { matchesQuery } from '../utils/search'

export interface SelectOption {
    value: string | number
    label: string
    /** label 以外に検索対象へ含めたい文字列 (アカウント名など) */
    keywords?: string
    sublabel?: string
    /** option スロットで使う任意データ */
    data?: any
}

const props = withDefaults(defineProps<{
    modelValue: string | number | null
    options: SelectOption[]
    placeholder?: string
    searchPlaceholder?: string
    emptyText?: string
    ariaLabel?: string
    clearable?: boolean
    disabled?: boolean
}>(), {
    placeholder: '選択してください',
    searchPlaceholder: '検索…',
    emptyText: '選択肢がありません',
    ariaLabel: '検索して選択',
    clearable: false,
    disabled: false,
})

const emit = defineEmits<{
    'update:modelValue': [value: string | number | null]
    change: [value: string | number | null]
}>()

let seq = 0
const listId = `ss-list-${++seq}-${Math.floor(performance.now())}`

const rootEl = ref<HTMLElement | null>(null)
const triggerEl = ref<HTMLButtonElement | null>(null)
const popupEl = ref<HTMLElement | null>(null)
const inputEl = ref<HTMLInputElement | null>(null)
const listEl = ref<HTMLElement | null>(null)

const open = ref(false)
const query = ref('')
const activeIndex = ref(0)
const isSheet = ref(false)
const popupStyle = ref<Record<string, string>>({})
/** ソフトキーボードが隠している高さ。0 より大きければキーボードが出ている。 */
const keyboardInset = ref(0)

const selected = computed(() => props.options.find(o => o.value === props.modelValue) ?? null)

const filtered = computed(() => {
    if (!query.value) return props.options
    return props.options.filter(o => matchesQuery(query.value, o.label, o.keywords, o.sublabel))
})

const activeId = computed(() =>
    filtered.value.length ? `${listId}-opt-${activeIndex.value}` : undefined
)

// 絞り込み結果が変わったらハイライトを先頭へ戻す (範囲外を指さないように)
watch(filtered, list => {
    if (activeIndex.value >= list.length) activeIndex.value = 0
})

const SHEET_BREAKPOINT = 480
const POPUP_MAX_H = 340
const POPUP_MIN_W = 240
const EDGE = 8   // 画面端に残す余白
const SHEET_MAX_VH = 0.72

/** 実際に見えている縦の範囲を、position: fixed と同じ座標系 (レイアウトビューポート) で返す。
 *
 *  スマホでソフトキーボードが出ても iOS Safari は innerHeight を縮めない。
 *  そのため bottom: 0 の要素はキーボードの裏に潜り込む。見えている範囲は
 *  visualViewport 側にしか出ないので、その差 (= inset) を測って足す。
 *  キーボードでレイアウトビューポート自体が縮む環境では inset が 0 になり、
 *  従来と同じ配置になる。 */
function visibleBox() {
    const vv = window.visualViewport
    if (!vv) {
        return { top: 0, bottom: window.innerHeight, height: window.innerHeight, inset: 0 }
    }
    // キーボードが開くと Safari は表示領域ごと上へずらすので offsetTop も見る
    const top = vv.offsetTop
    return {
        top,
        bottom: top + vv.height,
        height: vv.height,
        inset: Math.max(0, window.innerHeight - top - vv.height),
    }
}

function place() {
    const el = triggerEl.value
    if (!el) return
    isSheet.value = window.innerWidth <= SHEET_BREAKPOINT
    const vis = visibleBox()
    keyboardInset.value = vis.inset
    if (isSheet.value) {
        // キーボードの上端に載せる。高さも見えている範囲までに抑える
        // (絞り込みで中身が減るとシートが縮み、bottom: 0 のままだと
        //  シート全体がキーボードの裏に隠れてしまう)。
        const cap = Math.min(window.innerHeight * SHEET_MAX_VH, vis.height - EDGE * 2)
        popupStyle.value = {
            bottom: `${vis.inset}px`,
            maxHeight: `${Math.max(180, Math.round(cap))}px`,
        }
        return
    }
    const r = el.getBoundingClientRect()
    const below = vis.bottom - r.bottom
    const above = r.top - vis.top
    // 下に入らず上の方が広いなら上に出す
    const flip = below < 220 && above > below
    const maxH = Math.max(160, Math.min(POPUP_MAX_H, (flip ? above : below) - 12))

    // 横位置は「ポップアップ自身の幅」で決める。以前はトリガーの幅で左端を
    // 丸めていたため、右端に置いた小さなボタン (compact な PersonSwitcher など)
    // ではポップアップだけが画面外へはみ出していた。
    const width = Math.min(Math.max(r.width, POPUP_MIN_W), window.innerWidth - EDGE * 2)
    // 既定は左揃え。右にはみ出す場合はトリガーの右端に揃える (メニューとして自然)。
    let left = r.left
    if (left + width > window.innerWidth - EDGE) left = r.right - width
    left = Math.max(EDGE, Math.min(left, window.innerWidth - width - EDGE))

    popupStyle.value = {
        left: `${left}px`,
        width: `${width}px`,
        maxHeight: `${maxH}px`,
        ...(flip
            ? { bottom: `${window.innerHeight - r.top + 4}px` }
            : { top: `${r.bottom + 4}px` }),
    }
}

function watchViewport() {
    window.addEventListener('resize', place)
    // capture: 祖先のスクロールでもアンカーがずれるため
    window.addEventListener('scroll', place, true)
    // キーボードの開閉は resize ではなくこちらに出る (innerHeight が変わらない環境がある)
    window.visualViewport?.addEventListener('resize', place)
    window.visualViewport?.addEventListener('scroll', place)
}

function unwatchViewport() {
    window.removeEventListener('resize', place)
    window.removeEventListener('scroll', place, true)
    window.visualViewport?.removeEventListener('resize', place)
    window.visualViewport?.removeEventListener('scroll', place)
}

async function openPopup() {
    if (props.disabled) return
    query.value = ''
    const idx = filtered.value.findIndex(o => o.value === props.modelValue)
    activeIndex.value = idx >= 0 ? idx : 0
    open.value = true
    place()
    watchViewport()
    await nextTick()
    inputEl.value?.focus()
    scrollActiveIntoView()
}

function close() {
    if (!open.value) return
    open.value = false
    unwatchViewport()
    keyboardInset.value = 0
    triggerEl.value?.focus()
}

function toggle() {
    open.value ? close() : openPopup()
}

function pick(opt: SelectOption) {
    emit('update:modelValue', opt.value)
    emit('change', opt.value)
    close()
}

function clear() {
    emit('update:modelValue', null)
    emit('change', null)
}

function scrollActiveIntoView() {
    const list = listEl.value
    if (!list) return
    const el = list.children[activeIndex.value] as HTMLElement | undefined
    el?.scrollIntoView({ block: 'nearest' })
}

function move(delta: number) {
    const n = filtered.value.length
    if (!n) return
    activeIndex.value = (activeIndex.value + delta + n) % n
    nextTick(scrollActiveIntoView)
}

function onTriggerKeydown(e: KeyboardEvent) {
    if (['ArrowDown', 'ArrowUp', 'Enter', ' '].includes(e.key)) {
        e.preventDefault()
        openPopup()
    }
}

function onInputKeydown(e: KeyboardEvent) {
    switch (e.key) {
        case 'ArrowDown': e.preventDefault(); move(1); break
        case 'ArrowUp': e.preventDefault(); move(-1); break
        case 'Home': e.preventDefault(); activeIndex.value = 0; nextTick(scrollActiveIntoView); break
        case 'End': e.preventDefault(); activeIndex.value = filtered.value.length - 1; nextTick(scrollActiveIntoView); break
        case 'Enter': {
            e.preventDefault()
            const opt = filtered.value[activeIndex.value]
            if (opt) pick(opt)
            break
        }
        case 'Escape': e.preventDefault(); close(); break
        case 'Tab': close(); break
    }
}

onBeforeUnmount(unwatchViewport)
</script>

<style scoped>
.ss { position: relative; display: block; }

.ss-trigger {
    display: flex; align-items: center; gap: var(--sp-2);
    width: 100%; min-height: 38px;
    padding: 6px var(--sp-2) 6px var(--sp-3);
    background: var(--c-surface);
    border: 1px solid #ccc; border-radius: var(--r-md);
    font-size: var(--fs-md); font-family: inherit; color: var(--c-text);
    cursor: pointer; text-align: left;
    transition: border-color .15s, box-shadow .15s;
}
.ss-trigger:hover:not(:disabled) { border-color: var(--c-text-3); }
.ss-trigger:focus-visible,
.ss-trigger.is-open { outline: none; border-color: var(--c-primary); box-shadow: 0 0 0 3px var(--c-primary-weak); }
.ss-trigger:disabled { background: var(--c-surface-3); cursor: not-allowed; color: var(--c-text-3); }
.ss-trigger.is-empty .ss-value { color: var(--c-text-3); }

.ss-value { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.ss-caret { color: var(--c-text-2); font-size: 0.7rem; flex-shrink: 0; }
.ss-clear {
    flex-shrink: 0; color: var(--c-text-3); font-size: 0.85rem;
    padding: 0 var(--sp-1); border-radius: var(--r-sm); cursor: pointer;
}
.ss-clear:hover { color: var(--c-danger); background: var(--c-danger-weak); }

.ss-backdrop { position: fixed; inset: 0; z-index: var(--z-popover); background: transparent; }

.ss-popup {
    position: fixed; z-index: calc(var(--z-popover) + 1);
    display: flex; flex-direction: column;
    background: var(--c-surface);
    border: 1px solid var(--c-border-strong); border-radius: var(--r-md);
    box-shadow: var(--sh-4);
    overflow: hidden;
}

/* 狭い画面ではボトムシート。画面外にはみ出す事故が起きない。
   bottom と max-height は place() が実際に見えている範囲から入れる
   (キーボードの裏に入らないように)。ここの値はその前の 1 フレーム用。 */
.ss-popup.is-sheet {
    left: 0; right: 0; bottom: 0; top: auto;
    width: auto; max-height: 72vh;
    border-radius: var(--r-lg) var(--r-lg) 0 0;
    border-bottom: none;
    padding-bottom: var(--safe-bottom);
}
/* キーボードが出ている間はホームバーもその裏。余白を足すと見える範囲が減るだけ。 */
.ss-popup.is-sheet.has-keyboard {
    padding-bottom: 0;
    border-radius: var(--r-lg);
}
.ss-popup.is-sheet .ss-backdrop { background: rgba(0,0,0,0.3); }

.ss-search {
    display: flex; align-items: center; gap: var(--sp-2);
    padding: var(--sp-2); border-bottom: 1px solid var(--c-border);
    background: var(--c-surface-2); flex-shrink: 0;
}
.ss-input {
    flex: 1; min-width: 0;
    padding: var(--sp-2) var(--sp-3);
    border: 1px solid var(--c-border-strong); border-radius: var(--r-sm);
    /* 16px 未満だと iOS Safari がフォーカス時にズームする */
    font-size: 16px; font-family: inherit;
}
.ss-input:focus { outline: none; border-color: var(--c-primary); box-shadow: 0 0 0 2px var(--c-primary-weak); }
.ss-close {
    flex-shrink: 0; background: none; border: none; cursor: pointer;
    color: var(--c-primary); font-size: var(--fs-md); font-family: inherit;
    padding: var(--sp-2); min-height: var(--tap);
}

.ss-list { list-style: none; margin: 0; padding: var(--sp-1) 0; overflow-y: auto; overscroll-behavior: contain; flex: 1; }
.ss-opt {
    display: flex; align-items: center; gap: var(--sp-2);
    padding: var(--sp-2) var(--sp-3); cursor: pointer;
    font-size: var(--fs-md); min-height: 38px;
}
.ss-opt.is-active { background: var(--c-primary-weak); }
.ss-opt.is-selected { font-weight: 700; }
.ss-opt.is-selected::after { content: '✓'; margin-left: auto; color: var(--c-primary); flex-shrink: 0; }
.ss-opt-label { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.ss-opt-sub { color: var(--c-text-3); font-size: var(--fs-sm); }
.ss-none { padding: var(--sp-4) var(--sp-3); color: var(--c-text-3); font-size: var(--fs-md); text-align: center; }

@media (pointer: coarse) {
    .ss-opt { min-height: var(--tap); }
}
</style>
