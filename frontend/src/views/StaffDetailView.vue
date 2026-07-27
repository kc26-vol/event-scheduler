<template>
        <div class="panel active">
            <h2>スタッフ別詳細</h2>

            <!-- 担当フィルター -->
            <div style="display:flex;align-items:center;gap:8px;margin-bottom:16px">
                <label style="font-weight:600;font-size:0.9rem">担当絞り込み:</label>
                <select v-model="staffDetailFilter" style="padding:6px 12px;border:1px solid #ccc;border-radius:6px;font-size:0.9rem;min-width:180px">
                    <option value="">全員表示</option>
                    <option v-for="opt in roleOptions" :key="'sdf-'+opt.v" :value="opt.v">{{ opt.l }}</option>
                    <option value="none">なし</option>
                </select>
            </div>

            <p v-if="!staffAssignmentsWithAll.length">スタッフがまだ登録されていません。</p>
            <div v-for="e in staffAssignmentsWithAll" :key="'sd-'+e.staff.id" class="schedule-card"
                 v-show="staffDetailMatch(e.staff)">
                <div style="display:flex;align-items:center;gap:10px">
                    <img v-if="e.staff.photo" :src="e.staff.photo" :alt="e.staff.name" class="speaker-photo">
                    <span v-else class="speaker-photo-placeholder">{{ e.staff.name.charAt(0) }}</span>
                <h3 style="margin:0">{{ e.staff.name }}
                    <span v-if="e.staff.slack_name" style="font-size:0.85rem;font-weight:400;color:#888">( a.k.a {{ e.staff.slack_name }} )</span>
                    <span v-if="!e.staff.role || !e.staff.role.length" class="badge" style="background:#eceff1;color:#666">なし</span>
                    <span class="badge" v-for="r in (Array.isArray(e.staff.role) ? e.staff.role : [e.staff.role])" :key="r">{{ catLabel(r) }}</span>
                    <span v-if="e.staff.english_ok" class="badge" style="background:#e0f2f1;color:#00695c">EN</span>
                    <span v-if="e.staff.experience_count === 0" class="badge warn">初参加</span>
                    <span v-else class="badge avail">{{ e.staff.experience_count }}回目</span>
                    <span class="badge" style="background:#e8f0fe;color:#1a73e8">担当: {{ e.assigned_sessions.length }}件</span>
                </h3>
                </div>
                <div v-if="e.staff.availabilities && e.staff.availabilities.length" style="margin-bottom:8px">
                    <strong style="font-size:0.85rem">活動可能時間:</strong>
                    <span class="badge avail" v-for="a in e.staff.availabilities" :key="a.id">
                        {{ fmt(a.start_time) }} - {{ fmtShort(a.end_time) }}
                    </span>
                </div>
                <template v-if="e.assigned_sessions.length">
                    <table style="table-layout:fixed;width:100%">
                        <colgroup>
                            <col style="width:100px">
                            <col>
                            <col style="width:200px">
                            <col style="width:120px">
                        </colgroup>
                        <thead><tr><th>カテゴリ</th><th>タイトル</th><th>時間</th><th>部屋</th></tr></thead>
                        <tbody>
                            <tr v-for="s in e.assigned_sessions" :key="'sds-'+s.id">
                                <td><span class="badge" :style="CAT_BG[s.category] ? 'background:' + CAT_BG[s.category].background + ';color:' + CAT_BG[s.category].borderColor : ''">{{ catLabel(s.category) }}</span></td>
                                <td><a href="#" @click.prevent="toggleSessionDetail(s.id)" style="color:#1a73e8;text-decoration:none">{{ s.title }}</a></td>
                                <td style="white-space:nowrap">{{ fmt(s.start_time) }} - {{ fmtShort(s.end_time) }}</td>
                                <td>{{ s.room ? s.room.name : '' }}</td>
                            </tr>
                        </tbody>
                    </table>
                </template>
                <p v-else style="color:#666;margin-top:8px">担当なし</p>
            </div>
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
