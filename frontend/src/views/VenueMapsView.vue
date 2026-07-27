<template>
        <div class="panel active">
            <h2>会場地図</h2>
            <div class="form-row">
                <div class="form-group"><label>タイトル <span class="req">必須</span></label><input v-model="venueMapForm.title" placeholder="例: 1F フロアマップ"></div>
                <div class="form-group"><label>表示順</label><input v-model.number="venueMapForm.order" type="number" placeholder="0"></div>
            </div>
            <div class="form-row">
                <div class="form-group">
                    <label>地図画像</label>
                    <input type="file" ref="venueMapInput" accept="image/jpeg,image/png,image/gif,image/webp" @change="onVenueMapChange" style="display:none">
                    <button type="button" class="btn" style="background:#607d8b;font-size:0.85rem;padding:6px 14px" @click="pickFile($event)">ファイルを選択</button>
                    <span tabindex="0" @paste.prevent="onPhotoPaste($event)" style="display:inline-block;margin-left:8px;padding:6px 10px;border:1px dashed #90a4ae;border-radius:4px;font-size:0.8rem;color:#607d8b;cursor:text">クリックしてCtrl+Vで貼り付け</span>
                    <div style="margin-top:8px">
                        <img v-if="venueMapPreview" :src="venueMapPreview" style="max-width:200px;max-height:120px;border-radius:4px;border:1px solid #ccc">
                        <div v-if="venueMapForm.editId && venueMapForm.currentImage && !venueMapPreview" style="font-size:0.8rem;color:#666">
                            <img :src="venueMapForm.currentImage" style="max-width:200px;max-height:120px;border-radius:4px;border:1px solid #ccc">
                            <br>新しい画像を選択しない場合、現在の地図が維持されます
                        </div>
                    </div>
                </div>
            </div>
            <div style="display:flex;gap:8px;margin-bottom:12px">
                <button class="btn" @click="submitVenueMap">{{ venueMapForm.editId ? '更新' : '追加' }}</button>
                <button v-if="venueMapForm.editId" class="btn btn-danger" @click="cancelEditVenueMap">キャンセル</button>
            </div>

            <div v-if="!venueMaps.length" style="color:#888;font-size:0.9rem">地図が登録されていません。</div>
            <div v-for="m in venueMaps" :key="m.id" style="border:1px solid #e0e0e0;border-radius:8px;padding:12px;margin-bottom:12px" :style="venueMapForm.editId === m.id ? 'background:#fff3e0;outline:2px solid #ff9800' : ''">
                <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
                    <h3 style="margin:0">{{ m.title }}</h3>
                    <div>
                        <button class="btn btn-sm edit-btn" @click="editVenueMap(m)" style="margin-right:4px" :style="venueMapForm.editId === m.id ? 'background:#ff9800;color:#fff' : ''">{{ venueMapForm.editId === m.id ? '編集中' : '編集' }}</button>
                        <button class="del-btn" @click="deleteVenueMap(m.id)">削除</button>
                    </div>
                </div>
                <img :src="m.image" style="max-width:100%;max-height:400px;border-radius:4px;border:1px solid #ddd;cursor:pointer" @click="mapModal=m">
            </div>

            <!-- 地図拡大モーダル -->
            <div v-if="mapModal" class="modal-overlay" @click.self="mapModal=null">
                <div style="background:#fff;border-radius:8px;padding:20px;max-width:90vw;max-height:90vh;overflow:auto;position:relative">
                    <h3 style="margin-bottom:12px">{{ mapModal.title }}</h3>
                    <img :src="mapModal.image" style="max-width:80vw;max-height:70vh;border-radius:4px">
                    <br><button class="btn btn-sm" style="margin-top:12px" @click="mapModal=null">閉じる</button>
                </div>
            </div>
        </div>
</template>

<script setup lang="ts">
import { useStore } from '../store'

// ファイル選択ボタン (テンプレート内でのDOMキャストを避けるため関数化)
function pickFile(e: MouseEvent) {
    const el = (e.target as HTMLElement).parentElement?.querySelector('input[type=file]')
    ;(el as HTMLInputElement | null)?.click()
}

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
