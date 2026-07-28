<!-- 人物チップ。アイコンは常に名前の左に出る。
     名前だけの <span class="badge"> を全面的にこれへ置き換えていく。 -->
<template>
    <component
        :is="clickable ? 'button' : 'span'"
        class="person-chip"
        :class="[`is-${size}`, { 'is-clickable': clickable, 'is-muted': muted }]"
        :type="clickable ? 'button' : undefined"
        :title="title"
    >
        <AvatarIcon :name="name" :src="photo" :size="avatarSize" />
        <span class="person-chip-name">{{ name }}</span>
        <slot />
    </component>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import AvatarIcon from './AvatarIcon.vue'
import type { Staff } from '../types'

const props = withDefaults(defineProps<{
    /** Staff を渡すか、name/photo を個別に渡すかのどちらでもよい */
    staff?: Staff | { name: string; photo?: string; slack_name?: string } | null
    name?: string
    photo?: string
    size?: 'xs' | 'sm' | 'md'
    clickable?: boolean
    muted?: boolean
}>(), {
    staff: null,
    name: '',
    photo: '',
    size: 'sm',
    clickable: false,
    muted: false,
})

const AVATAR_PX: Record<string, number> = { xs: 18, sm: 22, md: 30 }

const name = computed(() => props.staff?.name ?? props.name)
const photo = computed(() => props.staff?.photo ?? props.photo)
const avatarSize = computed(() => AVATAR_PX[props.size] ?? 22)
const title = computed(() => {
    const slack = props.staff && 'slack_name' in props.staff ? props.staff.slack_name : ''
    return slack ? `${name.value} (${slack})` : name.value
})
</script>

<style scoped>
.person-chip {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    max-width: 100%;
    border-radius: var(--r-full);
    background: var(--c-primary-weak);
    color: var(--c-primary-text);
    border: 1px solid transparent;
    font-family: inherit;
    margin: 2px 0;
    vertical-align: middle;
}
.person-chip-name {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    min-width: 0;
}

.is-xs { padding: 1px 8px 1px 2px; font-size: var(--fs-xs); gap: 4px; }
.is-sm { padding: 2px 10px 2px 2px; font-size: var(--fs-sm); }
.is-md { padding: 3px 12px 3px 3px; font-size: var(--fs-md); }

.is-muted { background: var(--c-surface-3); color: var(--c-text-2); }

.is-clickable { cursor: pointer; transition: background .15s, border-color .15s; }
.is-clickable:hover { background: var(--c-primary-weak-2); }
.is-clickable:focus-visible { outline: 2px solid var(--c-primary); outline-offset: 1px; }
</style>
