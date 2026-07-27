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
                    {{ date }}
                </button>
            </div>

            <div v-if="!categoryLocks[cat.key]" style="display:flex;flex-wrap:wrap;gap:8px;align-items:center;margin-bottom:12px">
                <button class="btn btn-success" @click="autoAssignCategory(cat.key)">スタッフ自動配置</button>
                <button class="btn" style="background:#1a73e8" @click="autoAssignCategorySelected(cat.key)" :disabled="!(catSelectedSessions[cat.key] && catSelectedSessions[cat.key].size)">選択して再配置 <span v-if="catSelectedSessions[cat.key] && catSelectedSessions[cat.key].size">({{ catSelectedSessions[cat.key].size }}件)</span></button>
                <button class="btn" style="background:#f9ab00" @click="autoAssignCategoryFill(cat.key)">未配置を埋める</button>
                <button class="btn btn-danger" @click="clearCategoryAssignments(cat.key)">配置をクリア</button>
                <div v-if="categoryAssignMsgs[cat.key]" class="msg success" style="margin:0">{{ categoryAssignMsgs[cat.key] }}</div>
            </div>
            <div style="display:flex;align-items:center;gap:8px;margin-bottom:12px">
                <label style="font-weight:600;font-size:0.9rem">スタッフ絞り込み:</label>
                <select v-model.number="categoryStaffFilters[cat.key]" style="padding:6px 12px;border:1px solid #ccc;border-radius:6px;font-size:0.9rem;min-width:180px">
                    <option :value="0">全員表示</option>
                    <option v-for="s in staffs" :key="s.id" :value="s.id">{{ s.name }}</option>
                </select>
                <span v-if="categoryStaffFilters[cat.key]" style="font-size:0.85rem;color:#666">{{ filteredCategorySessions(cat.key).length }}/{{ catGroupFiltered(cat.key).length }}件</span>
            </div>
            <p v-if="!catGroupFiltered(cat.key).length" style="color:#888">{{ cat.label }}がまだ登録されていません。「{{ cat.label }}管理」から追加してください。</p>
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
                                    {{ fmtShort(entry.session.start_time) }} - {{ fmtShort(entry.session.end_time) }}
                                </div>
                                <div class="tl-list-main"
                                     :style="allSessionBg(cat.key)">
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
                            <td style="white-space:nowrap">{{ fmtShort(e.session.start_time) }} - {{ fmtShort(e.session.end_time) }}</td>
                            <td>{{ e.session.room ? e.session.room.name : '' }}</td>
                            <td>
                                <div style="display:flex;flex-wrap:wrap;gap:4px;align-items:center">
                                    <template v-if="e.assigned_staff.length">
                                        <span class="badge" v-for="a in e.assigned_staff" :key="a.assignment_id" style="display:inline-flex;align-items:center;gap:4px">
                                            {{ a.staff.name }}
                                            <button v-if="!categoryLocks[cat.key]" @click="removeAssignment(a.assignment_id)" style="background:none;border:none;color:#d93025;cursor:pointer;font-size:0.9rem;padding:0 2px" title="削除">&#10005;</button>
                                        </span>
                                    </template>
                                    <span v-else class="badge warn">未配置</span>
                                    <template v-if="!categoryLocks[cat.key]">
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
            </template>
        </div>
        </template>
</template>

<script setup lang="ts">
import { useStore } from '../store'

import { computed } from 'vue'
import { useRoute } from 'vue-router'

const route = useRoute()
const ckey = computed(() => route.params.key)

const {
    _enterTab, tab, sidebarOpen, rooms,
    selectableRooms, overallRoomId, sessions, staffs,
    schedule, staffAssignments, staffAssignmentsWithAll, scheduleMsg,
    scheduleMsgError, sessPhotoPreview, sessPhoto, roomForm,
    sessForm, staffForm, roleDropdownOpen, prefForms,
    availForms, ltTalks, venueMaps, venueMapForm,
    venueMapPreview, venueMapInput, mapModal, switchTab,
    catLabel, fmt, fmtShort, sortedPrefs,
    autoSetEndTime, cancelEditRoom, editRoom, submitRoom,
    deleteRoom, onVenueMapChange, cancelEditVenueMap, editVenueMap,
    submitVenueMap, deleteVenueMap, sessDetailSession, sessDetailEntry,
    sessDetailLocked, toggleSessionDetail, toggleSessDetailLock, gridMenu,
    showGridMenu, gridMenuEdit, gridMenuDelete, gridMenuDetail,
    isMultiSpeakerCat, onPhotoChange, onPhotoPaste, onLTTalkPhoto,
    autoSetLTEndTime, toggleRepresentative, cancelEditSession, editSession,
    submitSession, deleteSession, addLTTalk, calcStaffMsg,
    calcStaffSummary, calcRequiredStaff, newStaffAvails, newAvailForm,
    addNewStaffAvail, newStaffPrefs, newPrefForm, addNewStaffPref,
    sessionTitle, sessionLabel, staffAssignCount, editingStaffPrefs,
    editingStaffAvails, submitStaff, editStaff, cancelEditStaff,
    deleteStaff, uploadStaffPhoto, deleteStaffPhoto, onNewStaffPhoto,
    clearNewStaffPhoto, staffPhotoPreview, addPref, removePref,
    addAvail, removeAvail, sessionSchedule, sessionGroups,
    groupLocks, groupSessForms, groupStaffFilters, groupScheduleMsgs,
    groupSelectedSessions, grpDateTabs, grpDates, grpDateFiltered,
    groupSchedule, filteredGroupSchedule, filteredGroupSessions, groupSessionOpacity,
    groupSessions, cancelEditGroupSession, editGroupSession, submitGroupSession,
    deleteGroupSession, onGroupPhotoChange, autoAssignGroup, autoAssignGroupSelected,
    autoAssignGroupFill, clearGroupAssignments, toggleGroupSessionSelect, toggleGroupSelectAll,
    grpGridConfig, grpGridRooms, grpGridStyle, grpGridLabels,
    grpSessionStyle, grpDragSessionStyle, onGrpDragStart, grpSelectedSession,
    grpSelectedEntry, categories, dynamicCatKeys, categoryLocks,
    categoryForms, categoryAssignMsgs, categoryStaffFilters, categorySessions,
    catDates, catKeyDates, catGroupTabs, catGroupFiltered,
    catTimelineByGroup, filteredCategorySessions, catSessionOpacity, cancelEditCategory,
    editCategory, submitCategory, deleteCategory, autoAssignCategory,
    clearCategoryAssignments, catSelectedSessions, autoAssignCategorySelected, autoAssignCategoryFill,
    toggleCatSessionSelect, toggleCatSelectAll, catGridConfig, catGridRooms,
    catGridStyle, catGridLabels, catSessionStyle, catDragSessionStyle,
    onCatDragStart, catSelectedSession, catSelectedEntry, roleOptions,
    assignStaffSelect, availableStaffs, addAssignment, removeAssignment,
    setAllStaff, unsetAllStaff, addAssignmentOrAll, selectedSessions,
    toggleSessionSelect, toggleSelectAll, autoAssign, autoAssignSelected,
    autoAssignFill, clearAssignments, tlRooms, tlGridStyle,
    tlLabels, tlSessionStyle, tlBreaks, matrixLocked,
    drag, dragSessionStyle, onDragStart, dragCursor,
    exportExcel, exportBackup, backupFileName, ioMsg,
    ioMsgError, onBackupFileChange, importBackup, connpassTimeline,
    speakerTemplate, connpassBaseUrl, generateConnpassTimeline, generateSpeakerTemplate,
    copyToClipboard, resetAllData, resetMsg, resetMsgError,
    resetPassword, resetPwForm, resetPwMsg, resetPwMsgError,
    changeResetPassword, appTitle, allowOverlap, travelBufferMin,
    settingsForm, settingsMsg, saveSettings, pwForm,
    pwMsg, pwMsgError, changePassword, catSettingForm,
    catSettingMsg, editCatSetting, cancelCatSetting, saveCatSetting,
    deleteCatSetting, grpSettingForm, grpSettingMsg, editGrpSetting,
    cancelGrpSetting, saveGrpSetting, deleteGrpSetting, sessionCatOptions,
    extraSessionCats, defaultSessionCats, sessCatForm, sessCatMsg,
    editSessCat, cancelSessCat, saveSessCat, deleteSessCat,
    customRoles, roleSettingForm, roleSettingMsg, editRoleSetting,
    cancelRoleSetting, saveRoleSetting, deleteRoleSetting, categoryRoleLinks,
    catRoleLinkSelect, addCatRoleLink, removeCatRoleLink, groupRoleLinks,
    grpRoleLinkSelect, addGrpRoleLink, removeGrpRoleLink, staffDetailFilter,
    staffDetailMatch, matrixStaffFilter, matrixStaffOptions, overallSessions,
    overallLocked, overallStaffFilter, overallAssignMsg, overallSelectedSessions,
    overallDateTab, overallSchedule, overallDateFiltered, filteredOverallSchedule,
    overallSessionOpacity, overallDates, toggleOverallSessionSelect, toggleOverallSelectAll,
    autoAssignOverall, autoAssignOverallSelected, clearOverallAssignments, ovGridConfig,
    ovGridRooms, ovGridStyle, ovGridLabels, ovSessionStyle,
    ovDragSessionStyle, onOvDragStart, ovManageFiltered, ovManageGridStyle,
    ovManageGridRooms, ovManageGridLabels, ovManageSessionStyle, ovManageDragSessionStyle,
    onOvManageDragStart, allGroupTab, allStaffFilter, allSchedule,
    allTimelineByGroup, allConfig, allColumns, allGridStyle,
    allLabels, allSessionStyle, allSessionBg, allSessionOpacity,
    allSelectedSession, allSelectedEntry, allAssignMsg, allOvForm,
    cancelAllOverall, submitAllOverall, editAllEntry, deleteAllEntry,
    autoAssignAll, filteredMatrixSchedule, matrixSessionOpacity, _hasStaff,
    CAT_BG, abSettings, abStatus, abHistory,
    abMsg, abDownload, loadAbSettings, loadAbStatus,
    loadAbHistory, saveAbSettings, triggerBackupNow, deleteBackupEntry,
    downloadBackupEntry, pubApi, pubHistory, pubMsg,
    pubMsgError, pubApiUrl, loadPubApiSettings, savePubApiSettings,
    regenerateApiKey, clearGithubToken, publishSnapshot, loadPubHistory,
    activateSnapshot, deleteSnapshot, copyApiUrl, copyApiKey,
} = useStore()
</script>
