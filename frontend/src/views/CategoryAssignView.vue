<template>
        <template v-for="cat in categories" :key="'cata-'+cat.key">
        <div v-if="cat.key === ckey" class="panel active">
            <div style="display:flex;align-items:center;gap:12px;margin-bottom:16px">
                <h2 style="margin:0">{{ cat.label }}担当</h2>
                <button @click="categoryLocks[cat.key] = !categoryLocks[cat.key]"
                        :style="{ background: categoryLocks[cat.key] ? '#e8eaed' : '#fce8e6', color: categoryLocks[cat.key] ? '#5f6368' : '#c5221f', border: categoryLocks[cat.key] ? '1px solid #dadce0' : '1px solid #c5221f', borderRadius: '20px', padding: '5px 14px', cursor: 'pointer', fontSize: '0.85rem', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '6px' }">
                    <span v-if="categoryLocks[cat.key]">&#128274; ロック中</span>
                    <span v-else>&#128275; 編集中</span>
                </button>
            </div>

            <!-- 日程タブ -->
            <div v-if="catKeyDates(cat.key).length > 0" class="tab-bar">
                <button class="tab-btn"
                    :style="catGroupTabs[cat.key] === 0 ? {background:'#333', color:'#fff'} : {background:'#f5f5f5', color:'#666'}"
                    @click="catGroupTabs[cat.key] = 0">
                    全日程
                </button>
                <button v-for="date in catKeyDates(cat.key)" :key="'cat-tab-'+cat.key+'-'+date"
                    class="tab-btn"
                    :style="catGroupTabs[cat.key] === date ? {background: cat.color || '#1a73e8', color:'#fff'} : {background:'#f5f5f5', color:'#666'}"
                    @click="catGroupTabs[cat.key] = date">
                    {{ date }}<span v-if="isTodayDate(date)" class="today-dot">今日</span>
                </button>
            </div>

            <div v-if="!categoryLocks[cat.key]" style="display:flex;flex-wrap:wrap;gap:8px;align-items:center;margin-bottom:12px">
                <button v-if="catTabDate(cat.key)" class="btn btn-success" @click="autoAssignCategory(cat.key)">
                    {{ catTabDate(cat.key) }} を自動配置
                </button>
                <button class="btn" style="background:#1a73e8" @click="autoAssignCategorySelected(cat.key)" :disabled="!(catSelectedSessions[cat.key] && catSelectedSessions[cat.key].size)">選択して再配置 <span v-if="catSelectedSessions[cat.key] && catSelectedSessions[cat.key].size">({{ catSelectedSessions[cat.key].size }}件)</span></button>
                <button v-if="catTabDate(cat.key)" class="btn" style="background:#f9ab00" @click="autoAssignCategoryFill(cat.key)">未配置を埋める</button>
                <button class="btn btn-danger" @click="clearCategoryAssignments(cat.key)">配置をクリア</button>
                <div v-if="categoryAssignMsgs[cat.key]" class="msg success" style="margin:0">{{ categoryAssignMsgs[cat.key] }}</div>
            </div>
            <div v-if="!categoryLocks[cat.key] && !catTabDate(cat.key)" style="margin-bottom:12px;font-size:0.85rem;color:#b06000;background:#fff8e1;border-radius:6px;padding:8px 12px">
                自動配置は日程ごとに実行します。上の日程タブから日付を選んでください。選んだ日の全セッション（全カテゴリ）がまとめて配置されます。
            </div>
            <StaffFilterSelect
                v-model="categoryStaffFilters[cat.key]"
                :hint="`${filteredCategorySessions(cat.key).length}/${catGroupFiltered(cat.key).length}件`" />
            <SkeletonBlock v-if="!loaded.schedule" :lines="4" :height="64" label="配置表を読み込み中" />
            <EmptyState v-else-if="!catGroupFiltered(cat.key).length"
                icon="&#128203;"
                :title="`${cat.label}がまだ登録されていません`"
                :hint="`「${cat.label}管理」から追加してください。`" />
            <template v-if="catGroupFiltered(cat.key).length">

                <!-- グループ別: マトリクス表示 -->
                <template v-if="catGroupTabs[cat.key] !== 0">
                    <tl-grid
                        :grid-style="catGridStyle(cat.key)" :rooms="catGridRooms(cat.key)" :labels="catGridLabels(cat.key)"
                        :entries="catGroupFiltered(cat.key)" :color="cat.color || '#1a73e8'"
                        :entry-style="e => categoryLocks[cat.key] ? {...catSessionStyle(cat.key, e), opacity: catSessionOpacity(cat.key, e), ...allSessionBg(cat.key), cursor: 'pointer'} : catDragSessionStyle(cat.key, e)"
                        :fmt-short="fmtShort"
                        @dragstart="(ev, entry) => { if (!categoryLocks[cat.key]) onCatDragStart(ev, cat.key, entry); }"
                        @select="toggleSessionDetail">
                    </tl-grid>
                </template>

                <!-- 全日程: タイムライン表示 -->
                <template v-else>
                    <div v-for="date in catKeyDates(cat.key)" :key="'cat-tl-grp-'+cat.key+'-'+date" style="margin-bottom:32px">
                        <h3 style="margin:0 0 12px;padding:8px 16px;border-radius:6px;color:#fff;font-size:1rem"
                            :style="{background: cat.color || '#1a73e8'}">
                            {{ date }}
                        </h3>
                        <div v-if="!(catTimelineByGroup(cat.key)[date] || []).length" style="color:#888;font-size:0.9rem;margin-bottom:12px">この日程に{{ cat.label }}はありません。</div>
                        <div v-else class="tl-list">
                            <div v-for="entry in catTimelineByGroup(cat.key)[date]" :key="'cat-tl-'+cat.key+'-'+entry.session.id"
                                 class="tl-list-row"
                                 :style="{opacity: catSessionOpacity(cat.key, entry)}"
                                 @click="toggleSessionDetail(entry.session.id)">
                                <div class="tl-list-time">
                                    <TimeRange :start="entry.session.start_time" :end="entry.session.end_time" :show-date="false" size="sm" />
                                </div>
                                <div class="tl-list-main"
                                     :style="allSessionBg(cat.key)">
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

                <h3 style="margin-top:24px">役割一覧</h3>
                <table>
                    <thead><tr>
                        <th v-if="!categoryLocks[cat.key]" style="width:30px"><input type="checkbox" @change="toggleCatSelectAll(cat.key)" :checked="catSelectedSessions[cat.key] && catSelectedSessions[cat.key].size === catGroupFiltered(cat.key).length && catGroupFiltered(cat.key).length > 0"></th>
                        <th>{{ cat.label }}名</th><th>時間</th><th>場所</th><th>担当スタッフ</th>
                    </tr></thead>
                    <tbody>
                        <tr v-for="e in catGroupFiltered(cat.key)" :key="'cttbl-'+cat.key+'-'+e.session.id"
                            :style="{ opacity: catSessionOpacity(cat.key, e) }">
                            <td v-if="!categoryLocks[cat.key]"><input type="checkbox" :checked="catSelectedSessions[cat.key] && catSelectedSessions[cat.key].has(e.session.id)" @change="toggleCatSessionSelect(cat.key, e.session.id)"></td>
                            <td><a href="#" @click.prevent="toggleSessionDetail(e.session.id)" style="color:#1a73e8;text-decoration:none"><strong>{{ e.session.title }}</strong></a></td>
                            <td style="white-space:nowrap"><TimeRange :start="e.session.start_time" :end="e.session.end_time" :show-date="false" size="sm" inline /></td>
                            <td>{{ e.session.room ? e.session.room.name : '' }}</td>
                            <td>
                                <div style="display:flex;flex-wrap:wrap;gap:4px;align-items:center">
                                    <template v-if="e.assigned_staff.length">
                                        <PersonChip v-for="a in e.assigned_staff" :key="a.assignment_id" :staff="a.staff" size="xs">
                                            <button v-if="!categoryLocks[cat.key]" @click.stop="removeAssignment(a.assignment_id)" class="chip-x" title="削除">&#10005;</button>
                                        </PersonChip>
                                    </template>
                                    <span v-else-if="e.session.required_staff === 0" class="badge" style="background:#e8eaed;color:#5f6368">配置不要</span>
                                    <span v-else class="badge warn">未配置</span>
                                    <AssignStaffPicker v-if="!categoryLocks[cat.key]" :entry="e" />
                                </div>
                            </td>
                        </tr>
                    </tbody>
                </table>
            </template>
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
const ckey = computed(() => route.params.key)

const {
    isTodayDate,
    loaded, tab, categories, fmtShort, toggleSessionDetail, removeAssignment,
    allSessionBg,
    categoryLocks, categoryAssignMsgs, categoryStaffFilters,
    catGroupFiltered, catGroupTabs, catKeyDates, catTabDate, catTimelineByGroup,
    catSelectedSessions, catSessionOpacity, catSessionStyle, catDragSessionStyle, onCatDragStart,
    catGridStyle, catGridRooms, catGridLabels,
    filteredCategorySessions,
    autoAssignCategory, autoAssignCategoryFill, autoAssignCategorySelected, clearCategoryAssignments,
    toggleCatSelectAll, toggleCatSessionSelect,
} = useStore()
</script>
