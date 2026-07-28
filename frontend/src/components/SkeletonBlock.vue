<!-- ロード中のプレースホルダ。
     データ未取得の段階で「登録されていません」を出すと未登録と誤読されるため、
     読み込み中はこちらを出す。 -->
<template>
    <div class="skel" :class="{ 'is-list': lines > 1 }" role="status" aria-live="polite">
        <span class="sr-only">{{ label }}</span>
        <div
            v-for="i in lines"
            :key="i"
            class="skel-bar"
            :style="{ height: height + 'px', width: widthOf(i) }"
        ></div>
    </div>
</template>

<script setup lang="ts">
const props = withDefaults(defineProps<{
    lines?: number
    height?: number
    label?: string
}>(), {
    lines: 3,
    height: 44,
    label: '読み込み中',
})

// 全部同じ幅だと「表」に見えてしまうので少しだけ揺らす
const WIDTHS = ['100%', '92%', '96%', '88%']
function widthOf(i: number): string {
    return props.lines === 1 ? '100%' : WIDTHS[(i - 1) % WIDTHS.length]
}
</script>

<style scoped>
.skel { display: flex; flex-direction: column; gap: var(--sp-2); }
.skel-bar {
    border-radius: var(--r-md);
    background: linear-gradient(90deg, #eef0f2 25%, #f6f7f8 37%, #eef0f2 63%);
    background-size: 400% 100%;
    animation: skel-shimmer 1.3s ease-in-out infinite;
}
@keyframes skel-shimmer {
    0% { background-position: 100% 50%; }
    100% { background-position: 0 50%; }
}
</style>
