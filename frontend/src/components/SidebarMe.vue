<!-- サイドバー下部の「自分」ブロック。
     モバイルにはアプリバー右端に自分のアイコンが出ているが、PCには
     「今このブラウザが誰として見ているか」の手がかりが何も無かった。

     ついでに次の担当も1行だけ出す。マイページを開かなくても、管理画面の
     作業中に「あと何分で自分の出番か」が視界に入る。
     ここが指すのは常に「自分」で、他の人を閲覧中でも変わらない。 -->
<template>
    <div class="smi">
        <button
            v-if="me"
            type="button"
            class="smi-btn"
            :class="{ 'is-active': tab === 'my' }"
            :aria-label="`マイページ: ${me.name}`"
            @click="switchTab('my')"
        >
            <span class="smi-id">
                <AvatarIcon :name="me.name" :src="me.photo" :size="30" />
                <span class="smi-name">{{ me.name }}</span>
            </span>

            <span v-if="anchor" class="smi-shift" :class="current ? 'is-now' : 'is-next'">
                <span class="smi-shift-head">
                    <span class="smi-state">{{ current ? '進行中' : '次' }}</span>
                    <span class="smi-time">{{ timeLabel }}</span>
                    <span v-if="countdown" class="smi-until">{{ countdown }}</span>
                </span>
                <span class="smi-title">{{ anchor.title }}</span>
            </span>
            <span v-else-if="shifts.length" class="smi-none">以降の担当はありません</span>
        </button>

        <!-- 未設定 (「あとで選ぶ」を選んだ人を含む)。clearMe で選択モーダルが戻る。 -->
        <button v-else type="button" class="smi-set" @click="clearMe">
            <span aria-hidden="true">&#128100;</span> 自分を設定
        </button>
    </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import AvatarIcon from './AvatarIcon.vue'
import { useStore } from '../store'
import { useMe } from '../composables/useMe'
import { useShiftsOf } from '../composables/useShifts'
import { hhmm, isSameDay, md, untilText } from '../utils/datetime'

const { tab, switchTab } = useStore()
const { me, myStaffId, clearMe } = useMe()
const { now, shifts, current, anchor } = useShiftsOf(myStaffId)

// 進行中は終わる時刻、次は始まる時刻。当日でなければ日付も足す。
const timeLabel = computed(() => {
    const s = anchor.value
    if (!s) return ''
    if (current.value) return `〜${hhmm(s.end_time)}`
    const day = isSameDay(s.start_time, now.value) ? '' : `${md(s.start_time)} `
    return `${day}${hhmm(s.start_time)}`
})

// 「あと25分」は次の1件だけ。進行中に出しても行動が変わらない。
const countdown = computed(() =>
    current.value || !anchor.value ? '' : untilText(anchor.value.start_time, now.value)
)
</script>

<style scoped>
/* 下端に寄せる。これより上のナビは自然な高さのまま。 */
.smi { margin-top: auto; padding: var(--sp-2) var(--sp-2) 0; }

.smi-btn, .smi-set {
    display: flex; flex-direction: column; gap: 6px;
    width: 100%; text-align: left;
    background: var(--c-nav-hover); color: var(--c-nav-fg-strong);
    border: 1px solid transparent; border-radius: var(--r-md);
    padding: var(--sp-2); font-family: inherit; cursor: pointer;
    transition: border-color .15s;
}
.smi-btn:hover, .smi-set:hover { border-color: var(--c-nav-section); }
.smi-btn.is-active { border-color: var(--c-primary); }

.smi-id { display: flex; align-items: center; gap: var(--sp-2); min-width: 0; }
.smi-name {
    font-size: var(--fs-md); font-weight: 600; color: var(--c-nav-fg-strong);
    overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}

/* 担当1件を2行で。1行目に状態と時刻、2行目に名前。 */
.smi-shift {
    display: flex; flex-direction: column; gap: 2px; min-width: 0;
    padding: 5px 6px; border-radius: var(--r-sm);
    background: rgba(0, 0, 0, 0.22);
    border-left: 3px solid var(--c-nav-section);
}
.smi-shift.is-now { border-left-color: var(--c-danger); }
.smi-shift.is-next { border-left-color: var(--c-primary); }

.smi-shift-head { display: flex; align-items: center; gap: var(--sp-1); min-width: 0; }
.smi-state {
    flex-shrink: 0; font-size: var(--fs-xs); font-weight: 700;
    padding: 0 5px; border-radius: var(--r-full); color: #fff;
}
.smi-shift.is-now .smi-state { background: var(--c-danger); }
.smi-shift.is-next .smi-state { background: var(--c-primary); }
.smi-time { flex-shrink: 0; font-size: var(--fs-xs); font-weight: 700; color: var(--c-nav-fg-strong); }
.smi-until {
    margin-left: auto; flex-shrink: 0;
    font-size: var(--fs-xs); color: var(--c-nav-fg);
}
.smi-title {
    font-size: var(--fs-xs); color: var(--c-nav-fg); line-height: var(--lh-tight);
    overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}

.smi-none { font-size: var(--fs-xs); color: var(--c-nav-section); }
.smi-set { flex-direction: row; align-items: center; gap: 6px; font-size: var(--fs-sm); }
</style>
