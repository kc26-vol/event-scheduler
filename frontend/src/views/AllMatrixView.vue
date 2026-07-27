<template>
        <div class="panel active">
            <h2>全体スケジュール</h2>

            <!-- 日程タブ -->
            <div v-if="catDates.length > 0" class="tab-bar">
                <button class="tab-btn"
                    :style="allGroupTab === 0 ? {background:'#333', color:'#fff'} : {background:'#f5f5f5', color:'#666'}"
                    @click="allGroupTab = 0">
                    全日程
                </button>
                <button v-for="date in catDates" :key="'all-tab-'+date"
                    class="tab-btn"
                    :style="allGroupTab === date ? {background:'#1a73e8', color:'#fff'} : {background:'#f5f5f5', color:'#666'}"
                    @click="allGroupTab = date">
                    {{ date }}
                </button>
            </div>

            <!-- スタッフフィルター -->
            <div style="display:flex;align-items:center;gap:8px;margin-bottom:12px">
                <label style="font-weight:600;font-size:0.9rem">スタッフ絞り込み:</label>
                <select v-model.number="allStaffFilter" style="padding:6px 12px;border:1px solid #ccc;border-radius:6px;font-size:0.9rem;min-width:180px">
                    <option :value="0">全員表示</option>
                    <option v-for="s in staffs" :key="s.id" :value="s.id">{{ s.name }}</option>
                </select>
            </div>

            <!-- 凡例 -->
            <div class="tl-legend" style="margin-bottom:12px">
                <span style="font-weight:600">凡例:</span>
                <span class="tl-legend-item">
                    <span class="tl-legend-swatch" style="background:linear-gradient(135deg,#fff3e0,#ffe0b2);border-color:#e65100"></span>
                    全体
                </span>
                <span v-for="grp in sessionGroups" :key="'legend-grp-'+grp.id" class="tl-legend-item">
                    <span class="tl-legend-swatch" :style="{background: 'linear-gradient(135deg,#e8f0fe,#d2e3fc)', borderColor: grp.color}"></span>
                    {{ grp.label }}
                </span>
                <span v-for="cat in categories" :key="'legend-'+cat.key" class="tl-legend-item">
                    <span class="tl-legend-swatch" :style="{background: CAT_BG[cat.key]?.background, borderColor: cat.color}"></span>
                    {{ cat.label }}
                </span>
            </div>

            <p v-if="!allSchedule.length">セッションがまだ登録されていません。</p>

            <!-- グループ別: マトリクス表示 -->
            <template v-else-if="allGroupTab !== 0">
                <div class="tl-wrapper">
                    <div class="tl-grid" :style="allGridStyle">
                        <div class="tl-corner">時間</div>
                        <div v-for="(col, ci) in allColumns" :key="'arh'+col.id"
                             class="tl-room-header" :style="{gridColumn: ci+2, background: col.type==='overall' ? '#e65100' : (CAT_BG[col.type] ? CAT_BG[col.type].borderColor : '')}">
                            {{ col.name }}
                        </div>
                        <template v-for="(lbl, i) in allLabels" :key="'at'+i">
                            <div class="tl-time-label"
                                 :class="{ 'hour-mark': lbl.isHour, 'quarter-mark': lbl.isQuarter }"
                                 :style="{ gridRow: lbl.gridRow + ' / span ' + lbl.span }">
                                {{ lbl.text }}
                            </div>
                            <div v-for="(col, ci) in allColumns" :key="'abg'+i+'-'+col.id"
                                 class="tl-bg-cell"
                                 :class="{ 'hour-mark': lbl.isHour, 'half-mark': lbl.isHalf, 'quarter-mark': lbl.isQuarter }"
                                 :style="{ gridRow: lbl.gridRow + ' / span ' + lbl.span, gridColumn: ci+2 }">
                            </div>
                        </template>
                        <div v-for="entry in allSchedule" :key="'as'+entry.session.id"
                             class="tl-session" :style="{...allSessionStyle(entry), opacity: allSessionOpacity(entry), ...allSessionBg(entry.session.category), cursor:'pointer'}"
                             @click="toggleSessionDetail(entry.session.id)">
                            <div class="tl-session-time">
                                {{ fmtShort(entry.session.start_time) }} - {{ fmtShort(entry.session.end_time) }}
                            </div>
                            <div class="tl-session-title">{{ entry.session.title }}</div>
                            <div v-if="isMultiSpeakerCat(entry.session.category) && entry.session.lt_talks && entry.session.lt_talks.length" class="tl-session-speaker">
                                <span v-for="t in entry.session.lt_talks" :key="t.id" style="display:block;font-size:0.7rem">{{ t.speaker }}{{ t.title ? ' - ' + t.title : '' }}</span>
                            </div>
                            <div v-else-if="entry.session.speaker && entry.session.speaker !== '-' && entry.session.speaker !== 'スタッフ'" class="tl-session-speaker">{{ entry.session.speaker }}</div>
                            <div class="tl-session-staff">
                                <span v-if="entry.session.required_staff === -1" class="badge" style="background:#e65100;color:#fff">全員</span>
                                <template v-else-if="entry.assigned_staff.length">
                                    <span class="badge" v-for="a in entry.assigned_staff" :key="a.assignment_id">{{ a.staff.name }}</span>
                                </template>
                                <span v-else-if="entry.session.required_staff === 0" class="badge" style="background:#e8eaed;color:#5f6368">配置不要</span>
                                <span v-else class="badge warn">未配置</span>
                            </div>
                        </div>
                    </div>
                </div>
            </template>

            <!-- 全日程: タイムライン表示 -->
            <template v-else>
                <div v-for="date in catDates" :key="'timeline-grp-'+date" style="margin-bottom:32px">
                    <h3 style="margin:0 0 12px;padding:8px 16px;border-radius:6px;color:#fff;font-size:1rem;background:#1a73e8">
                        {{ date }}
                    </h3>
                    <div class="tl-list">
                        <div v-for="entry in allTimelineByGroup[date]" :key="'tl-'+entry.session.id"
                             class="tl-list-row"
                             :style="{opacity: allSessionOpacity(entry)}"
                             @click="toggleSessionDetail(entry.session.id)">
                            <div class="tl-list-time">
                                {{ fmtShort(entry.session.start_time) }} - {{ fmtShort(entry.session.end_time) }}
                            </div>
                            <div class="tl-list-main"
                                 :style="allSessionBg(entry.session.category)">
                                <div style="font-weight:600;font-size:0.9rem">{{ entry.session.title }}</div>
                                <div v-if="entry.session.speaker && entry.session.speaker !== '-' && entry.session.speaker !== 'スタッフ'" style="font-size:0.8rem;color:#555;margin-top:2px">{{ entry.session.speaker }}</div>
                                <div v-if="entry.session.room && entry.session.category !== 'overall'" style="font-size:0.75rem;color:#888;margin-top:2px">{{ entry.session.room.name }}</div>
                            </div>
                            <div class="tl-list-staff">
                                <template v-if="entry.session.required_staff === -1">
                                    <span class="badge" style="font-size:0.7rem;background:#e65100;color:#fff">全員</span>
                                </template>
                                <template v-else-if="entry.assigned_staff.length">
                                    <span class="badge" v-for="a in entry.assigned_staff" :key="a.assignment_id" style="font-size:0.7rem">{{ a.staff.name }}</span>
                                </template>
                                <span v-else-if="entry.session.required_staff === 0" class="badge" style="background:#e8eaed;color:#5f6368;font-size:0.7rem">配置不要</span>
                                <span v-else class="badge warn" style="font-size:0.7rem">未配置</span>
                            </div>
                        </div>
                    </div>
                </div>
            </template>
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
