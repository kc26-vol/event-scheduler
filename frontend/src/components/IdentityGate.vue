<!-- 初回アクセス時に「あなたは誰か」を選ばせるモーダル。
     ここは折りたたんだセレクトではなく、検索欄と一覧を最初から開いた形にする。
     開いた直後にそのまま自分の名前を打ち始められるようにするため。 -->
<template>
    <div class="ig-overlay" role="dialog" aria-modal="true" aria-labelledby="ig-title">
        <div class="ig-panel">
            <h2 id="ig-title" class="ig-title">あなたのお名前を選んでください</h2>
            <p class="ig-lead">選ぶと、次からはあなたの担当が最初に表示されます。<br>この端末にのみ保存され、あとから切り替えられます。</p>

            <div class="ig-search">
                <input
                    ref="inputEl"
                    v-model="query"
                    type="text"
                    class="ig-input"
                    role="combobox"
                    aria-controls="ig-list"
                    aria-expanded="true"
                    :aria-activedescendant="activeId"
                    placeholder="名前で検索…"
                    autocomplete="off"
                    spellcheck="false"
                    @keydown="onKeydown"
                >
            </div>

            <!-- スタッフ未取得のうちは「0名」に見せない -->
            <SkeletonBlock v-if="!loaded.staffs" :lines="4" :height="52" label="スタッフを読み込み中" />

            <ul v-else id="ig-list" class="ig-list" role="listbox" ref="listEl" aria-label="スタッフ一覧">
                <li
                    v-for="(s, i) in filtered"
                    :key="s.id"
                    :id="`ig-opt-${i}`"
                    class="ig-opt"
                    :class="{ 'is-active': i === activeIndex }"
                    role="option"
                    :aria-selected="i === activeIndex"
                    @click="choose(s.id)"
                    @mousemove="activeIndex = i"
                >
                    <AvatarIcon :name="s.name" :src="s.photo" :size="36" />
                    <span class="ig-opt-text">
                        <span class="ig-opt-name">{{ s.name }}</span>
                        <span v-if="s.slack_name" class="ig-opt-sub">{{ s.slack_name }}</span>
                    </span>
                </li>
                <li v-if="!filtered.length" class="ig-none">
                    {{ staffs.length ? '一致する名前がありません' : 'スタッフがまだ登録されていません' }}
                </li>
            </ul>

            <!-- スタッフとして登録されていない人 (マネージャー等) もここで止めない -->
            <button type="button" class="ig-skip" @click="skipIdentity">
                スタッフ登録がない / あとで選ぶ
            </button>
        </div>
    </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onMounted, ref, watch } from 'vue'
import AvatarIcon from './AvatarIcon.vue'
import SkeletonBlock from './SkeletonBlock.vue'
import { useStore } from '../store'
import { useMe } from '../composables/useMe'
import { matchesQuery } from '../utils/search'

const { staffs, loaded } = useStore()
const { setMe, skipIdentity } = useMe()

const query = ref('')
const activeIndex = ref(0)
const inputEl = ref<HTMLInputElement | null>(null)
const listEl = ref<HTMLElement | null>(null)

const filtered = computed(() =>
    staffs.value.filter(s => matchesQuery(query.value, s.name, s.slack_name))
)

const activeId = computed(() =>
    filtered.value.length ? `ig-opt-${activeIndex.value}` : undefined
)

watch(filtered, list => {
    if (activeIndex.value >= list.length) activeIndex.value = 0
})

onMounted(() => inputEl.value?.focus())

function scrollActiveIntoView() {
    const el = listEl.value?.children[activeIndex.value] as HTMLElement | undefined
    el?.scrollIntoView({ block: 'nearest' })
}

function move(delta: number) {
    const n = filtered.value.length
    if (!n) return
    activeIndex.value = (activeIndex.value + delta + n) % n
    nextTick(scrollActiveIntoView)
}

function choose(id: number) {
    setMe(id)
}

function onKeydown(e: KeyboardEvent) {
    if (e.key === 'ArrowDown') { e.preventDefault(); move(1) }
    else if (e.key === 'ArrowUp') { e.preventDefault(); move(-1) }
    else if (e.key === 'Enter') {
        e.preventDefault()
        const s = filtered.value[activeIndex.value]
        if (s) choose(s.id)
    }
    // Esc では閉じない。誰か選ばないと何も出せない画面なので。
}
</script>

<style scoped>
.ig-overlay {
    position: fixed; inset: 0; z-index: var(--z-modal);
    background: rgba(15, 23, 42, 0.55);
    display: flex; align-items: center; justify-content: center;
    padding: var(--sp-4);
    padding-top: calc(var(--sp-4) + var(--safe-top));
    padding-bottom: calc(var(--sp-4) + var(--safe-bottom));
}
.ig-panel {
    background: var(--c-surface);
    border-radius: var(--r-lg);
    box-shadow: var(--sh-4);
    width: 100%; max-width: 440px;
    max-height: 100%;
    display: flex; flex-direction: column;
    padding: var(--sp-5);
    gap: var(--sp-3);
}
.ig-title { font-size: var(--fs-xl); margin: 0; }
.ig-lead { font-size: var(--fs-sm); color: var(--c-text-2); line-height: var(--lh-normal); margin: 0; }

.ig-input {
    width: 100%;
    padding: 10px var(--sp-3);
    border: 1px solid var(--c-border-strong); border-radius: var(--r-md);
    /* 16px 未満だと iOS Safari がフォーカス時にズームする */
    font-size: 16px; font-family: inherit;
}
.ig-input:focus { outline: none; border-color: var(--c-primary); box-shadow: 0 0 0 3px var(--c-primary-weak); }

.ig-list {
    list-style: none; margin: 0; padding: 0;
    overflow-y: auto; overscroll-behavior: contain;
    flex: 1; min-height: 120px;
    border: 1px solid var(--c-border); border-radius: var(--r-md);
}
.ig-opt {
    display: flex; align-items: center; gap: var(--sp-3);
    padding: var(--sp-2) var(--sp-3);
    cursor: pointer; min-height: var(--tap);
    border-bottom: 1px solid var(--c-surface-3);
}
.ig-opt:last-child { border-bottom: none; }
.ig-opt.is-active { background: var(--c-primary-weak); }
.ig-opt-text { display: flex; flex-direction: column; min-width: 0; }
.ig-opt-name { font-size: var(--fs-md); font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.ig-opt-sub { font-size: var(--fs-xs); color: var(--c-text-3); }
.ig-none { padding: var(--sp-5); text-align: center; color: var(--c-text-3); font-size: var(--fs-md); }

.ig-skip {
    flex-shrink: 0; align-self: center;
    background: none; border: none; cursor: pointer; font-family: inherit;
    color: var(--c-text-2); font-size: var(--fs-sm); text-decoration: underline;
    padding: var(--sp-2); min-height: var(--tap);
}
.ig-skip:hover { color: var(--c-primary); }
</style>
