<!-- 配置表の中で使う「スタッフを1人追加する」ピッカー。
     従来は <select> で選んでから「追加」ボタンを押す2段階だったが、
     このピッカーの用途は追加しかないので、選んだ時点で確定させる。 -->
<template>
    <SearchSelect
        v-model="picked"
        :options="options"
        placeholder="＋ 追加"
        search-placeholder="名前で検索…"
        empty-text="配置できるスタッフがいません"
        aria-label="担当スタッフを追加"
        class="asp"
        @change="onPick">
        <template #option="{ option }">
            <AvatarIcon v-if="option.data" :name="option.label" :src="option.data.photo" :size="22" />
            <span>{{ option.label }}</span>
        </template>
    </SearchSelect>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import SearchSelect from './SearchSelect.vue'
import AvatarIcon from './AvatarIcon.vue'
import { useStore } from '../store'
import type { ScheduleEntry } from '../types'

const props = withDefaults(defineProps<{
    entry: ScheduleEntry
    /** availableStaffs に渡す担当キー (全体スケジュールでは 'overall') */
    role?: string
    /** 「全員」をまとめて配置する選択肢を出すか (全体スケジュール用) */
    allowAll?: boolean
}>(), {
    role: undefined,
    allowAll: false,
})

const { assignStaffSelect, availableStaffs, addAssignment, addAssignmentOrAll } = useStore()

// 表示上は常に未選択に戻す。選択は「追加する」という操作そのもの。
const picked = ref<string | number | null>(null)

const options = computed(() => {
    const list: { value: string | number; label: string; keywords?: string; data?: any }[] = []
    if (props.allowAll) list.push({ value: 'all', label: '全員を配置' })
    for (const s of availableStaffs(props.entry, props.role)) {
        list.push({ value: s.id, label: s.name, keywords: s.slack_name || '', data: s })
    }
    return list
})

async function onPick(value: string | number | null) {
    if (value === null) return
    const sessionId = props.entry.session.id
    if (value === 'all') {
        // addAssignmentOrAll は assignStaffSelect から値を読む
        assignStaffSelect[sessionId] = 'all'
        await addAssignmentOrAll(sessionId)
    } else {
        assignStaffSelect[sessionId] = Number(value)
        await addAssignment(sessionId)
    }
    picked.value = null
}
</script>

<style scoped>
.asp { width: 170px; max-width: 100%; display: inline-block; vertical-align: middle; }
.asp :deep(.ss-trigger) { min-height: 30px; padding: 2px var(--sp-2); font-size: var(--fs-sm); }
</style>
