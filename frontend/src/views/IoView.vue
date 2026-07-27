<template>
        <div class="panel active">
            <h2>エクスポート</h2>

            <!-- Excelエクスポート -->
            <div style="background:#e8f0fe;border:1px solid #a8c7fa;border-radius:8px;padding:20px;margin-bottom:20px">
                <h3 style="margin:0 0 8px;color:#1a73e8">Excelエクスポート</h3>
                <p style="margin:0 0 12px;font-size:0.9rem;color:#555">全データをExcelファイルとしてエクスポートします。全体スケジュールマトリクス、セッション管理、スタッフ管理、受付案内、懇親会担当の各シートが含まれます。</p>
                <button class="btn" style="background:#1a73e8;font-size:1rem;padding:10px 24px" @click="exportExcel">Excelファイルをダウンロード</button>
            </div>

            <!-- connpass共通設定 -->
            <div style="background:#f5f5f5;border:1px solid #e0e0e0;border-radius:8px;padding:16px 20px;margin-bottom:20px">
                <h3 style="margin:0 0 8px;color:#333">connpass出力設定</h3>
                <div class="form-group" style="margin:0">
                    <label style="font-size:0.85rem">画像ベースURL <span style="color:#888;font-weight:normal">（登壇者写真のURL生成に使用）</span></label>
                    <input v-model="connpassBaseUrl" placeholder="例: https://example.com" style="width:400px">
                </div>
            </div>

            <!-- connpass タイムライン -->
            <div style="background:#fce4ec;border:1px solid #f48fb1;border-radius:8px;padding:20px;margin-bottom:20px">
                <h3 style="margin:0 0 8px;color:#c2185b">connpass タイムライン</h3>
                <p style="margin:0 0 12px;font-size:0.9rem;color:#555">connpassのイベントページに貼り付け可能なMarkdown形式のタイムテーブルを生成します。</p>
                <button class="btn" style="background:#c2185b;font-size:1rem;padding:10px 24px" @click="generateConnpassTimeline">タイムラインを生成</button>
                <div v-if="connpassTimeline" style="margin-top:12px">
                    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px">
                        <span style="font-size:0.85rem;color:#666">生成結果（コピーしてconnpassに貼り付け）</span>
                        <button class="btn btn-sm" style="background:#c2185b" @click="copyToClipboard(connpassTimeline)">コピー</button>
                    </div>
                    <textarea readonly :value="connpassTimeline" style="width:100%;height:300px;font-family:monospace;font-size:0.85rem;padding:12px;border:1px solid #ccc;border-radius:6px;background:#fff;resize:vertical"></textarea>
                </div>
            </div>

            <!-- connpass 登壇者テンプレート -->
            <div style="background:#e8eaf6;border:1px solid #9fa8da;border-radius:8px;padding:20px;margin-bottom:20px">
                <h3 style="margin:0 0 8px;color:#283593">connpass 登壇者テンプレート</h3>
                <p style="margin:0 0 12px;font-size:0.9rem;color:#555">connpassのイベントページ用の登壇者一覧をMarkdown形式で生成します。</p>
                <button class="btn" style="background:#283593;font-size:1rem;padding:10px 24px" @click="generateSpeakerTemplate">登壇者テンプレートを生成</button>
                <div v-if="speakerTemplate" style="margin-top:12px">
                    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px">
                        <span style="font-size:0.85rem;color:#666">生成結果（コピーしてconnpassに貼り付け）</span>
                        <button class="btn btn-sm" style="background:#283593" @click="copyToClipboard(speakerTemplate)">コピー</button>
                    </div>
                    <textarea readonly :value="speakerTemplate" style="width:100%;height:300px;font-family:monospace;font-size:0.85rem;padding:12px;border:1px solid #ccc;border-radius:6px;background:#fff;resize:vertical"></textarea>
                </div>
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
    filteredMatrixSchedule, matrixSessionOpacity, _hasStaff,
    CAT_BG, abSettings, abStatus, abHistory,
    abMsg, abDownload, loadAbSettings, loadAbStatus,
    loadAbHistory, saveAbSettings, triggerBackupNow, deleteBackupEntry,
    downloadBackupEntry, pubApi, pubHistory, pubMsg,
    pubMsgError, pubApiUrl, loadPubApiSettings, savePubApiSettings,
    regenerateApiKey, clearGithubToken, publishSnapshot, loadPubHistory,
    activateSnapshot, deleteSnapshot, copyApiUrl, copyApiKey,
} = useStore()
</script>
