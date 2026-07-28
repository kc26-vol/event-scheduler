<template>
        <div class="panel active">
            <div style="display:flex;align-items:center;gap:12px;margin-bottom:16px">
                <h2 style="margin:0">全体スケジュール担当</h2>
                <button @click="overallLocked = !overallLocked"
                        :style="{ background: overallLocked ? '#e8eaed' : '#fce8e6', color: overallLocked ? '#5f6368' : '#c5221f', border: overallLocked ? '1px solid #dadce0' : '1px solid #c5221f', borderRadius: '20px', padding: '5px 14px', cursor: 'pointer', fontSize: '0.85rem', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '6px' }">
                    <span v-if="overallLocked">&#128274; ロック中</span>
                    <span v-else>&#128275; 編集中</span>
                </button>
            </div>

            <!-- 日程タブ -->
            <div v-if="overallDates().length > 0" class="tab-bar">
                <button class="tab-btn"
                    :style="overallDateTab === 0 ? {background:'#333', color:'#fff'} : {background:'#f5f5f5', color:'#666'}"
                    @click="overallDateTab = 0">
                    全日程
                </button>
                <button v-for="date in overallDates()" :key="'ov-dtab-'+date"
                    class="tab-btn"
                    :style="overallDateTab === date ? {background:'#e65100', color:'#fff'} : {background:'#f5f5f5', color:'#666'}"
                    @click="overallDateTab = date">
                    {{ date }}<span v-if="isTodayDate(date)" class="today-dot">今日</span>
                </button>
            </div>

            <!-- 自動配置ボタン -->
            <div v-if="!overallLocked" style="display:flex;flex-wrap:wrap;gap:8px;align-items:center;margin-bottom:12px">
                <button v-if="overallDateTab && overallDateTab !== 0" class="btn btn-success" @click="autoAssignOverall()">
                    {{ overallDateTab }} を自動配置
                </button>
                <button class="btn" style="background:#1a73e8" @click="autoAssignOverallSelected()" :disabled="!overallSelectedSessions.size">選択して再配置 <span v-if="overallSelectedSessions.size">({{ overallSelectedSessions.size }}件)</span></button>
                <button class="btn btn-danger" @click="clearOverallAssignments()">配置をクリア</button>
                <div v-if="overallAssignMsg" class="msg success" style="margin:0">{{ overallAssignMsg }}</div>
            </div>
            <div v-if="!overallLocked && (!overallDateTab || overallDateTab === 0)" style="margin-bottom:12px;font-size:0.85rem;color:#b06000;background:#fff8e1;border-radius:6px;padding:8px 12px">
                自動配置は日程ごとに実行します。上の日程タブから日付を選んでください。選んだ日の全セッション（全カテゴリ）がまとめて配置されます。
            </div>

            <!-- スタッフフィルター -->
            <StaffFilterSelect v-model="overallStaffFilter" />

            <!-- マトリクス -->
            <h3 style="margin-top:0">配置表</h3>
            <SkeletonBlock v-if="!loaded.schedule" :lines="4" :height="64" label="配置表を読み込み中" />
            <EmptyState v-else-if="!overallDateFiltered().length"
                icon="&#128197;"
                title="全体スケジュールがまだ登録されていません"
                hint="「管理」→「全体スケジュール管理」から追加してください。" />
            <template v-else-if="overallDateTab !== 0">
                <tl-grid
                    :grid-style="ovGridStyle()" :rooms="ovGridRooms()" :labels="ovGridLabels()"
                    :entries="overallDateFiltered()" color="#e65100"
                    :entry-style="e => overallLocked ? { ...ovSessionStyle(e), opacity: overallSessionOpacity(e), ...allSessionBg('overall'), cursor: 'pointer' } : ovDragSessionStyle(e)"
                    :fmt-short="fmtShort"
                    @dragstart="(ev, entry) => { if (!overallLocked) onOvDragStart(ev, entry); }"
                    @select="toggleSessionDetail">
                </tl-grid>
            </template>
            <!-- 全日程: タイムライン -->
            <template v-else>
                <div v-for="date in overallDates()" :key="'ov-tl-'+date" style="margin-bottom:32px">
                    <h3 style="margin:0 0 12px;padding:8px 16px;border-radius:6px;color:#fff;font-size:1rem;background:#e65100">{{ date }}</h3>
                    <div class="tl-list">
                        <div v-for="entry in overallSchedule.filter(e => e.session.start_time && e.session.start_time.startsWith(date))" :key="'ov-tl-e-'+entry.session.id"
                             class="tl-list-row"
                             :style="{opacity: overallSessionOpacity(entry)}"
                             @click="toggleSessionDetail(entry.session.id)">
                            <div class="tl-list-time">
                                <TimeRange :start="entry.session.start_time" :end="entry.session.end_time" :show-date="false" size="sm" />
                            </div>
                            <div class="tl-list-main" :style="allSessionBg('overall')">
                                <div style="font-weight:600;font-size:0.9rem">{{ entry.session.title }}</div>
                                <div style="margin-top:4px">
                                    <span v-if="entry.session.required_staff === -1" class="badge" style="background:#e65100;color:#fff">全員</span>
                                    <template v-else-if="entry.assigned_staff.length">
                                        <PersonChip v-for="a in entry.assigned_staff" :key="a.assignment_id" :staff="a.staff" size="xs" />
                                    </template>
                                    <span v-else-if="entry.session.required_staff === 0" class="badge" style="background:#e8eaed;color:#5f6368">配置不要</span>
                                    <span v-else class="badge warn">未配置</span>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </template>

            <!-- セッション一覧 -->
            <h3 style="margin-top:24px">一覧</h3>
            <table v-if="overallDateFiltered().length">
                <thead><tr>
                    <th v-if="!overallLocked" style="width:30px"><input type="checkbox" @change="toggleOverallSelectAll()" :checked="overallSelectedSessions.size === overallDateFiltered().length && overallDateFiltered().length > 0"></th>
                    <th>タイトル</th><th>時間</th><th>場所</th><th>担当スタッフ</th>
                </tr></thead>
                <tbody>
                    <tr v-for="e in overallDateFiltered()" :key="'ova-'+e.session.id"
                        :style="{ opacity: overallSessionOpacity(e) }">
                        <td v-if="!overallLocked"><input type="checkbox" :checked="overallSelectedSessions.has(e.session.id)" @change="toggleOverallSessionSelect(e.session.id)"></td>
                        <td><a href="#" @click.prevent="toggleSessionDetail(e.session.id)" style="color:#1a73e8;text-decoration:none"><strong>{{ e.session.title }}</strong></a></td>
                        <td style="white-space:nowrap"><TimeRange :start="e.session.start_time" :end="e.session.end_time" :show-date="false" size="sm" inline /></td>
                        <td>{{ e.session.room ? e.session.room.name : '' }}</td>
                        <td>
                            <div style="display:flex;flex-wrap:wrap;gap:4px;align-items:center">
                                <span v-if="e.session.required_staff === -1" class="badge" style="background:#e65100;color:#fff;font-weight:600;display:inline-flex;align-items:center;gap:4px">
                                    全員
                                    <button v-if="!overallLocked" @click="unsetAllStaff(e.session.id)" style="background:none;border:none;color:#fff;cursor:pointer;font-size:0.9rem;padding:0 2px" title="解除">&#10005;</button>
                                </span>
                                <template v-else>
                                    <template v-if="e.assigned_staff.length">
                                        <PersonChip v-for="a in e.assigned_staff" :key="a.assignment_id" :staff="a.staff" size="xs">
                                            <button v-if="!overallLocked" @click.stop="removeAssignment(a.assignment_id)" class="chip-x" title="削除">&#10005;</button>
                                        </PersonChip>
                                    </template>
                                    <span v-else-if="e.session.required_staff === 0" class="badge" style="background:#e8eaed;color:#5f6368">配置不要</span>
                                    <span v-else class="badge warn">未配置</span>
                                </template>
                                <AssignStaffPicker v-if="!overallLocked" :entry="e" role="overall" allow-all />
                            </div>
                        </td>
                    </tr>
                </tbody>
            </table>
        </div>
</template>

<script setup lang="ts">
import { useStore } from '../store'
import TimeRange from '../components/TimeRange.vue'
import PersonChip from '../components/PersonChip.vue'
import StaffFilterSelect from '../components/StaffFilterSelect.vue'
import AssignStaffPicker from '../components/AssignStaffPicker.vue'
import SkeletonBlock from '../components/SkeletonBlock.vue'
import EmptyState from '../components/EmptyState.vue'

const {
    isTodayDate,
    loaded, fmtShort, toggleSessionDetail, removeAssignment, unsetAllStaff, allSessionBg,
    overallLocked, overallStaffFilter, overallAssignMsg, overallSelectedSessions,
    overallDateTab, overallSchedule, overallDateFiltered, overallDates, overallSessionOpacity,
    ovGridStyle, ovGridRooms, ovGridLabels, ovSessionStyle, ovDragSessionStyle, onOvDragStart,
    autoAssignOverall, autoAssignOverallSelected, clearOverallAssignments,
    toggleOverallSelectAll, toggleOverallSessionSelect,
} = useStore()
</script>
