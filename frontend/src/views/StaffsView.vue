<template>
        <div class="panel active">
            <h2>スタッフ管理 <span style="font-size:0.85rem;font-weight:normal;color:#666">({{ staffs.length }}名)</span></h2>
            <!-- 写真アップロード -->
            <div style="margin-bottom:12px;display:flex;align-items:center;gap:16px">
                <div>
                    <img v-if="staffPhotoPreview" :src="staffPhotoPreview" class="photo-preview">
                    <img v-else-if="staffForm.currentPhoto" :src="staffForm.currentPhoto" class="photo-preview">
                    <span v-else class="speaker-photo-placeholder" style="width:80px;height:80px;font-size:2rem">{{ staffForm.name ? staffForm.name.charAt(0) : '?' }}</span>
                </div>
                <div>
                    <label style="font-weight:600;font-size:0.9rem;display:block;margin-bottom:4px">プロフィール写真</label>
                    <input type="file" accept="image/jpeg,image/png,image/gif,image/webp"
                           @change="onNewStaffPhoto($event)" style="display:none">
                    <button type="button" class="btn" style="background:#607d8b;font-size:0.85rem;padding:6px 14px" @click="pickFile($event)">ファイルを選択</button>
                    <span tabindex="0" @paste.prevent="onPhotoPaste($event)" style="display:inline-block;margin-left:8px;padding:6px 10px;border:1px dashed #90a4ae;border-radius:4px;font-size:0.8rem;color:#607d8b;cursor:text">クリックしてCtrl+Vで貼り付け</span>
                    <div v-if="staffPhotoPreview" style="margin-top:4px">
                        <button class="del-btn" @click="clearNewStaffPhoto">取り消し</button>
                    </div>
                    <div v-else-if="staffForm.editId && staffForm.currentPhoto" style="margin-top:4px">
                        <button class="del-btn" @click="deleteStaffPhoto(staffForm.editId)">写真を削除</button>
                    </div>
                </div>
            </div>
            <div class="form-row">
                <div class="form-group"><label>名前 <span class="req">必須</span></label><input v-model="staffForm.name" placeholder="例: 山田 太郎"></div>
                <div class="form-group">
                    <label>アカウント名</label>
                    <input v-model="staffForm.slack_name" placeholder="例: @yamada-taro">
                    <span style="font-size:0.75rem;color:#888">Slackなど連絡ツールで表示される名前</span>
                </div>
                <div class="form-group">
                    <label>緊急連絡先</label>
                    <input v-model="staffForm.emergency_contact" placeholder="例: 090-1234-5678">
                    <span style="font-size:0.75rem;color:#888">電話番号など</span>
                </div>
                <div class="form-group" style="position:relative">
                    <label>担当</label>
                    <div @click.stop="roleDropdownOpen = !roleDropdownOpen"
                         style="padding:8px 12px;border:1px solid #ccc;border-radius:4px;font-size:0.9rem;cursor:pointer;background:#fff;display:flex;justify-content:space-between;align-items:center;min-height:38px">
                        <span v-if="staffForm.role.length">{{ staffForm.role.map(r => catLabel(r)).join(', ') }}</span>
                        <span v-else style="color:#999">なし</span>
                        <span style="font-size:0.7rem;color:#666">&#9660;</span>
                    </div>
                    <div v-if="roleDropdownOpen" @click.stop
                         style="position:absolute;top:100%;left:0;right:0;z-index:10;background:#fff;border:1px solid #ccc;border-radius:4px;box-shadow:0 4px 12px rgba(0,0,0,0.15);padding:4px 0">
                        <label v-for="opt in roleOptions" :key="opt.v"
                               style="display:flex;align-items:center;gap:8px;padding:8px 12px;cursor:pointer;font-size:0.9rem;margin:0">
                            <input type="checkbox" :value="opt.v" v-model="staffForm.role"
                                   style="width:16px;height:16px;cursor:pointer;accent-color:#1a73e8">
                            {{ opt.l }}
                        </label>
                    </div>
                </div>
                <div class="form-group">
                    <label>過去参加回数 <span class="req">必須</span></label>
                    <input v-model.number="staffForm.experience_count" type="number" min="0" placeholder="過去参加回数" required>
                    <span style="font-size:0.75rem;color:#888">0 = 初めて（経験者と一緒に配置されます）</span>
                </div>
                <div class="form-group" style="display:flex;align-items:center;gap:8px;padding-top:20px">
                    <label style="margin:0"><input type="checkbox" v-model="staffForm.english_ok" style="width:16px;height:16px;cursor:pointer"> 英語対応可</label>
                </div>
            </div>

            <!-- 活動可能時間（新規・編集共通） -->
            <div class="detail-section" style="margin-top:12px;padding:12px;background:#f8f9fa;border-radius:6px">
                <h4 style="margin-top:0">活動可能時間</h4>
                <!-- 編集時: サーバー保存済みの時間帯 -->
                <template v-if="staffForm.editId">
                    <template v-if="editingStaffAvails.length">
                        <span class="badge avail" v-for="a in editingStaffAvails" :key="a.id" style="display:inline-flex;align-items:center;gap:4px">
                            {{ fmt(a.start_time) }} - {{ fmtShort(a.end_time) }}
                            <button class="del-btn" style="font-size:0.75rem;padding:0 4px" @click="removeAvail(staffForm.editId, a.id)">x</button>
                        </span>
                    </template>
                    <span v-if="!editingStaffAvails.length" style="color:#999;font-size:0.85rem">制限なし（終日対応可能）</span>
                    <div class="inline-form" style="margin-top:8px">
                        <div class="form-group"><input v-model="availForms[staffForm.editId].start" type="datetime-local" step="300"></div>
                        <div class="form-group"><input v-model="availForms[staffForm.editId].end" type="datetime-local" step="300"></div>
                        <button class="btn btn-sm" @click="addAvail(staffForm.editId)">追加</button>
                    </div>
                </template>
                <!-- 新規登録時: ローカルリストで管理 -->
                <template v-else>
                    <template v-if="newStaffAvails.length">
                        <span class="badge avail" v-for="(a, idx) in newStaffAvails" :key="idx" style="display:inline-flex;align-items:center;gap:4px">
                            {{ fmt(a.start_time) }} - {{ fmtShort(a.end_time) }}
                            <button class="del-btn" style="font-size:0.75rem;padding:0 4px" @click="newStaffAvails.splice(idx, 1)">x</button>
                        </span>
                    </template>
                    <span v-if="!newStaffAvails.length" style="color:#999;font-size:0.85rem">制限なし（終日対応可能）</span>
                    <div class="inline-form" style="margin-top:8px">
                        <div class="form-group"><input v-model="newAvailForm.start" type="datetime-local" step="300"></div>
                        <div class="form-group"><input v-model="newAvailForm.end" type="datetime-local" step="300"></div>
                        <button class="btn btn-sm" @click="addNewStaffAvail">追加</button>
                    </div>
                </template>
            </div>

            <!-- 希望セッション（新規・編集共通） -->
            <div class="detail-section" style="margin-top:8px;padding:12px;background:#f8f9fa;border-radius:6px">
                <h4 style="margin-top:0">希望セッション</h4>
                <!-- 編集時: サーバー保存済み -->
                <template v-if="staffForm.editId">
                    <div v-if="editingStaffPrefs.length" style="display:flex;flex-direction:column;gap:4px;align-items:flex-start">
                        <span class="badge pref" v-for="p in editingStaffPrefs" :key="p.id" style="display:inline-flex;align-items:center;gap:4px">
                            第{{ p.priority }}希望: {{ p.session ? fmt(p.session.start_time) + ' ' + p.session.title : 'セッション ' + p.session_id }}
                            <button class="del-btn" style="font-size:0.75rem;padding:0 4px" @click="removePref(staffForm.editId, p.id)">x</button>
                        </span>
                    </div>
                    <span v-if="!editingStaffPrefs.length" style="color:#999;font-size:0.85rem">希望セッション未設定</span>
                    <div class="inline-form" style="margin-top:8px">
                        <div class="form-group" style="flex:2">
                            <select v-model.number="prefForms[staffForm.editId].session_id">
                                <option v-for="ss in sessions" :key="ss.id" :value="ss.id">{{ ss.title }} ({{ fmt(ss.start_time) }})</option>
                            </select>
                        </div>
                        <div class="form-group" style="flex:1">
                            <input v-model.number="prefForms[staffForm.editId].priority" type="number" min="1" placeholder="優先度" style="width:80px">
                        </div>
                        <button class="btn btn-sm" @click="addPref(staffForm.editId)">追加</button>
                    </div>
                </template>
                <!-- 新規登録時: ローカルリストで管理 -->
                <template v-else>
                    <div v-if="newStaffPrefs.length" style="display:flex;flex-direction:column;gap:4px;align-items:flex-start">
                        <span class="badge pref" v-for="(p, idx) in newStaffPrefs" :key="idx" style="display:inline-flex;align-items:center;gap:4px">
                            第{{ p.priority }}希望: {{ sessionLabel(p.session_id) }}
                            <button class="del-btn" style="font-size:0.75rem;padding:0 4px" @click="newStaffPrefs.splice(idx, 1)">x</button>
                        </span>
                    </div>
                    <span v-if="!newStaffPrefs.length" style="color:#999;font-size:0.85rem">希望セッション未設定</span>
                    <div class="inline-form" style="margin-top:8px">
                        <div class="form-group" style="flex:2">
                            <select v-model.number="newPrefForm.session_id">
                                <option v-for="ss in sessions" :key="ss.id" :value="ss.id">{{ ss.title }} ({{ fmt(ss.start_time) }})</option>
                            </select>
                        </div>
                        <div class="form-group" style="flex:1">
                            <input v-model.number="newPrefForm.priority" type="number" min="1" placeholder="優先度" style="width:80px">
                        </div>
                        <button class="btn btn-sm" @click="addNewStaffPref">追加</button>
                    </div>
                </template>
            </div>

            <div style="display:flex;gap:8px;margin-top:12px">
                <button class="btn" @click="submitStaff">{{ staffForm.editId ? '更新' : '追加' }}</button>
                <button v-if="staffForm.editId" class="btn btn-danger" @click="cancelEditStaff">キャンセル</button>
            </div>

            <!-- スタッフ一覧 (タイル表示) -->
            <div class="staff-tile-grid">
                <div v-for="s in staffs" :key="s.id" class="staff-tile" @click="openStaff(s.id)">
                    <img v-if="s.photo" :src="s.photo" :alt="s.name" class="staff-tile-photo">
                    <span v-else class="speaker-photo-placeholder staff-tile-photo">{{ s.name.charAt(0) }}</span>
                    <div class="staff-tile-name">{{ s.name }}</div>
                    <div v-if="s.slack_name" style="font-size:0.75rem;color:#888;margin-bottom:6px">{{ s.slack_name }}</div>
                    <div>
                        <span v-if="!s.role || !s.role.length" class="badge" style="background:#eceff1;color:#666">なし</span>
                        <span class="badge" v-for="r in (Array.isArray(s.role) ? s.role : [s.role])" :key="r">{{ catLabel(r) }}</span>
                        <span v-if="s.english_ok" class="badge" style="background:#e0f2f1;color:#00695c">EN</span>
                        <span v-if="s.experience_count === 0" class="badge warn">初参加</span>
                        <span class="badge" style="background:#e8f0fe;color:#1a73e8">担当: {{ staffAssignCount[s.id] || 0 }}件</span>
                    </div>
                </div>
            </div>
        </div>
</template>

<script setup lang="ts">
import { useRouter } from 'vue-router'
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

const router = useRouter()

// タイルクリックでスタッフ詳細ページへ遷移
function openStaff(id: number) {
    router.push(`/staffs/${id}`)
}
</script>
