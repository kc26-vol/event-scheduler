<template>
<div class="tl-wrapper">
    <div class="tl-grid" :style="gridStyle">
        <div class="tl-corner">時間</div>
        <div v-for="([rid, rname], ci) in rooms" :key="'rh'+rid"
             class="tl-room-header" :style="{gridColumn: ci+2, background: color}">
            {{ rname }}
        </div>
        <template v-for="(lbl, i) in labels" :key="'t'+i">
            <div class="tl-time-label"
                 :class="{ 'hour-mark': lbl.isHour, 'quarter-mark': lbl.isQuarter }"
                 :style="{ gridRow: lbl.gridRow + ' / span ' + lbl.span }">
                {{ lbl.text }}
            </div>
            <div v-for="([rid], ci) in rooms" :key="'bg'+i+'-'+rid"
                 class="tl-bg-cell"
                 :class="{ 'hour-mark': lbl.isHour, 'half-mark': lbl.isHalf, 'quarter-mark': lbl.isQuarter }"
                 :style="{ gridRow: lbl.gridRow + ' / span ' + lbl.span, gridColumn: ci+2 }">
            </div>
        </template>
        <div v-for="entry in entries" :key="'s'+entry.session.id"
             class="tl-session"
             :style="entryStyle(entry)"
             @mousedown="$emit('dragstart', $event, entry)"
             @touchstart="$emit('dragstart', $event, entry)"
             @click="$emit('select', entry.session.id, $event, entry)">
            <div class="tl-session-time" :style="{ color: color }">
                {{ fmtShort(entry.session.start_time) }} - {{ fmtShort(entry.session.end_time) }}
            </div>
            <div class="tl-session-title">{{ entry.session.title }}</div>
            <div v-if="showSpeaker && ['lt','panel'].includes(entry.session.category) && entry.session.lt_talks && entry.session.lt_talks.length" class="tl-session-speaker">
                <span v-for="t in entry.session.lt_talks" :key="t.id" style="display:block;font-size:0.7rem">{{ t.speaker }}{{ t.title ? ' - ' + t.title : '' }}</span>
            </div>
            <div v-else-if="showSpeaker && entry.session.speaker && entry.session.speaker !== '-' && entry.session.speaker !== 'スタッフ'" class="tl-session-speaker">{{ entry.session.speaker }}</div>
            <div class="tl-session-staff">
                <span v-if="entry.session.required_staff === -1" class="badge" style="background:#e65100;color:#fff">全員</span>
                <template v-else-if="entry.assigned_staff.length">
                    <span class="badge" v-for="a in entry.assigned_staff" :key="a.assignment_id">{{ a.staff.name }}</span>
                </template>
                <span v-else class="badge warn">未配置</span>
            </div>
        </div>
    </div>
</div>
</template>

<script setup lang="ts">
// タイムライングリッド共通コンポーネント
interface Props {
    gridStyle?: Record<string, any>
    rooms?: [number, string][]
    labels?: any[]
    entries?: any[]
    color?: string
    entryStyle: (entry: any) => Record<string, any>
    fmtShort: (iso: string) => string
    showSpeaker?: boolean
}

withDefaults(defineProps<Props>(), {
    gridStyle: () => ({}),
    rooms: () => [],
    labels: () => [],
    entries: () => [],
    color: '#1a73e8',
    showSpeaker: false,
})

defineEmits<{
    select: [sessionId: number, event: MouseEvent, entry: any]
    dragstart: [event: MouseEvent | TouchEvent, entry: any]
}>()
</script>
