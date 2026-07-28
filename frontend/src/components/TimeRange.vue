<!-- 時間帯表示。
     従来は "7/29 12:00 - 7/29 13:00" と1行に流していたため、
     日付が二度出てくる上に横幅を食っていた。
     日付を上に一度だけ置き、開始と終了を縦に積んで縦線でつなぐ。

       7/29(火)
        12:00
          │
        13:00
-->
<template>
    <div class="time-range" :class="[`is-${size}`, { 'is-inline': inline }]">
        <template v-if="inline">
            <span v-if="showDate && dateText" class="tr-date">{{ dateText }}</span>
            <span class="tr-start">{{ startText }}</span>
            <span class="tr-dash">–</span>
            <span class="tr-end">{{ endText }}</span>
        </template>
        <template v-else>
            <div v-if="showDate && dateText" class="tr-date">{{ dateText }}</div>
            <div class="tr-times">
                <span class="tr-start">{{ startText }}</span>
                <span class="tr-bar" aria-hidden="true"></span>
                <span class="tr-end">{{ endText }}</span>
            </div>
            <div v-if="showDuration && durationText" class="tr-duration">{{ durationText }}</div>
        </template>
        <!-- 読み上げ用に元の意味も残す -->
        <span class="sr-only">{{ srText }}</span>
    </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { hhmm, mdw, durationMin, humanDuration } from '../utils/datetime'

const props = withDefaults(defineProps<{
    start: string | null
    end: string | null
    /** 同じ日が続くリストでは false にして日付行を省く */
    showDate?: boolean
    showDuration?: boolean
    /** 1行に流す (テーブルのセルなど、縦に積めない場所用) */
    inline?: boolean
    size?: 'sm' | 'md' | 'lg'
}>(), {
    showDate: true,
    showDuration: false,
    inline: false,
    size: 'md',
})

const dateText = computed(() => mdw(props.start))
const startText = computed(() => hhmm(props.start))
const endText = computed(() => hhmm(props.end))
const durationText = computed(() => humanDuration(durationMin(props.start, props.end)))
const srText = computed(() => `${dateText.value} ${startText.value} から ${endText.value} まで`)
</script>

<style scoped>
.time-range {
    display: flex;
    flex-direction: column;
    align-items: center;
    line-height: 1.15;
    font-variant-numeric: tabular-nums;
    white-space: nowrap;
}
.time-range.is-inline {
    flex-direction: row;
    align-items: baseline;
    gap: 4px;
}

.tr-date {
    color: var(--c-text-3);
    font-weight: 600;
    letter-spacing: 0.01em;
}
.tr-times {
    display: flex;
    flex-direction: column;
    align-items: center;
}
.tr-start { color: var(--c-text); font-weight: 700; }
.tr-end { color: var(--c-text-2); font-weight: 500; }
.tr-bar {
    width: 1px;
    background: var(--c-border-strong);
    margin: 1px 0;
}
.tr-duration { color: var(--c-text-3); }
.tr-dash { color: var(--c-text-3); }

/* サイズ: 日付と所要時間は本文より一段小さく保つ */
.is-sm { font-size: var(--fs-sm); }
.is-sm .tr-date, .is-sm .tr-duration { font-size: var(--fs-xs); }
.is-sm .tr-bar { height: 3px; }

.is-md { font-size: var(--fs-md); }
.is-md .tr-date, .is-md .tr-duration { font-size: var(--fs-xs); }
.is-md .tr-bar { height: 4px; }

.is-lg { font-size: 1.25rem; }
.is-lg .tr-date { font-size: var(--fs-sm); }
.is-lg .tr-duration { font-size: var(--fs-xs); }
.is-lg .tr-bar { height: 6px; }

.is-inline .tr-bar { display: none; }
</style>
