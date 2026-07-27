<template>
        <div class="panel active">
            <h2>全体スケジュール管理</h2>

            <!-- 日程タブ -->
            <div v-if="catDates.length > 0" class="tab-bar">
                <button class="tab-btn"
                    :style="allGroupTab === 0 ? {background:'#333', color:'#fff'} : {background:'#f5f5f5', color:'#666'}"
                    @click="allGroupTab = 0">
                    全日程
                </button>
                <button v-for="date in catDates" :key="'ovm-tab-'+date"
                    class="tab-btn"
                    :style="allGroupTab === date ? {background:'#e65100', color:'#fff'} : {background:'#f5f5f5', color:'#666'}"
                    @click="allGroupTab = date">
                    {{ date }}
                </button>
            </div>

            <!-- 全体スケジュール登録フォーム -->
            <div style="margin-bottom:20px;border:1px solid #ffe0b2;border-radius:8px;padding:16px;background:#fff8e1">
                <h3 style="margin:0 0 12px;color:#e65100">{{ allOvForm.editId ? '全体スケジュール編集' : '全体スケジュール追加' }}</h3>
                <div class="form-row">
                    <div class="form-group"><label>タイトル <span class="req">必須</span></label><input v-model="allOvForm.title" placeholder="例: 集合時間、開場、昼休み"></div>
                </div>
                <div class="form-row">
                    <div class="form-group"><label>開始時刻 <span class="req">必須</span></label><input v-model="allOvForm.start_time" type="datetime-local" step="300" @change="autoSetEndTime(allOvForm)"></div>
                    <div class="form-group"><label>終了時刻 <span class="req">必須</span></label><input v-model="allOvForm.end_time" type="datetime-local" step="300"></div>
                </div>
                <div class="form-group"><label>備考</label><textarea v-model="allOvForm.notes" rows="2" placeholder="例: 正面入口に集合"></textarea></div>
                <div style="display:flex;gap:8px">
                    <button class="btn" style="background:#e65100" @click="submitAllOverall">{{ allOvForm.editId ? '更新' : '追加' }}</button>
                    <button v-if="allOvForm.editId" class="btn btn-danger" @click="cancelAllOverall">キャンセル</button>
                </div>
            </div>

            <!-- 配置表 -->
            <template v-if="ovManageFiltered().length && allGroupTab !== 0">
                <h3 style="margin-top:0">配置表</h3>
                <tl-grid
                    :grid-style="ovManageGridStyle()" :rooms="ovManageGridRooms()" :labels="ovManageGridLabels()"
                    :entries="ovManageFiltered()" color="#e65100"
                    :entry-style="e => ovManageDragSessionStyle(e)"
                    :fmt-short="fmtShort"
                    @dragstart="(ev, entry) => onOvManageDragStart(ev, entry)"
                    @select="(id, ev, entry) => showGridMenu(ev, entry, 'overall', '')">
                </tl-grid>
            </template>

            <!-- 全体スケジュール一覧 -->
            <h3>登録済み一覧</h3>
            <p v-if="!overallSessions.length" style="color:#666">全体スケジュールがまだ登録されていません。</p>
            <table v-else>
                <thead><tr><th>タイトル</th><th>時間</th><th>備考</th><th>操作</th></tr></thead>
                <tbody>
                    <tr v-for="s in overallSessions" :key="'ov-'+s.id" :style="allOvForm.editId === s.id ? 'background:#fff3e0;outline:2px solid #ff9800' : ''">
                        <td><strong>{{ s.title }}</strong></td>
                        <td style="white-space:nowrap">{{ fmt(s.start_time) }} - {{ fmt(s.end_time) }}</td>
                        <td style="font-size:0.85rem;color:#666">{{ s.notes || '-' }}</td>
                        <td>
                            <button class="btn btn-sm edit-btn" @click="editAllEntry(s)" style="margin-right:4px" :style="allOvForm.editId === s.id ? 'background:#ff9800;color:#fff' : ''">{{ allOvForm.editId === s.id ? '編集中' : '編集' }}</button>
                            <button class="del-btn" @click="deleteAllEntry(s.id, 'overall')">削除</button>
                        </td>
                    </tr>
                </tbody>
            </table>
        </div>
</template>

<script setup lang="ts">
import { useStore } from '../store'

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
