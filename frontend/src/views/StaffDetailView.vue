<!-- スタッフ別詳細。
     以前は全スタッフを縦に積んでいたため、目当ての人を探すのに延々スクロールが必要だった。
     既定は「1人ずつ表示」にして検索で切り替える。全員を並べたい用途 (印刷・突き合わせ)
     のために一覧モードも残す。 -->
<template>
    <div class="panel active">
        <h2>スタッフ別詳細</h2>

        <div class="sd-controls">
            <div v-if="!showAll" class="sd-picker">
                <PersonSwitcher />
            </div>
            <div v-else class="sd-picker">
                <label class="sd-label" for="sd-role">担当で絞り込み</label>
                <SearchSelect
                    id="sd-role"
                    v-model="roleFilter"
                    :options="roleFilterOptions"
                    placeholder="全員表示"
                    aria-label="担当で絞り込む"
                    clearable />
            </div>
            <button type="button" class="btn btn-sm sd-mode" @click="showAll = !showAll">
                {{ showAll ? '1人ずつ表示' : '全員を一覧表示' }}
            </button>
        </div>

        <!-- 全体スケジュールから日付付きで来た場合、その日だけに絞って表示する -->
        <div v-if="dateFilter && !showAll" class="sd-datechip">
            <span class="sd-datechip-label">{{ dateFilter }} のみ表示</span>
            <button type="button" class="sd-datechip-clear" @click="clearDateFilter">全日程を見る</button>
        </div>

        <SkeletonBlock v-if="!ready" :lines="4" :height="72" label="スタッフを読み込み中" />

        <EmptyState v-else-if="!staffAssignmentsWithAll.length"
            icon="&#128101;"
            title="スタッフがまだ登録されていません"
            hint="「管理」→「スタッフ管理」から追加してください。" />

        <!-- 1人ずつ -->
        <template v-else-if="!showAll">
            <EmptyState v-if="!currentEntry"
                icon="&#128100;"
                title="表示するスタッフが選ばれていません"
                hint="上の検索欄から名前を選んでください。" />
            <StaffDetailCard v-else :entry="currentEntry" :only-date="dateFilter" />
        </template>

        <!-- 全員 -->
        <template v-else>
            <StaffDetailCard
                v-for="e in filteredEntries"
                :key="'sd-' + e.staff.id"
                :entry="e" />
            <EmptyState v-if="!filteredEntries.length"
                icon="&#128269;"
                title="条件に合うスタッフがいません" />
        </template>
    </div>
</template>

<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useStore } from '../store'
import { useMe } from '../composables/useMe'
import PersonSwitcher from '../components/PersonSwitcher.vue'
import SearchSelect from '../components/SearchSelect.vue'
import SkeletonBlock from '../components/SkeletonBlock.vue'
import EmptyState from '../components/EmptyState.vue'
import StaffDetailCard from '../components/StaffDetailCard.vue'

const { loaded, staffAssignmentsWithAll, roleOptions, staffDetailFilter, staffDetailMatch } = useStore()
const { viewingStaffId, viewAs } = useMe()

const showAll = ref(false)

/* --- URL との同期 ---
 * 全体スケジュールから「詳細で見る」で来たとき、誰を・どの日を見るかを
 * query で受け取る。ここで人を切り替えたら query 側も書き戻す。 */
const route = useRoute()
const router = useRouter()
const dateFilter = ref('')
let applyingQuery = false

function applyQuery() {
    const { staff, date } = route.query
    applyingQuery = true
    if (typeof staff === 'string' && staff) viewAs(Number(staff))
    dateFilter.value = typeof date === 'string' ? date : ''
    nextTick(() => { applyingQuery = false })
}
watch(() => route.query, applyQuery, { immediate: true })

// 人を切り替えたら URL も追従させる (共有・リロードで同じ画面に戻れる)
watch(viewingStaffId, id => {
    if (applyingQuery) return
    const query: Record<string, string> = {}
    if (id !== null) query.staff = String(id)
    if (dateFilter.value) query.date = dateFilter.value
    router.replace({ query })
})

function clearDateFilter() {
    dateFilter.value = ''
    const query: Record<string, string> = {}
    if (viewingStaffId.value !== null) query.staff = String(viewingStaffId.value)
    router.replace({ query })
}

const ready = computed(() => loaded.staffAssignments && loaded.staffs && loaded.schedule)

const currentEntry = computed(() =>
    staffAssignmentsWithAll.value.find(e => e.staff.id === viewingStaffId.value) ?? null
)

const filteredEntries = computed(() =>
    staffAssignmentsWithAll.value.filter(e => staffDetailMatch(e.staff))
)

const roleFilterOptions = computed(() => [
    ...roleOptions.value.map(o => ({ value: o.v, label: o.l })),
    { value: 'none', label: '担当なし' },
])

// ストア側は「絞り込みなし」を空文字で表現している。
const roleFilter = computed({
    get: () => staffDetailFilter.value || null,
    set: (v: string | number | null) => { staffDetailFilter.value = v === null ? '' : String(v) },
})
</script>

<style scoped>
.sd-controls {
    display: flex; align-items: center; gap: var(--sp-2);
    margin-bottom: var(--sp-4);
}
/* ピッカーは残り幅いっぱい。固定幅だと選択中の名前が切れる。 */
.sd-picker { flex: 1 1 auto; min-width: 0; max-width: 460px; display: flex; align-items: center; gap: var(--sp-2); }
.sd-label { font-weight: 600; font-size: var(--fs-md); flex-shrink: 0; }
/* PersonSwitcher を挟む場合、その内側の SearchSelect まで伸ばす */
.sd-picker :deep(.psw) { flex: 1; min-width: 0; }
.sd-picker :deep(.ss) { flex: 1; min-width: 0; }
.sd-mode { flex-shrink: 0; margin-left: auto; white-space: nowrap; background: var(--c-surface-2); color: var(--c-primary); border: 1px solid var(--c-border-strong); }
.sd-mode:hover { background: var(--c-primary-weak); }

.sd-datechip {
    display: flex; align-items: center; gap: var(--sp-2); flex-wrap: wrap;
    margin-bottom: var(--sp-3); padding: 6px var(--sp-3);
    background: var(--c-primary-weak); border-radius: var(--r-md);
    font-size: var(--fs-sm);
}
.sd-datechip-label { font-weight: 600; color: var(--c-primary-text); }
.sd-datechip-clear {
    background: none; border: none; cursor: pointer; font-family: inherit;
    color: var(--c-primary); font-size: var(--fs-sm); text-decoration: underline;
    padding: 2px var(--sp-1);
}

@media (max-width: 600px) {
    .sd-label { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); }
    .sd-picker { max-width: none; }
    .sd-mode { padding: 6px var(--sp-2); }
}
</style>
