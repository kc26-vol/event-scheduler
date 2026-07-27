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
                    {{ date }}
                </button>
            </div>

            <!-- 自動配置ボタン -->
            <div v-if="!groupLocks[grp.id]" style="display:flex;flex-wrap:wrap;gap:8px;align-items:center;margin-bottom:12px">
                <button class="btn btn-success" @click="autoAssignGroup(grp.id)">スタッフ自動配置</button>
                <button class="btn" style="background:#1a73e8" @click="autoAssignGroupSelected(grp.id)" :disabled="!(groupSelectedSessions[grp.id] && groupSelectedSessions[grp.id].size)">選択して再配置 <span v-if="groupSelectedSessions[grp.id] && groupSelectedSessions[grp.id].size">({{ groupSelectedSessions[grp.id].size }}件)</span></button>
                <button class="btn" style="background:#f9ab00" @click="autoAssignGroupFill(grp.id)">未配置を埋める</button>
                <button class="btn btn-danger" @click="clearGroupAssignments(grp.id)">配置をクリア</button>
                <span v-if="groupScheduleMsgs[grp.id]" style="font-size:0.85rem;color:#137333">{{ groupScheduleMsgs[grp.id] }}</span>
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
            <div style="display:flex;align-items:center;gap:8px;margin-bottom:12px">
                <label style="font-weight:600;font-size:0.9rem">スタッフ絞り込み:</label>
                <select v-model.number="groupStaffFilters[grp.id]" style="padding:6px 12px;border:1px solid #ccc;border-radius:6px;font-size:0.9rem;min-width:180px">
                    <option :value="0">全員表示</option>
                    <option v-for="s in staffs" :key="s.id" :value="s.id">{{ s.name }}</option>
                </select>
                <span v-if="groupStaffFilters[grp.id]" style="font-size:0.85rem;color:#666">{{ filteredGroupSessions(grp.id).length }}/{{ grpDateFiltered(grp.id).length }}件</span>
            </div>

            <!-- タイムライングリッド -->
            <h3 style="margin-top:0">配置表</h3>
            <p v-if="!grpDateFiltered(grp.id).length">セッションがまだ登録されていません。</p>
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
                                {{ fmtShort(entry.session.start_time) }} - {{ fmtShort(entry.session.end_time) }}
                            </div>
                            <div class="tl-list-main">
                                <div style="font-weight:600;font-size:0.9rem">{{ entry.session.title }}</div>
                                <div v-if="entry.session.room" style="font-size:0.75rem;color:#888;margin-top:2px">{{ entry.session.room.name }}</div>
                            </div>
                            <div class="tl-list-staff">
                                <template v-if="entry.assigned_staff.length">
                                    <span class="badge" v-for="a in entry.assigned_staff" :key="a.assignment_id" style="font-size:0.7rem">{{ a.staff.name }}</span>
                                </template>
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
                        <td style="white-space:nowrap">{{ fmtShort(e.session.start_time) }} - {{ fmtShort(e.session.end_time) }}</td>
                        <td>{{ e.session.room ? e.session.room.name : '' }}</td>
                        <td>
                            <div style="display:flex;flex-wrap:wrap;gap:4px;align-items:center">
                                <template v-if="e.assigned_staff.length">
                                    <span class="badge" v-for="a in e.assigned_staff" :key="a.assignment_id" style="display:inline-flex;align-items:center;gap:4px">
                                        {{ a.staff.name }}
                                        <button v-if="!groupLocks[grp.id]" @click="removeAssignment(a.assignment_id)" style="background:none;border:none;color:#d93025;cursor:pointer;font-size:0.9rem;padding:0 2px" title="削除">&#10005;</button>
                                    </span>
                                </template>
                                <span v-else class="badge warn">未配置</span>
                                <template v-if="!groupLocks[grp.id]">
                                    <select v-model.number="assignStaffSelect[e.session.id]" style="padding:2px 6px;font-size:0.8rem;border:1px solid #ccc;border-radius:4px;margin-left:4px">
                                        <option :value="0">＋追加</option>
                                        <option v-for="s in availableStaffs(e)" :key="s.id" :value="s.id">{{ s.name }}</option>
                                    </select>
                                    <button v-if="assignStaffSelect[e.session.id]" class="btn btn-sm" @click="addAssignment(e.session.id)" style="padding:2px 8px">追加</button>
                                </template>
                            </div>
                        </td>
                    </tr>
                </tbody>
            </table>
        </div>
        </template>
</template>

<script>
import { computed } from 'vue'
import { useRoute } from 'vue-router'
import { useStore } from '../store'

export default {
    setup() {
        const route = useRoute()
        return { ...useStore(), gid: computed(() => Number(route.params.id)) }
    },
}
</script>
