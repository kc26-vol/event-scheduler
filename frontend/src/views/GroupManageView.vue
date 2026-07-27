<template>
        <template v-for="grp in sessionGroups" :key="'grpm-'+grp.id">
        <div v-if="grp.id === gid" class="panel active">
            <h2>{{ grp.label }}管理 <span style="font-size:0.85rem;font-weight:normal;color:#666">({{ groupSessions(grp.id).length }}件)</span></h2>

            <!-- 日程タブ -->
            <div v-if="grpDates(grp.id).length > 0" class="tab-bar">
                <button class="tab-btn"
                    :style="grpDateTabs[grp.id] === 0 ? {background:'#333', color:'#fff'} : {background:'#f5f5f5', color:'#666'}"
                    @click="grpDateTabs[grp.id] = 0">
                    全日程
                </button>
                <button v-for="date in grpDates(grp.id)" :key="'grpm-dtab-'+grp.id+'-'+date"
                    class="tab-btn"
                    :style="grpDateTabs[grp.id] === date ? {background: grp.color || '#1a73e8', color:'#fff'} : {background:'#f5f5f5', color:'#666'}"
                    @click="grpDateTabs[grp.id] = date">
                    {{ date }}
                </button>
            </div>

            <div class="form-row">
                <div class="form-group"><label>タイトル <span class="req">必須</span></label><input v-model="groupSessForms[grp.id].title" placeholder="例: Kubernetes実践入門"></div>
            </div>
            <!-- 通常セッション: 登壇者情報 -->
            <template v-if="!isMultiSpeakerCat(groupSessForms[grp.id].category) && !dynamicCatKeys.includes(groupSessForms[grp.id].category)">
                <div class="form-row">
                    <div class="form-group"><label>登壇者名 <span class="req">必須</span></label><input v-model="groupSessForms[grp.id].speaker" placeholder="例: 山田 太郎"></div>
                    <div class="form-group"><label>ふりがな</label><input v-model="groupSessForms[grp.id].speaker_kana" placeholder="例: やまだ たろう"></div>
                </div>
                <div class="form-row">
                    <div class="form-group"><label>所属</label><input v-model="groupSessForms[grp.id].speaker_org" placeholder="例: 株式会社○○"></div>
                    <div class="form-group"><label>肩書き</label><input v-model="groupSessForms[grp.id].speaker_title" placeholder="例: CTO"></div>
                </div>
                <div class="form-group"><label>プロフィール</label><textarea v-model="groupSessForms[grp.id].speaker_profile" rows="2" placeholder="例: 10年以上のクラウドインフラ経験を持つエンジニア。"></textarea></div>
            </template>
            <!-- 登壇者写真 -->
            <template v-if="!isMultiSpeakerCat(groupSessForms[grp.id].category) && !dynamicCatKeys.includes(groupSessForms[grp.id].category)">
                <div class="form-row">
                    <div class="form-group">
                        <label>登壇者写真</label>
                        <input type="file" :data-group-photo="grp.id" accept="image/jpeg,image/png,image/gif,image/webp"
                               @change="onGroupPhotoChange(grp.id, $event)" style="display:none">
                        <button type="button" class="btn" style="background:#607d8b;font-size:0.85rem;padding:6px 14px" @click="pickFile($event)">ファイルを選択</button>
                        <span tabindex="0" @paste.prevent="onPhotoPaste($event)" style="display:inline-block;margin-left:8px;padding:6px 10px;border:1px dashed #90a4ae;border-radius:4px;font-size:0.8rem;color:#607d8b;cursor:text">クリックしてCtrl+Vで貼り付け</span>
                        <div v-if="groupSessForms[grp.id].photoPreview" style="margin-top:8px">
                            <img :src="groupSessForms[grp.id].photoPreview" class="photo-preview">
                        </div>
                        <div v-else-if="groupSessForms[grp.id].editId && groupSessForms[grp.id].currentPhoto" style="margin-top:8px">
                            <img :src="groupSessForms[grp.id].currentPhoto" class="photo-preview">
                            <span style="font-size:0.8rem;color:#666">新しい写真を選択しない場合、現在の写真が維持されます</span>
                        </div>
                    </div>
                </div>
            </template>
            <div class="form-row">
                <div class="form-group"><label>開始時刻 <span class="req">必須</span></label><input v-model="groupSessForms[grp.id].start_time" type="datetime-local" step="300" @change="autoSetEndTime(groupSessForms[grp.id])"></div>
                <div class="form-group"><label>終了時刻 <span class="req">必須</span></label><input v-model="groupSessForms[grp.id].end_time" type="datetime-local" step="300"></div>
            </div>
            <div class="form-row">
                <div class="form-group">
                    <label>部屋 <span class="req">必須</span></label>
                    <select v-model.number="groupSessForms[grp.id].room_id">
                        <option v-for="r in selectableRooms" :key="r.id" :value="r.id">{{ r.name }}</option>
                    </select>
                </div>
                <div class="form-group">
                    <label>カテゴリ</label>
                    <select v-model="groupSessForms[grp.id].category">
                        <option v-for="sc in sessionCatOptions" :key="sc.key" :value="sc.key">{{ sc.label }}</option>
                    </select>
                </div>
                <div class="form-group"><label>必要スタッフ数</label><input v-model.number="groupSessForms[grp.id].required_staff" type="number" placeholder="例: 2"></div>
                <div class="form-group" style="display:flex;align-items:center;gap:8px;padding-top:22px">
                    <label style="margin:0"><input type="checkbox" v-model="groupSessForms[grp.id].english_required" style="width:16px;height:16px;cursor:pointer"> 英語対応必要</label>
                </div>
            </div>
            <div class="form-group"><label>セッション説明</label><textarea v-model="groupSessForms[grp.id].description" rows="2" placeholder="例: コンテナオーケストレーションの基礎から実践的なデプロイ手法まで解説します。"></textarea></div>
            <div class="form-group"><label>備考</label><textarea v-model="groupSessForms[grp.id].notes" rows="2" placeholder="例: プロジェクター2台使用。講演者用に水を準備。"></textarea></div>

            <!-- LTセッション: 登壇者リスト -->
            <div v-if="isMultiSpeakerCat(groupSessForms[grp.id].category) && groupSessForms[grp.id]._ltTalks" class="lt-talks-list">
                <h4>{{ groupSessForms[grp.id].category === 'panel' ? 'パネリスト一覧' : 'LT登壇者一覧' }}</h4>
                <div v-for="(talk, idx) in groupSessForms[grp.id]._ltTalks" :key="idx" class="lt-talk-item" style="flex-direction:column;align-items:stretch">
                    <div style="display:flex;align-items:center;gap:8px">
                        <span class="lt-num">{{ Number(idx) + 1 }}</span>
                        <div style="flex:1;min-width:0">
                            <div class="lt-talk-fields">
                                <input v-model="talk.title" placeholder="トークタイトル" style="flex:2;min-width:140px">
                                <input v-model="talk.speaker" placeholder="登壇者名" style="flex:1;min-width:100px">
                                <input v-model="talk.speaker_kana" placeholder="ふりがな" style="flex:1;min-width:100px">
                            </div>
                            <div class="lt-talk-fields" style="margin-top:4px">
                                <input v-model="talk.speaker_org" placeholder="所属" style="flex:1;min-width:100px">
                                <input v-model="talk.speaker_title" placeholder="肩書き" style="flex:1;min-width:80px">
                                <input v-model="talk.start_time" type="datetime-local" step="300" style="flex:1;min-width:140px" placeholder="開始時刻"
                                       @change="autoSetLTEndTime(talk)">
                                <input v-model="talk.end_time" type="datetime-local" step="300" style="flex:1;min-width:140px" placeholder="終了時刻">
                            </div>
                            <div style="display:flex;align-items:center;gap:8px;margin-top:4px">
                                <label style="font-size:0.8rem;white-space:nowrap">写真:</label>
                                <input type="file" accept="image/jpeg,image/png,image/gif,image/webp"
                                       @change="onLTTalkPhoto($event, grp.id, idx)" style="display:none">
                                <button type="button" class="btn" style="background:#607d8b;font-size:0.75rem;padding:4px 10px" @click="pickFile($event)">ファイルを選択</button>
                                <span tabindex="0" @paste.prevent="onPhotoPaste($event)" style="display:inline-block;padding:4px 8px;border:1px dashed #90a4ae;border-radius:4px;font-size:0.75rem;color:#607d8b;cursor:text;white-space:nowrap">貼り付け</span>
                                <img v-if="talk.photoPreview" :src="talk.photoPreview" style="width:36px;height:36px;border-radius:50%;object-fit:cover">
                                <img v-else-if="talk.speaker_photo" :src="talk.speaker_photo" style="width:36px;height:36px;border-radius:50%;object-fit:cover">
                                <label style="display:inline-flex;align-items:center;gap:4px;margin-left:12px;font-size:0.8rem;white-space:nowrap;cursor:pointer">
                                    <input type="checkbox" :checked="talk.is_representative" @change="toggleRepresentative(groupSessForms[grp.id]._ltTalks, idx)">
                                    {{ groupSessForms[grp.id].category === 'panel' ? 'モデレーター' : '司会者' }}
                                </label>
                            </div>
                        </div>
                        <button class="del-btn" @click="groupSessForms[grp.id]._ltTalks.splice(idx, 1)">✕</button>
                    </div>
                </div>
                <button class="btn btn-sm" @click="addLTTalk(grp.id)" style="margin-top:4px">＋ 登壇者を追加</button>
            </div>
            <div v-if="isMultiSpeakerCat(groupSessForms[grp.id].category) && !groupSessForms[grp.id]._ltTalks">
                <button class="btn btn-sm" @click="addLTTalk(grp.id)" style="margin-bottom:8px">＋ {{ groupSessForms[grp.id].category === 'panel' ? 'パネリストを追加' : 'LT登壇者を追加' }}</button>
            </div>
            <div style="display:flex;gap:8px">
                <button class="btn" :style="{ background: grp.color }" @click="submitGroupSession(grp.id)">{{ groupSessForms[grp.id].editId ? '更新' : '追加' }}</button>
                <button v-if="groupSessForms[grp.id].editId" class="btn btn-danger" @click="cancelEditGroupSession(grp.id)">キャンセル</button>
            </div>
            <!-- 配置表 -->
            <template v-if="grpDateFiltered(grp.id).length && grpDateTabs[grp.id] !== 0">
                <h3 style="margin-top:0">配置表</h3>
                <tl-grid
                    :grid-style="grpGridStyle(grp.id)" :rooms="grpGridRooms(grp.id)" :labels="grpGridLabels(grp.id)"
                    :entries="grpDateFiltered(grp.id)" :color="grp.color || '#1a73e8'" :show-speaker="true"
                    :entry-style="e => grpDragSessionStyle(grp.id, e)"
                    :fmt-short="fmtShort"
                    @dragstart="(ev, entry) => onGrpDragStart(ev, grp.id, entry, true)"
                    @select="(id, ev, entry) => showGridMenu(ev, entry, 'grp', grp.id)">
                </tl-grid>
            </template>

            <h3>登録済み一覧</h3>
            <p v-if="!groupSessions(grp.id).length" style="color:#666">セッションがまだ登録されていません。</p>
            <table v-else>
                <thead><tr><th>ID</th><th>登壇者</th><th>タイトル</th><th>時間</th><th>部屋</th><th>カテゴリ</th><th>必要人数</th><th>英語</th><th></th></tr></thead>
                <tbody>
                    <template v-for="s in groupSessions(grp.id)" :key="s.id">
                    <tr :style="groupSessForms[grp.id]?.editId === s.id ? 'background:#fff3e0;outline:2px solid #ff9800' : ''">
                        <td>{{ s.id }}</td>
                        <td style="text-align:center">
                            <template v-if="isMultiSpeakerCat(s.category) && s.lt_talks && s.lt_talks.length">
                                <span style="font-size:0.8rem">{{ s.lt_talks.length }}名</span>
                            </template>
                            <template v-else>
                                <img v-if="s.speaker_photo" :src="s.speaker_photo" :alt="s.speaker" class="speaker-photo">
                                <span v-else class="speaker-photo-placeholder">{{ s.speaker.charAt(0) }}</span>
                                <br><span style="font-size:0.8rem">{{ s.speaker }}</span>
                            </template>
                        </td>
                        <td>
                            <a href="#" @click.prevent="toggleSessionDetail(s.id)" style="color:#1a73e8;text-decoration:none;font-weight:600">{{ s.title }}</a>
                        </td>
                        <td style="white-space:nowrap">{{ fmt(s.start_time) }} - {{ fmt(s.end_time) }}</td>
                        <td>{{ s.room ? s.room.name : s.room_id }}</td>
                        <td><span class="badge">{{ catLabel(s.category) }}</span></td>
                        <td>{{ s.required_staff }}</td>
                        <td><span v-if="s.english_required" class="badge" style="background:#e0f2f1;color:#00695c">EN</span></td>
                        <td>
                            <button class="btn btn-sm edit-btn" @click="editGroupSession(grp.id, s)" style="margin-right:4px" :style="groupSessForms[grp.id]?.editId === s.id ? 'background:#ff9800;color:#fff' : ''">{{ groupSessForms[grp.id]?.editId === s.id ? '編集中' : '編集' }}</button>
                            <button class="del-btn" @click="deleteGroupSession(grp.id, s.id)">削除</button>
                        </td>
                    </tr>
                    </template>
                </tbody>
            </table>
        </div>
        </template>
</template>

<script setup lang="ts">
import { useStore } from '../store'

import { computed } from 'vue'
import { useRoute } from 'vue-router'

const route = useRoute()
const gid = computed(() => Number(route.params.id))

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
