<template>
        <div class="panel active">
            <h2>公開API</h2>
            <p style="color:#666;margin-bottom:16px">イベント公式ページなど外部サイトからスケジュールデータをJSON形式で取得できるAPIです。</p>

            <div v-if="pubMsg" :style="{padding:'8px 12px',borderRadius:'4px',marginBottom:'12px',background:pubMsgError?'#fdecea':'#e8f5e9',color:pubMsgError?'#c62828':'#2e7d32'}">{{ pubMsg }}</div>

            <!-- 設定 -->
            <div style="background:#f8f9fa;border-radius:8px;padding:16px;margin-bottom:16px">
                <h3 style="margin:0 0 12px 0;font-size:1rem">API設定</h3>
                <div style="display:flex;align-items:center;gap:8px;margin-bottom:12px">
                    <label style="font-weight:600;font-size:0.85rem;margin:0">公開API</label>
                    <label style="display:flex;align-items:center;gap:6px;cursor:pointer;margin:0">
                        <input type="checkbox" v-model="pubApi.enabled">
                        <span>{{ pubApi.enabled ? '有効' : '無効' }}</span>
                    </label>
                </div>
                <div style="margin-bottom:12px">
                    <label style="font-weight:600;font-size:0.85rem">CORSオリジン</label>
                    <div style="display:flex;align-items:center;gap:8px;margin-top:4px">
                        <input v-model="pubApi.cors_origins" placeholder="* (全てのオリジンを許可)" style="width:300px;padding:8px 10px">
                        <small style="color:#999">* で全許可、またはカンマ区切りでURL指定</small>
                    </div>
                </div>
                <button class="btn" @click="savePubApiSettings" style="margin-bottom:12px">設定を保存</button>

                <div v-if="pubApi.key" style="margin-top:8px">
                    <label style="font-weight:600;font-size:0.85rem">APIキー</label>
                    <div style="display:flex;align-items:center;gap:8px;margin-top:4px">
                        <code style="background:#e8eaf6;padding:4px 8px;border-radius:4px;font-size:0.85rem">{{ pubApi.key }}</code>
                        <button class="btn btn-sm" @click="copyApiKey">コピー</button>
                        <button class="btn btn-sm btn-danger" @click="regenerateApiKey">再生成</button>
                    </div>
                </div>
            </div>

            <!-- Webhook -->
            <div style="background:#f8f9fa;border-radius:8px;padding:16px;margin-bottom:16px">
                <h3 style="margin:0 0 12px 0;font-size:1rem">Webhook</h3>
                <p style="color:#555;margin:0 0 12px 0;font-size:0.9rem">パブリッシュ時に指定URLへPOSTリクエストを送信します。</p>
                <div style="margin-bottom:12px">
                    <div style="display:flex;align-items:center;gap:8px">
                        <input v-model="pubApi.webhook_url" placeholder="https://example.com/webhook" style="flex:1;min-width:0;padding:8px 10px">
                        <small style="color:#999;white-space:nowrap">空欄で無効</small>
                    </div>
                </div>
                <button class="btn" @click="savePubApiSettings">設定を保存</button>
            </div>

            <!-- GitHub Actions連携 -->
            <div style="background:#f8f9fa;border-radius:8px;padding:16px;margin-bottom:16px">
                <h3 style="margin:0 0 12px 0;font-size:1rem">GitHub Actions連携</h3>
                <p style="color:#555;margin:0 0 12px 0;font-size:0.9rem">パブリッシュ時にGitHub Actionsのworkflow_dispatchを実行します。</p>
                <div style="margin-bottom:12px">
                    <label style="font-weight:600;font-size:0.85rem">Dispatch URL</label>
                    <div style="display:flex;align-items:center;gap:8px;margin-top:4px">
                        <input v-model="pubApi.github_dispatch_url" placeholder="https://api.github.com/repos/owner/repo/actions/workflows/xxx.yml/dispatches" style="flex:1;min-width:0;padding:8px 10px">
                    </div>
                </div>
                <div style="margin-bottom:12px">
                    <label style="font-weight:600;font-size:0.85rem">Personal Access Token</label>
                    <div style="display:flex;align-items:center;gap:8px;margin-top:4px">
                        <input v-model="pubApi.github_token_input" type="password" :placeholder="pubApi.github_token_set ? '設定済み（変更する場合のみ入力）' : 'GitHub Personal Access Token'" style="flex:1;min-width:0;max-width:400px;padding:8px 10px">
                        <button v-if="pubApi.github_token_set" class="btn btn-sm btn-danger" @click="clearGithubToken">クリア</button>
                        <small v-if="pubApi.github_token_set" style="color:#2e7d32;font-size:0.85rem">設定済み</small>
                        <small style="color:#999">両方空欄で無効</small>
                    </div>
                </div>
                <button class="btn" @click="savePubApiSettings">設定を保存</button>
            </div>

            <!-- パブリッシュ -->
            <div style="background:#e3f2fd;border-radius:8px;padding:16px;margin-bottom:16px">
                <h3 style="margin:0 0 12px 0;font-size:1rem">パブリッシュ</h3>
                <p style="color:#555;margin:0 0 12px 0;font-size:0.9rem">現在のスケジュールデータをスナップショットとして保存し、公開APIで配信します。</p>
                <button class="btn" @click="publishSnapshot" style="background:#1565c0;color:#fff">パブリッシュ</button>

                <div v-if="pubApi.active_snapshot && pubApi.enabled && pubApi.key" style="margin-top:12px;padding:12px;background:#fff;border-radius:4px">
                    <label style="font-weight:600;font-size:0.85rem">公開API URL</label>
                    <div style="display:flex;align-items:center;gap:8px;margin-top:4px">
                        <code style="background:#f5f5f5;padding:4px 8px;border-radius:4px;font-size:0.8rem;word-break:break-all">{{ pubApiUrl }}</code>
                        <button class="btn btn-sm" @click="copyApiUrl">コピー</button>
                    </div>
                </div>
            </div>

            <!-- パブリッシュ履歴 -->
            <div>
                <h3 style="margin:0 0 12px 0;font-size:1rem">パブリッシュ履歴</h3>
                <table v-if="pubHistory.length">
                    <thead><tr><th>日時</th><th>セッション数</th><th>ステータス</th><th></th></tr></thead>
                    <tbody>
                        <tr v-for="h in pubHistory" :key="h.id">
                            <td>{{ new Date(h.published_at).toLocaleString('ja-JP') }}</td>
                            <td>{{ h.session_count }}</td>
                            <td>
                                <span v-if="h.active" style="color:#1565c0;font-weight:600">アクティブ</span>
                                <span v-else style="color:#999">—</span>
                            </td>
                            <td>
                                <button v-if="!h.active" class="btn btn-sm" @click="activateSnapshot(h.id)" style="margin-right:4px">アクティブにする</button>
                                <button v-if="!h.active" class="del-btn" @click="deleteSnapshot(h.id)">削除</button>
                            </td>
                        </tr>
                    </tbody>
                </table>
                <p v-else style="color:#999">まだパブリッシュされていません</p>
            </div>

            <!-- 使い方ガイド -->
            <details style="margin-top:24px">
                <summary style="cursor:pointer;font-weight:600;color:#1a73e8">使い方ガイド</summary>
                <div style="margin-top:12px;background:#f8f9fa;border-radius:8px;padding:16px">
                    <h4 style="margin:0 0 8px 0;font-size:0.95rem">推奨: キャッシュ + ポーリング更新</h4>
                    <p style="margin:0 0 8px 0;font-size:0.9rem">外部サイトではフルデータをキャッシュし、軽量な更新確認エンドポイントをポーリングして変更時のみ再取得する方法を推奨します:</p>
                    <pre style="background:#263238;color:#eeffff;padding:12px;border-radius:4px;overflow-x:auto;font-size:0.85rem"><code>const API_KEY = 'YOUR_API_KEY';
const BASE = 'https://your-domain';
let cachedData = null;
let cachedSnapshotId = null;

// 更新確認（軽量・ポーリング用）
async function checkUpdate() {
  const res = await fetch(BASE + '/public/api/schedule/check?key=' + API_KEY);
  const info = await res.json();
  if (info.snapshot_id && info.snapshot_id !== cachedSnapshotId) {
    await loadSchedule(); // 変更あり → フルデータ再取得
  }
}

// フルデータ取得（初回 or 更新時のみ）
async function loadSchedule() {
  const res = await fetch(BASE + '/public/api/schedule?key=' + API_KEY);
  cachedData = await res.json();
  cachedSnapshotId = cachedData.snapshot_id;
  renderTimeline(cachedData); // 画面を更新
}

// 初回読み込み + 60秒ごとにポーリング
loadSchedule();
setInterval(checkUpdate, 60000);</code></pre>

                    <h4 style="margin:16px 0 8px 0;font-size:0.95rem">エンドポイント一覧</h4>
                    <table style="font-size:0.85rem;margin-bottom:12px">
                        <thead><tr><th>エンドポイント</th><th>用途</th><th>レスポンス</th></tr></thead>
                        <tbody>
                            <tr><td><code>/public/api/schedule/check?key=...</code></td><td>更新確認（ポーリング用）</td><td><code>{ snapshot_id, published_at }</code></td></tr>
                            <tr><td><code>/public/api/schedule?key=...</code></td><td>フルデータ取得</td><td>セッション・部屋・グループ・カテゴリ全データ</td></tr>
                            <tr><td><code>/public/api/photo/{file}?key=...</code></td><td>登壇者写真</td><td>画像ファイル</td></tr>
                        </tbody>
                    </table>

                    <h4 style="margin:16px 0 8px 0;font-size:0.95rem">Webhook通知</h4>
                    <p style="margin:0 0 8px 0;font-size:0.9rem">Webhook URLを設定すると、パブリッシュ時に以下のJSONがPOSTされます:</p>
                    <pre style="background:#263238;color:#eeffff;padding:12px;border-radius:4px;overflow-x:auto;font-size:0.85rem"><code>{
  "event": "schedule_published",
  "snapshot_id": "20260526_143000",
  "published_at": "2026-05-26T14:30:00",
  "session_count": 12
}</code></pre>
                    <p style="margin:8px 0 0 0;font-size:0.85rem;color:#666">Webhook送信が失敗してもパブリッシュ自体は成功します。外部サイトのキャッシュ更新トリガー等にご利用ください。</p>

                    <h4 style="margin:16px 0 8px 0;font-size:0.95rem">GitHub Actions連携</h4>
                    <p style="margin:0 0 8px 0;font-size:0.9rem">パブリッシュ時にGitHub Actionsの <code>workflow_dispatch</code> を自動で実行し、GitHub Pages等のキャッシュを更新できます。スケジュールAPIのURLはパブリッシュ時に自動で渡されるため、リポジトリのSecretsへの登録は不要です。</p>

                    <p style="margin:0 0 8px 0;font-size:0.9rem;font-weight:600">設定手順:</p>
                    <ol style="margin:0 0 12px 0;font-size:0.85rem;color:#333;padding-left:20px;line-height:1.8">
                        <li>対象リポジトリに <code>workflow_dispatch</code> トリガーのワークフローを作成（下記の例を参照）</li>
                        <li>GitHub Settings → Developer settings → <strong>Fine-grained personal access tokens</strong> でトークンを発行<br>
                            必要な権限: 対象リポジトリに対して <strong>Actions: Read and write</strong></li>
                        <li>Dispatch URLを取得して入力:<br>
                            <code>https://api.github.com/repos/<strong>{owner}</strong>/<strong>{repo}</strong>/actions/workflows/<strong>{workflow_file}</strong>/dispatches</code><br>
                            <small style="color:#666">例: <code>https://api.github.com/repos/myorg/myrepo/actions/workflows/update-schedule.yml/dispatches</code></small></li>
                        <li>Personal Access Tokenを入力して「設定を保存」</li>
                    </ol>

                    <div style="background:#e8f5e9;border-radius:4px;padding:12px;margin-bottom:12px;font-size:0.85rem">
                        <strong>Dispatch URLの確認方法:</strong> GitHub リポジトリ → Actions → 対象ワークフロー名をクリック。ブラウザのURLが <code>https://github.com/{owner}/{repo}/actions/workflows/{workflow_file}</code> の形式になるので、これを上記の形式に置き換えてください。
                    </div>

                    <p style="margin:0 0 8px 0;font-size:0.9rem;font-weight:600">ワークフロー例 (<code>.github/workflows/update-schedule.yml</code>):</p>
                    <pre v-pre style="background:#263238;color:#eeffff;padding:12px;border-radius:4px;overflow-x:auto;font-size:0.85rem"><code>name: Update Schedule Cache
on:
  workflow_dispatch:
    inputs:
      schedule_url:
        description: "Public API URL (with key)"
        required: true
jobs:
  update:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: Fetch schedule
        run: |
          mkdir -p docs
          curl -sf "${{ inputs.schedule_url }}" \
            -o docs/schedule.json
          echo "Fetched schedule:"
          jq '.snapshot_id, .published_at, (.sessions | length)' \
            docs/schedule.json
      - name: Commit and push if changed
        run: |
          git config user.name "github-actions[bot]"
          git config user.email "github-actions[bot]@users.noreply.github.com"
          git add docs/schedule.json
          if git diff --cached --quiet; then
            echo "No changes to commit"
          else
            git commit -m "Update schedule cache"
            git push
          fi</code></pre>
                    <p style="margin:8px 0 0 0;font-size:0.85rem;color:#666">パブリッシュ時にスケジュールAPIのURL（APIキー含む）が <code>inputs.schedule_url</code> として自動で渡されます。GitHub Actions実行が失敗してもパブリッシュ自体は成功します。</p>

                    <div style="background:#fff3e0;border-radius:4px;padding:12px;margin-bottom:12px;margin-top:12px;font-size:0.85rem">
                        <strong>画像のキャッシュについて:</strong> 登壇者写真はリクエストのたびにこのサーバーから転送されます。外部サイトで表示する場合は、CDN・リバースプロキシ・サーバーサイドキャッシュ等を利用し、画像を外部サイト側でキャッシュしてください。スケジュールデータ更新時に画像URLも変わらないため、<code>snapshot_id</code> の変更を検知したタイミングでキャッシュを更新する運用を推奨します。
                    </div>

                    <h4 style="margin:16px 0 8px 0;font-size:0.95rem">セッション形式</h4>
                    <p style="margin:0 0 8px 0;font-size:0.9rem">セッションには3つの形式があり、<code>category</code> フィールドで判別できます。</p>
                    <table style="font-size:0.85rem;margin-bottom:12px">
                        <thead><tr><th>形式</th><th>category</th><th>登壇者</th><th>lt_talks</th></tr></thead>
                        <tbody>
                            <tr><td>通常セッション</td><td>general, tech, keynote 等</td><td><code>speaker</code> に1名</td><td>空配列 <code>[]</code></td></tr>
                            <tr><td>LT（ライトニングトーク）</td><td>lt</td><td><code>speaker</code> = 司会者名</td><td>個別トークの配列（各トークに登壇者情報）</td></tr>
                            <tr><td>パネルディスカッション</td><td>panel</td><td><code>speaker</code> = モデレーター名</td><td>パネリストの配列（各パネリストに詳細情報）</td></tr>
                        </tbody>
                    </table>
                    <p style="margin:0 0 8px 0;font-size:0.85rem;color:#666">LT・パネルでは <code>lt_talks</code> 配列に個別の登壇者情報（名前・所属・写真等）が含まれるため、そちらを使用してください。<code>is_representative: 1</code> の登壇者がLTの司会者 / パネルのモデレーターです（0または1名）。</p>

                    <p style="margin:8px 0;font-size:0.9rem;font-weight:600">通常セッション:</p>
                    <pre style="background:#263238;color:#eeffff;padding:12px;border-radius:4px;overflow-x:auto;font-size:0.85rem"><code>{
  "title": "Webアプリケーション設計",
  "category": "tech",
  "speaker": "山田太郎",
  "speaker_org": "株式会社テック",
  "speaker_title": "CTO",
  "speaker_profile": "経歴...",
  "speaker_photo_url": "https://.../public/api/photo/xxx.jpg?key=...",
  "start_time": "2026-06-01T10:00:00",
  "end_time": "2026-06-01T11:00:00",
  "room_name": "Room A",
  "lt_talks": []
}</code></pre>

                    <p style="margin:12px 0 8px 0;font-size:0.9rem;font-weight:600">LT / パネルディスカッション:</p>
                    <pre style="background:#263238;color:#eeffff;padding:12px;border-radius:4px;overflow-x:auto;font-size:0.85rem"><code>{
  "title": "ライトニングトーク大会",
  "category": "lt",
  "speaker": "佐藤一郎",
  "start_time": "2026-06-01T13:00:00",
  "end_time": "2026-06-01T14:00:00",
  "room_name": "Room A",
  "lt_talks": [
    {
      "title": "5分で分かるRust",
      "speaker": "佐藤一郎",
      "speaker_org": "OSS Corp",
      "speaker_title": "エンジニア",
      "speaker_photo_url": "https://...",
      "start_time": "13:00",
      "end_time": "13:10",
      "order": 0,
      "is_representative": 1
    },
    {
      "title": "TypeScript Tips",
      "speaker": "田中二郎",
      "speaker_org": "Web Inc",
      "speaker_photo_url": "https://...",
      "start_time": "13:10",
      "end_time": "13:20",
      "order": 1,
      "is_representative": 0
    }
  ]
}</code></pre>

                    <p style="margin:12px 0 8px 0;font-size:0.9rem;font-weight:600">形式の判別例:</p>
                    <pre style="background:#263238;color:#eeffff;padding:12px;border-radius:4px;overflow-x:auto;font-size:0.85rem"><code>data.sessions.forEach(session => {
  if (session.lt_talks.length > 0) {
    // LT またはパネル — lt_talks 配列に個別の登壇者
    session.lt_talks.forEach(talk => {
      console.log(talk.speaker, talk.title);
    });
  } else {
    // 通常セッション — speaker が登壇者
    console.log(session.speaker, session.title);
  }
});</code></pre>
                </div>
            </details>
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
