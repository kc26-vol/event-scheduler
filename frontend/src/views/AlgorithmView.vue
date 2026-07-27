<template>
        <div class="panel active">
            <h2>配置アルゴリズム説明</h2>
            <p style="color:#555;margin-bottom:20px">自動配置ボタンを押した際に実行されるスタッフ配置アルゴリズムの仕組みを説明します。</p>

            <!-- 全体フロー -->
            <div style="background:#e8f0fe;border-radius:8px;padding:16px 20px;margin-bottom:20px">
                <h3 style="margin:0 0 12px;color:#1a73e8">全体フロー</h3>
                <div style="display:flex;flex-wrap:wrap;gap:8px;align-items:center">
                    <span style="background:#1a73e8;color:#fff;padding:6px 14px;border-radius:20px;font-size:0.85rem;font-weight:600">1. 既存配置クリア</span>
                    <span style="color:#999;font-size:1.2rem">&rarr;</span>
                    <span style="background:#1a73e8;color:#fff;padding:6px 14px;border-radius:20px;font-size:0.85rem;font-weight:600">2. セッション順にループ</span>
                    <span style="color:#999;font-size:1.2rem">&rarr;</span>
                    <span style="background:#1a73e8;color:#fff;padding:6px 14px;border-radius:20px;font-size:0.85rem;font-weight:600">3. スタッフをスコアリング</span>
                    <span style="color:#999;font-size:1.2rem">&rarr;</span>
                    <span style="background:#1a73e8;color:#fff;padding:6px 14px;border-radius:20px;font-size:0.85rem;font-weight:600">4. 上位から配置</span>
                    <span style="color:#999;font-size:1.2rem">&rarr;</span>
                    <span style="background:#1a73e8;color:#fff;padding:6px 14px;border-radius:20px;font-size:0.85rem;font-weight:600">5. 初心者制約の調整</span>
                </div>
                <p style="margin:12px 0 0;font-size:0.85rem;color:#555"><strong>部分再配置:</strong> 選択したセッションのみを指定して再配置することも可能です。その場合、指定外のセッションの配置は維持されます。</p>
            </div>

            <!-- ロール判定 -->
            <div style="background:#f8f9fa;border:1px solid #e0e0e0;border-radius:8px;padding:16px 20px;margin-bottom:16px">
                <h3 style="margin:0 0 8px;font-size:1rem">ロールによるフィルタリング</h3>
                <p style="margin:0 0 8px;font-size:0.9rem;color:#555">セッションのカテゴリに応じて、対応するロールのスタッフのみが候補になります。</p>
                <table style="font-size:0.85rem">
                    <thead><tr><th>セッションカテゴリ</th><th>対象スタッフロール</th></tr></thead>
                    <tbody>
                        <tr><td>一般 / WS / 基調講演 / パネル / LT</td><td><span class="badge">セッション</span></td></tr>
                        <tr v-for="cat in categories" :key="'algo-role-'+cat.key">
                            <td>{{ cat.label }}</td>
                            <td><span class="badge" :style="{background: CAT_BG[cat.key]?.background, color: cat.color}">{{ cat.label }}</span></td>
                        </tr>
                    </tbody>
                </table>
            </div>

            <!-- 必須チェック -->
            <div style="background:#f8f9fa;border:1px solid #e0e0e0;border-radius:8px;padding:16px 20px;margin-bottom:16px">
                <h3 style="margin:0 0 8px;font-size:1rem">配置前の必須チェック</h3>
                <ul style="margin:0;padding-left:20px;font-size:0.9rem;color:#555;line-height:1.8">
                    <li><strong>活動可能時間:</strong> スタッフの活動可能時間帯にセッション全体が収まること（未設定の場合は制約なし）</li>
                    <li><strong>時間重複:</strong> 既に配置済みの別セッションと時間が重複しないこと</li>
                    <li><strong>移動時間:</strong> 別部屋のセッションへは最低10分の間隔があること</li>
                    <li><strong>最大稼働時間:</strong> スタッフの合計稼働時間が上限を超えないこと</li>
                    <li><strong>配置人数:</strong> 各セッションに設定された必要人数どおりに配置（必要人数0は配置しない）</li>
                </ul>
            </div>

            <!-- スコアリング -->
            <div style="background:#fff8e1;border:1px solid #ffe082;border-radius:8px;padding:16px 20px;margin-bottom:16px">
                <h3 style="margin:0 0 12px;font-size:1rem;color:#e65100">スコアリング（優先度の計算）</h3>
                <p style="margin:0 0 12px;font-size:0.9rem;color:#555">各スタッフに対してスコアを計算し、スコアが高い順に配置します。</p>
                <table style="font-size:0.85rem">
                    <thead><tr><th>項目</th><th>スコア</th><th>説明</th></tr></thead>
                    <tbody>
                        <tr><td><strong>希望セッション</strong></td><td style="color:#1a73e8;font-weight:700">最大 +100</td><td>優先度1 = +100, 優先度2 = +80, 優先度3 = +60 ...</td></tr>
                        <tr><td><strong>英語対応</strong></td><td style="color:#1a73e8;font-weight:700">+50</td><td>英語対応が必要なセッションで、英語OKスタッフの場合</td></tr>
                        <tr><td><strong>スキルマッチ</strong></td><td style="color:#1a73e8;font-weight:700">+10</td><td>スタッフのスキルにセッションカテゴリが含まれる場合</td></tr>
                        <tr><td><strong>ロールマッチ</strong></td><td style="color:#1a73e8;font-weight:700">+5</td><td>スタッフのロールにセッションの対象ロールが含まれる場合</td></tr>
                        <tr><td><strong>担当件数均等化</strong></td><td style="color:#d93025;font-weight:700">-8 / 件</td><td>既に担当しているセッション数に応じて減点</td></tr>
                        <tr><td><strong>担当時間均等化</strong></td><td style="color:#d93025;font-weight:700">-12 / 時間</td><td>既に担当している合計時間に応じて減点</td></tr>
                        <tr><td><strong>未配置スタッフ優先</strong></td><td style="color:#1a73e8;font-weight:700">+30</td><td>まだ1件も担当していないスタッフに加点</td></tr>
                        <tr><td><strong>階移動ペナルティ</strong></td><td style="color:#d93025;font-weight:700">-3 / 階</td><td>直前セッションの部屋と階が異なる場合、階差分だけ減点</td></tr>
                        <tr><td><strong>連続配置ペナルティ</strong></td><td style="color:#d93025;font-weight:700">-40</td><td>直前の担当が30分未満の間隔で続く場合</td></tr>
                        <tr><td><strong>同部屋連続ペナルティ</strong></td><td style="color:#d93025;font-weight:700">-25</td><td>直近2セッション内に同じ部屋の担当がある場合（休憩を挟んでも対象）</td></tr>
                        <tr><td><strong>ペア重複ペナルティ</strong></td><td style="color:#d93025;font-weight:700">-15 / 回</td><td>同じセッションに配置済みのスタッフと過去に同席した回数だけ減点</td></tr>
                    </tbody>
                </table>
                <p style="margin:12px 0 0;font-size:0.85rem;color:#555">スコアが同点の場合は、担当件数・合計担当時間が少ないスタッフを優先します。</p>
            </div>

            <!-- 初心者制約 -->
            <div style="background:#fce4ec;border:1px solid #ef9a9a;border-radius:8px;padding:16px 20px;margin-bottom:16px">
                <h3 style="margin:0 0 8px;font-size:1rem;color:#c62828">初心者制約（2段階）</h3>
                <div style="font-size:0.9rem;color:#555;line-height:1.8">
                    <p style="margin:0 0 8px"><strong>第1段階: 配置時の優先確保</strong></p>
                    <ul style="margin:0 0 12px;padding-left:20px">
                        <li>未経験の初心者（経験回数=0）が候補にいる場合、まず経験者を1名優先的に配置</li>
                        <li>その後、残り枠を通常のスコア順で埋める</li>
                    </ul>
                    <p style="margin:0 0 8px"><strong>第2段階: 配置後のスワップ調整</strong></p>
                    <ul style="margin:0;padding-left:20px">
                        <li>全セッションの配置完了後、初心者のみで構成されたセッションがないかチェック</li>
                        <li>該当がある場合、同時間帯の別セッションに配置された経験者とスワップ（入れ替え）</li>
                        <li>スワップ先のセッションに経験者が残ることを保証（経験者が1人しかいない場合はスワップしない）</li>
                    </ul>
                    <p style="margin:8px 0 0;font-size:0.85rem;color:#888">※ 一度経験者と組んでセッションを担当した初心者は「訓練済み」として、以降は経験者扱いになります。</p>
                </div>
            </div>

            <!-- 必要スタッフ数の自動計算 -->
            <div style="background:#e8f5e9;border:1px solid #a5d6a7;border-radius:8px;padding:16px 20px;margin-bottom:16px">
                <h3 style="margin:0 0 8px;font-size:1rem;color:#2e7d32">必要スタッフ数の自動計算</h3>
                <p style="margin:0 0 8px;font-size:0.9rem;color:#555">各セッショングループの管理タブにある「必要スタッフ数を自動計算」ボタンで実行されるロジックです。</p>
                <table style="font-size:0.85rem">
                    <thead><tr><th>指標</th><th>計算方法</th></tr></thead>
                    <tbody>
                        <tr>
                            <td><strong>セッション別必要人数</strong></td>
                            <td>活動可能スタッフ数 &divide; 同時開催セッション数（最低2名、最大3名）</td>
                        </tr>
                        <tr>
                            <td><strong>最小必要人数</strong></td>
                            <td>全時間帯で「稼働中セッションの必要人数合計」の最大値</td>
                        </tr>
                        <tr>
                            <td><strong>休憩込み必要人数</strong></td>
                            <td>上記に加え、直前30分以内に終了したセッション担当者（休憩中）も加算した最大値</td>
                        </tr>
                    </tbody>
                </table>
            </div>

            <!-- 手動配置の制約 -->
            <div style="background:#f8f9fa;border:1px solid #e0e0e0;border-radius:8px;padding:16px 20px;margin-bottom:16px">
                <h3 style="margin:0 0 8px;font-size:1rem">手動配置の制約</h3>
                <ul style="margin:0;padding-left:20px;font-size:0.9rem;color:#555;line-height:1.8">
                    <li>プルダウンには時間が重複しないスタッフのみ表示されます</li>
                    <li>バックエンドでも時間重複を二重チェックし、重複があればエラーメッセージで通知します</li>
                    <li>同一スタッフを同一セッションに重複配置することはできません</li>
                </ul>
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
