<template>
        <template v-for="grp in sessionGroups" :key="'grpa-'+grp.id">
        <div v-if="grp.id === gid" class="panel active">
            <div style="display:flex;align-items:center;gap:12px;margin-bottom:16px">
                <h2 style="margin:0">{{ grp.label }}担当</h2>
                <button @click="groupLocks[grp.id] = !groupLocks[grp.id]"
                        :style="{ background: groupLocks[grp.id] ? '#e8eaed' : '#fce8e6', color: groupLocks[grp.id] ? '#5f6368' : '#c5221f', border: groupLocks[grp.id] ? '1px solid #dadce0' : '1px solid #c5221f', borderRadius: '20px', padding: '5px 14px', cursor: 'pointer', fontSize: '0.85rem', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '6px' }">
                    <span v-if="groupLocks[grp.id]">&#128274; ロック中</span>
                    <span v-else>&#128275; 編集中</span>
                </button>
            </div>

            <!-- 日程タブ -->
            <div v-if="grpDates(grp.id).length > 0" class="tab-bar">
                <button class="tab-btn"
                    :style="grpDateTabs[grp.id] === 0 ? {background:'#333', color:'#fff'} : {background:'#f5f5f5', color:'#666'}"
                    @click="grpDateTabs[grp.id] = 0">
                    全日程
                </button>
                <button v-for="date in grpDates(grp.id)" :key="'grp-dtab-'+grp.id+'-'+date"
                    class="tab-btn"
                    :style="grpDateTabs[grp.id] === date ? {background: grp.color || '#1a73e8', color:'#fff'} : {background:'#f5f5f5', color:'#666'}"
                    @click="grpDateTabs[grp.id] = date">
                    {{ date }}<span v-if="isTodayDate(date)" class="today-dot">今日</span>
                </button>
            </div>

            <!-- 自動配置ボタン -->
            <div v-if="!groupLocks[grp.id]" style="display:flex;flex-wrap:wrap;gap:8px;align-items:center;margin-bottom:12px">
                <button v-if="grpDateTabs[grp.id] && grpDateTabs[grp.id] !== 0" class="btn btn-success" @click="autoAssignGroup(grp.id)">
                    {{ grpDateTabs[grp.id] }} を自動配置
                </button>
                <button class="btn" style="background:#1a73e8" @click="autoAssignGroupSelected(grp.id)" :disabled="!(groupSelectedSessions[grp.id] && groupSelectedSessions[grp.id].size)">選択して再配置 <span v-if="groupSelectedSessions[grp.id] && groupSelectedSessions[grp.id].size">({{ groupSelectedSessions[grp.id].size }}件)</span></button>
                <button v-if="grpDateTabs[grp.id] && grpDateTabs[grp.id] !== 0" class="btn" style="background:#f9ab00" @click="autoAssignGroupFill(grp.id)">未配置を埋める</button>
                <button class="btn btn-danger" @click="clearGroupAssignments(grp.id)">配置をクリア</button>
                <span v-if="groupScheduleMsgs[grp.id]" style="font-size:0.85rem;color:#137333">{{ groupScheduleMsgs[grp.id] }}</span>
            </div>
            <div v-if="!groupLocks[grp.id] && (!grpDateTabs[grp.id] || grpDateTabs[grp.id] === 0)" style="margin-bottom:12px;font-size:0.85rem;color:#b06000;background:#fff8e1;border-radius:6px;padding:8px 12px">
                自動配置は日程ごとに実行します。上の日程タブから日付を選んでください。選んだ日の全セッション（全カテゴリ）がまとめて配置されます。
            </div>

            <!-- 必要スタッフ計算 -->
            <div style="margin-bottom:12px;padding:12px 16px;background:#e8f5e9;border-radius:8px">
                <button class="btn" style="background:#388e3c" @click="calcRequiredStaff()">必要スタッフ計算</button>
                <span v-if="calcStaffMsg" style="margin-left:12px;font-size:0.9rem;color:#333">{{ calcStaffMsg }}</span>
                <div v-if="calcStaffSummary" style="margin-top:8px;font-size:0.85rem;color:#555">
                    <div><strong>最小: {{ calcStaffSummary.min }}名</strong> — 各セッションの指定人数を満たす。連続配置あり</div>
                    <div style="margin-top:4px"><strong>推奨: {{ calcStaffSummary.comfortable }}名</strong> — セッション担当後に1回休憩をはさめる人数</div>
                </div>
            </div>

            <!-- スタッフフィルター -->
            <StaffFilterSelect
                v-model="groupStaffFilters[grp.id]"
                :hint="`${filteredGroupSessions(grp.id).length}/${grpDateFiltered(grp.id).length}件`" />

            <!-- タイムライングリッド -->
            <h3 style="margin-top:0">配置表</h3>
            <SkeletonBlock v-if="!loaded.schedule" :lines="4" :height="64" label="配置表を読み込み中" />
            <EmptyState v-else-if="!grpDateFiltered(grp.id).length"
                icon="&#128197;"
                title="セッションがまだ登録されていません"
                :hint="`「${grp.label}管理」から追加してください。`" />
            <template v-else-if="grpDateTabs[grp.id] !== 0">
                <tl-grid
                    :grid-style="grpGridStyle(grp.id)" :rooms="grpGridRooms(grp.id)" :labels="grpGridLabels(grp.id)"
                    :entries="grpDateFiltered(grp.id)" :color="grp.color || '#1a73e8'" :show-speaker="true"
                    :entry-style="e => groupLocks[grp.id] ? { ...grpSessionStyle(grp.id, e), opacity: groupSessionOpacity(grp.id, e), cursor: 'pointer' } : grpDragSessionStyle(grp.id, e)"
                    :fmt-short="fmtShort"
                    @dragstart="(ev, entry) => { if (!groupLocks[grp.id]) onGrpDragStart(ev, grp.id, entry); }"
                    @select="toggleSessionDetail">
                </tl-grid>
            </template>
            <!-- 全��程: タイムライン表示 -->
            <template v-else>
                <div v-for="date in grpDates(grp.id)" :key="'grp-tl-'+grp.id+'-'+date" style="margin-bottom:32px">
                    <h3 style="margin:0 0 12px;padding:8px 16px;border-radius:6px;color:#fff;font-size:1rem"
                        :style="{background: grp.color || '#1a73e8'}">
                        {{ date }}
                    </h3>
                    <div class="tl-list">
                        <div v-for="entry in (groupSchedule[grp.id] || []).filter(e => e.session.start_time && e.session.start_time.startsWith(date))" :key="'grp-tl-e-'+entry.session.id"
                             class="tl-list-row"
                             :style="{opacity: groupSessionOpacity(grp.id, entry)}"
                             @click="toggleSessionDetail(entry.session.id)">
                            <div class="tl-list-time">
                                <TimeRange :start="entry.session.start_time" :end="entry.session.end_time" :show-date="false" size="sm" />
                            </div>
                            <div class="tl-list-main">
                                <div style="font-weight:600;font-size:0.9rem">{{ entry.session.title }}</div>
                                <div v-if="entry.session.room" style="font-size:0.75rem;color:#888;margin-top:2px">{{ entry.session.room.name }}</div>
                            </div>
                            <div class="tl-list-staff">
                                <template v-if="entry.assigned_staff.length">
                                    <PersonChip v-for="a in entry.assigned_staff" :key="a.assignment_id" :staff="a.staff" size="xs" />
                                </template>
                                <span v-else-if="entry.session.required_staff === 0" class="badge" style="background:#e8eaed;color:#5f6368;font-size:0.7rem">配置不要</span>
                                <span v-else class="badge warn" style="font-size:0.7rem">未配置</span>
                            </div>
                        </div>
                    </div>
                </div>
            </template>

            <!-- セッション一覧 -->
            <h3 style="margin-top:24px">セッション一覧</h3>
            <table v-if="grpDateFiltered(grp.id).length">
                <thead><tr><th style="width:30px"><input type="checkbox" @change="toggleGroupSelectAll(grp.id)" :checked="groupSelectedSessions[grp.id] && groupSelectedSessions[grp.id].size === grpDateFiltered(grp.id).length && grpDateFiltered(grp.id).length > 0"></th><th>セッション</th><th>時間</th><th>部屋</th><th>担当スタッフ</th></tr></thead>
                <tbody>
                    <tr v-for="e in grpDateFiltered(grp.id)" :key="'ga-'+grp.id+'-'+e.session.id"
                        :style="{ opacity: groupSessionOpacity(grp.id, e) }">
                        <td><input type="checkbox" :checked="groupSelectedSessions[grp.id] && groupSelectedSessions[grp.id].has(e.session.id)" @change="toggleGroupSessionSelect(grp.id, e.session.id)"></td>
                        <td><a href="#" @click.prevent="toggleSessionDetail(e.session.id)" style="color:#1a73e8;text-decoration:none"><strong>{{ e.session.title }}</strong></a></td>
                        <td style="white-space:nowrap"><TimeRange :start="e.session.start_time" :end="e.session.end_time" :show-date="false" size="sm" inline /></td>
                        <td>{{ e.session.room ? e.session.room.name : '' }}</td>
                        <td>
                            <div style="display:flex;flex-wrap:wrap;gap:4px;align-items:center">
                                <template v-if="e.assigned_staff.length">
                                    <PersonChip v-for="a in e.assigned_staff" :key="a.assignment_id" :staff="a.staff" size="xs">
                                        <button v-if="!groupLocks[grp.id]" @click.stop="removeAssignment(a.assignment_id)" class="chip-x" title="削除">&#10005;</button>
                                    </PersonChip>
                                </template>
                                <span v-else-if="e.session.required_staff === 0" class="badge" style="background:#e8eaed;color:#5f6368">配置不要</span>
                                <span v-else class="badge warn">未配置</span>
                                <AssignStaffPicker v-if="!groupLocks[grp.id]" :entry="e" />
                            </div>
                        </td>
                    </tr>
                </tbody>
            </table>
        </div>
        </template>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useRoute } from 'vue-router'
import { useStore } from '../store'
import TimeRange from '../components/TimeRange.vue'
import PersonChip from '../components/PersonChip.vue'
import StaffFilterSelect from '../components/StaffFilterSelect.vue'
import AssignStaffPicker from '../components/AssignStaffPicker.vue'
import SkeletonBlock from '../components/SkeletonBlock.vue'
import EmptyState from '../components/EmptyState.vue'

const route = useRoute()
const gid = computed(() => Number(route.params.id))

const {
    isTodayDate,
    loaded, tab, sessionGroups,
    fmtShort, toggleSessionDetail, removeAssignment,
    calcRequiredStaff, calcStaffMsg, calcStaffSummary,
    groupLocks, groupSchedule, groupScheduleMsgs, groupSelectedSessions,
    groupSessionOpacity, groupStaffFilters, filteredGroupSessions,
    grpDateFiltered, grpDateTabs, grpDates,
    grpGridStyle, grpGridRooms, grpGridLabels, grpSessionStyle, grpDragSessionStyle, onGrpDragStart,
    autoAssignGroup, autoAssignGroupFill, autoAssignGroupSelected, clearGroupAssignments,
    toggleGroupSelectAll, toggleGroupSessionSelect,
} = useStore()
</script>
