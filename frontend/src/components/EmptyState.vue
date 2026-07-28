<!-- データが本当に無いときの表示。ロード中には使わない (SkeletonBlock を使う)。 -->
<template>
    <div class="empty">
        <div v-if="icon" class="empty-ico" aria-hidden="true">{{ icon }}</div>
        <p class="empty-title">{{ title }}</p>
        <p v-if="hint" class="empty-hint">{{ hint }}</p>
        <slot />
    </div>
</template>

<script setup lang="ts">
withDefaults(defineProps<{
    title: string
    hint?: string
    icon?: string
}>(), {
    hint: '',
    icon: '',
})
</script>

<style scoped>
.empty {
    display: flex; flex-direction: column; align-items: center;
    gap: var(--sp-2);
    padding: var(--sp-8) var(--sp-4);
    text-align: center;
    color: var(--c-text-2);
}
.empty-ico { font-size: 2rem; opacity: 0.55; }
.empty-title { font-size: var(--fs-md); font-weight: 600; color: var(--c-text-2); }
.empty-hint { font-size: var(--fs-sm); color: var(--c-text-3); max-width: 34ch; line-height: var(--lh-normal); }
</style>
