<!-- スタッフを選ぶコントロール。用途が2つあるので mode で分ける。

     mode="identity" … 「自分」を決め直す。localStorage に保存され、次回以降の既定表示になる。
     mode="view"     … 他の人を一時的に見る。「自分」の保存値は書き換えない。

     この2つは結果が違う (片方は端末に残り、片方は残らない) ので、
     1つのUIに混ぜず別々のボタンとして並べる。 -->
<template>
    <div class="psw" :class="[`is-${mode}`, { 'is-compact': compact }]">
        <SearchSelect
            v-model="selected"
            :options="staffOptions"
            :aria-label="ariaLabel"
            :placeholder="placeholder"
            search-placeholder="名前で検索…"
            empty-text="スタッフがまだ登録されていません"
        >
            <!-- compact では名前を出さない。名前は隣の見出しに出ているので、
                 ここは「何をする操作か」だけ分かればよい。 -->
            <template #selected="{ option }">
                <span v-if="compact" class="psw-compact">
                    <AvatarIcon v-if="mode === 'identity' && option" :name="option.label" :src="option.data?.photo" :size="20" />
                    <span v-else class="psw-compact-ico" aria-hidden="true">{{ mode === 'identity' ? '&#128100;' : '&#128101;' }}</span>
                    <span class="psw-compact-label">{{ buttonLabel }}</span>
                </span>
                <span v-else-if="option" class="psw-current">
                    <AvatarIcon :name="option.label" :src="option.data?.photo" :size="22" />
                    <span class="psw-name">{{ option.label }}</span>
                </span>
                <span v-else>{{ placeholder }}</span>
            </template>

            <template #option="{ option }">
                <AvatarIcon :name="option.label" :src="option.data?.photo" :size="28" />
                <span class="psw-opt-text">
                    <span class="psw-opt-name">{{ option.label }}</span>
                    <span v-if="option.sublabel" class="psw-opt-sub">{{ option.sublabel }}</span>
                </span>
                <span v-if="option.value === myStaffId" class="psw-self-tag">自分</span>
            </template>
        </SearchSelect>

        <!-- 他の人を見ている最中だけ、戻る手段を出す -->
        <button
            v-if="mode === 'view' && !isViewingSelf && myStaffId !== null"
            type="button"
            class="psw-back"
            @click="backToMe"
        >
            自分に戻る
        </button>
    </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import SearchSelect from './SearchSelect.vue'
import AvatarIcon from './AvatarIcon.vue'
import { useMe } from '../composables/useMe'

const props = withDefaults(defineProps<{
    /** identity = 自分を決め直す / view = 他の人を一時的に見る */
    mode?: 'identity' | 'view'
    /** 名前を出さない小さなボタン形。見出しの隣に置く用。 */
    compact?: boolean
}>(), {
    mode: 'view',
    compact: false,
})

const { staffOptions, viewingStaffId, myStaffId, me, isViewingSelf, viewAs, backToMe, setMe } = useMe()

const selected = computed({
    get: () => (props.mode === 'identity' ? myStaffId.value : viewingStaffId.value),
    set: (v: string | number | null) => {
        const id = v === null ? null : Number(v)
        // identity は端末に保存され閲覧対象も自分に戻る。view は保存しない。
        if (props.mode === 'identity') setMe(id)
        else viewAs(id)
    },
})

const buttonLabel = computed(() => {
    if (props.mode === 'identity') return me.value ? '自分を変更' : '自分を設定'
    return '他の人を表示'
})

const placeholder = computed(() =>
    props.mode === 'identity' ? '自分を選択' : 'スタッフを選択'
)

const ariaLabel = computed(() =>
    props.mode === 'identity'
        ? '自分として表示するスタッフを選択 (この端末に保存されます)'
        : '一時的に表示するスタッフを選択'
)
</script>

<style scoped>
.psw { display: flex; align-items: center; gap: var(--sp-2); min-width: 0; }
.psw :deep(.ss) { min-width: 0; flex: 1; }

/* compact: 見出しの右上に並べる小さなボタン。幅を取らない。
   「自分に戻る」は横に足すと右端がガタつくので、下に積む。 */
.psw.is-compact {
    flex-direction: column; align-items: flex-end;
    gap: var(--sp-1);
}
.psw.is-compact :deep(.ss) { flex: none; width: auto; }
.psw.is-compact :deep(.ss-trigger) {
    width: auto; min-height: 34px;
    padding: 4px var(--sp-2) 4px 6px;
    border-radius: var(--r-full);
    background: var(--c-surface-2);
}
.psw.is-compact :deep(.ss-value) { flex: none; }
/* 「自分」の変更は端末に残る操作なので、一時表示より一段強く見せる */
.psw.is-identity.is-compact :deep(.ss-trigger) {
    background: var(--c-primary-weak);
    border-color: transparent;
    color: var(--c-primary-text);
}
.psw-compact { display: inline-flex; align-items: center; gap: 5px; }
.psw-compact-ico { font-size: 0.95rem; line-height: 1; }
.psw-compact-label { font-weight: 600; font-size: var(--fs-sm); white-space: nowrap; }

.psw-current { display: inline-flex; align-items: center; gap: 6px; min-width: 0; }
.psw-name { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-weight: 600; }

.psw-opt-text { display: flex; flex-direction: column; min-width: 0; }
.psw-opt-name { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.psw-opt-sub { font-size: var(--fs-xs); color: var(--c-text-3); }
.psw-self-tag {
    margin-left: auto; flex-shrink: 0;
    font-size: var(--fs-xs); font-weight: 700;
    color: var(--c-success-text); background: var(--c-success-weak);
    padding: 1px var(--sp-2); border-radius: var(--r-full);
}

.psw-back {
    flex-shrink: 0;
    background: none; border: 1px solid var(--c-border-strong); border-radius: var(--r-full);
    color: var(--c-primary); font-size: var(--fs-sm); font-family: inherit;
    padding: 5px var(--sp-3); cursor: pointer; white-space: nowrap;
}
.psw-back:hover { background: var(--c-primary-weak); border-color: var(--c-primary); }
</style>
