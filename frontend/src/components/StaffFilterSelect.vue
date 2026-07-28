<!-- 「スタッフ絞り込み」の共通コントロール。
     配置系の画面がそれぞれ素の <select> を持っていたのを1つに寄せる。
     ストア側は「絞り込みなし」を 0 で表すので、ここで null との変換を吸収する。 -->
<template>
    <div class="sfs">
        <label class="sfs-label" :for="id">{{ label }}</label>
        <SearchSelect
            :id="id"
            v-model="inner"
            :options="options"
            placeholder="全員表示"
            search-placeholder="名前で検索…"
            empty-text="スタッフがまだ登録されていません"
            aria-label="スタッフで絞り込む"
            clearable
            class="sfs-select">
            <!-- 選択済みの表示にもアイコンを出す (一覧側の見た目と揃える) -->
            <template #selected="{ option }">
                <span v-if="option" class="sfs-selected">
                    <AvatarIcon :name="option.label" :src="option.data?.photo" :size="22" />
                    <span class="sfs-selected-name">{{ option.label }}</span>
                </span>
                <span v-else>全員表示</span>
            </template>
            <template #option="{ option }">
                <AvatarIcon :name="option.label" :src="option.data?.photo" :size="24" />
                <span>{{ option.label }}</span>
            </template>
        </SearchSelect>
        <span v-if="modelValue && hint" class="sfs-hint">{{ hint }}</span>
    </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import SearchSelect from './SearchSelect.vue'
import AvatarIcon from './AvatarIcon.vue'
import { useStore } from '../store'

const props = withDefaults(defineProps<{
    /** 0 = 絞り込みなし */
    modelValue: number
    label?: string
    /** 「3/12件」のような補足 */
    hint?: string
}>(), {
    label: 'スタッフ絞り込み',
    hint: '',
})

const emit = defineEmits<{ 'update:modelValue': [value: number] }>()

const { staffs } = useStore()

let seq = 0
const id = `sfs-${++seq}-${Math.floor(performance.now())}`

const options = computed(() =>
    staffs.value.map(s => ({ value: s.id, label: s.name, keywords: s.slack_name || '', data: s }))
)

const inner = computed({
    get: () => (props.modelValue ? props.modelValue : null),
    set: (v: string | number | null) => emit('update:modelValue', v === null ? 0 : Number(v)),
})
</script>

<style scoped>
.sfs { display: flex; align-items: center; gap: var(--sp-2); margin-bottom: var(--sp-3); }
.sfs-label { font-weight: 600; font-size: var(--fs-md); flex-shrink: 0; }
/* 残り幅いっぱいまで伸ばす (固定幅だと名前が切れる)。上限だけ決める。 */
.sfs-select { flex: 1 1 auto; min-width: 0; max-width: 460px; }
.sfs-hint { font-size: var(--fs-sm); color: var(--c-text-2); flex-shrink: 0; margin-left: auto; white-space: nowrap; }
.sfs-selected { display: inline-flex; align-items: center; gap: 6px; min-width: 0; }
.sfs-selected-name { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-weight: 600; }
@media (max-width: 600px) {
    /* ラベルは場所を食うだけ。SearchSelect 側に aria-label があるので落とす。 */
    .sfs-label { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); }
    .sfs-select { max-width: none; }
}
</style>
