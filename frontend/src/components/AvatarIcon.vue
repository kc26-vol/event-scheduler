<!-- 人物アイコン。写真があれば写真、無ければ頭文字の円。
     フォールバックの色は名前から決定的に決めるので、同じ人はいつも同じ色になる
     (全員が同じ青一色だと一覧で見分けがつかないため)。 -->
<template>
    <img v-if="src" class="avatar" :src="src" :alt="alt" :style="sizeStyle" loading="lazy">
    <span v-else class="avatar avatar-fallback" :style="[sizeStyle, { background: bg }]" :aria-label="alt" role="img">
        {{ initial }}
    </span>
</template>

<script setup lang="ts">
import { computed } from 'vue'

const props = withDefaults(defineProps<{
    name?: string
    src?: string
    /** 一辺のピクセル数 */
    size?: number
}>(), {
    name: '',
    src: '',
    size: 28,
})

// 白文字が乗る前提の彩度・明度に揃えたパレット
const PALETTE = [
    '#1a73e8', '#0d904f', '#c5221f', '#8430ce', '#b06000',
    '#00838f', '#ad1457', '#3949ab', '#2e7d32', '#e65100',
]

const alt = computed(() => props.name || '不明')

const initial = computed(() => {
    const n = props.name.trim()
    if (!n) return '?'
    // サロゲートペア (絵文字など) を割らないように配列経由で1文字取る
    return Array.from(n)[0].toUpperCase()
})

const bg = computed(() => {
    const n = props.name
    if (!n) return '#9aa0a6'
    let h = 0
    for (let i = 0; i < n.length; i++) h = (h * 31 + n.charCodeAt(i)) >>> 0
    return PALETTE[h % PALETTE.length]
})

const sizeStyle = computed(() => ({
    width: props.size + 'px',
    height: props.size + 'px',
    fontSize: Math.max(10, Math.round(props.size * 0.42)) + 'px',
}))
</script>

<style scoped>
.avatar {
    border-radius: 50%;
    object-fit: cover;
    flex-shrink: 0;
    display: inline-block;
    vertical-align: middle;
    background: var(--c-surface-3);
}
.avatar-fallback {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    color: #fff;
    font-weight: 700;
    line-height: 1;
    user-select: none;
}
</style>
