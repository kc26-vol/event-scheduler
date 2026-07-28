<template>
        <div class="panel active">
            <div style="margin-bottom:12px">
                <button class="btn btn-sm" @click="router.push('/staffs')">← スタッフ一覧に戻る</button>
            </div>
            <template v-if="staff">
                <h2>
                    {{ staff.name }}
                    <span v-if="staff.slack_name" style="font-size:0.9rem;font-weight:400;color:#888">( a.k.a {{ staff.slack_name }} )</span>
                    <span v-if="!staff.role || !staff.role.length" class="badge" style="background:#eceff1;color:#666">なし</span>
                    <span class="badge" v-for="r in (Array.isArray(staff.role) ? staff.role : [staff.role])" :key="r">{{ catLabel(r) }}</span>
                    <span v-if="staff.english_ok" class="badge" style="background:#e0f2f1;color:#00695c">EN</span>
                    <span v-if="staff.experience_count === 0" class="badge warn">初参加</span>
                    <span v-else class="badge avail">{{ staff.experience_count }}回目</span>
                </h2>

                <!-- 基本情報編集フォーム -->
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
                <div style="display:flex;gap:8px;margin-top:12px">
                    <button class="btn" @click="submitStaff">更新</button>
                    <button class="btn btn-danger" @click="resetForm">キャンセル</button>
                    <button class="btn btn-danger" style="margin-left:auto" @click="onDelete">このスタッフを削除</button>
                </div>

                <!-- 活動可能時間 -->
                <div class="detail-section" style="margin-top:16px;padding:12px;background:#f8f9fa;border-radius:6px">
                    <h4 style="margin-top:0">活動可能時間</h4>
                    <template v-if="editingStaffAvails.length">
                        <span class="badge avail" v-for="a in editingStaffAvails" :key="a.id" style="display:inline-flex;align-items:center;gap:4px">
                            <TimeRange :start="a.start_time" :end="a.end_time" size="sm" inline />
                            <button class="del-btn" style="font-size:0.75rem;padding:0 4px" @click="removeAvail(staffId, a.id)">x</button>
                        </span>
                    </template>
                    <span v-if="!editingStaffAvails.length" style="color:#999;font-size:0.85rem">制限なし（終日対応可能）</span>
                    <div class="inline-form" style="margin-top:8px" v-if="availForms[staffId]">
                        <div class="form-group"><input v-model="availForms[staffId].start" type="datetime-local" step="300"></div>
                        <div class="form-group"><input v-model="availForms[staffId].end" type="datetime-local" step="300"></div>
                        <button class="btn btn-sm" @click="addAvail(staffId)">追加</button>
                    </div>
                </div>

                <!-- 希望セッション -->
                <div class="detail-section" style="margin-top:8px;padding:12px;background:#f8f9fa;border-radius:6px">
                    <h4 style="margin-top:0">希望セッション</h4>
                    <div v-if="editingStaffPrefs.length" style="display:flex;flex-direction:column;gap:4px;align-items:flex-start">
                        <span class="badge pref" v-for="p in editingStaffPrefs" :key="p.id" style="display:inline-flex;align-items:center;gap:4px">
                            第{{ p.priority }}希望: {{ p.session ? fmt(p.session.start_time) + ' ' + p.session.title : 'セッション ' + p.session_id }}
                            <button class="del-btn" style="font-size:0.75rem;padding:0 4px" @click="removePref(staffId, p.id)">x</button>
                        </span>
                    </div>
                    <span v-if="!editingStaffPrefs.length" style="color:#999;font-size:0.85rem">希望セッション未設定</span>
                    <div class="inline-form" style="margin-top:8px" v-if="prefForms[staffId]">
                        <div class="form-group" style="flex:2">
                            <SearchSelect
                                v-model="prefForms[staffId].session_id"
                                :options="sessionOptions"
                                placeholder="セッションを選択"
                                search-placeholder="タイトルで検索…"
                                empty-text="セッションがまだ登録されていません"
                                aria-label="希望セッションを選択" />
                        </div>
                        <div class="form-group" style="flex:1">
                            <input v-model.number="prefForms[staffId].priority" type="number" min="1" placeholder="優先度" style="width:80px">
                        </div>
                        <button class="btn btn-sm" @click="addPref(staffId)">追加</button>
                    </div>
                </div>

                <!-- 配置一覧 -->
                <div class="detail-section" style="margin-top:8px;padding:12px;background:#f8f9fa;border-radius:6px">
                    <h4 style="margin-top:0">配置一覧 <span style="font-size:0.85rem;font-weight:normal;color:#666">({{ assignmentEntry ? assignmentEntry.assigned_sessions.length : 0 }}件)</span></h4>
                    <template v-if="assignmentEntry && assignmentEntry.assigned_sessions.length">
                        <table style="table-layout:fixed;width:100%;background:#fff">
                            <colgroup>
                                <col style="width:100px">
                                <col>
                                <col style="width:200px">
                                <col style="width:120px">
                            </colgroup>
                            <thead><tr><th>カテゴリ</th><th>タイトル</th><th>時間</th><th>部屋</th></tr></thead>
                            <tbody>
                                <tr v-for="s in assignmentEntry.assigned_sessions" :key="'spa-'+s.id">
                                    <td><span class="badge" :style="CAT_BG[s.category] ? 'background:' + CAT_BG[s.category].background + ';color:' + CAT_BG[s.category].borderColor : ''">{{ catLabel(s.category) }}</span></td>
                                    <td><a href="#" @click.prevent="toggleSessionDetail(s.id)" style="color:#1a73e8;text-decoration:none">{{ s.title }}</a></td>
                                    <td style="white-space:nowrap"><TimeRange :start="s.start_time" :end="s.end_time" size="sm" inline /></td>
                                    <td>{{ s.room ? s.room.name : '' }}</td>
                                </tr>
                            </tbody>
                        </table>
                    </template>
                    <p v-else style="color:#666;margin:4px 0">担当なし</p>
                </div>
            </template>
            <p v-else>スタッフが見つかりません。</p>
        </div>
</template>

<script setup lang="ts">
import { computed, onMounted, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useStore } from '../store'
import SearchSelect from '../components/SearchSelect.vue'
import TimeRange from '../components/TimeRange.vue'
import { mdw, hhmm } from '../utils/datetime'

const route = useRoute()
const router = useRouter()

// 希望セッションの選択肢。件数が多いので日時でも検索できるようにする。
const sessionOptions = computed(() =>
    sessions.value.map(ss => ({
        value: ss.id,
        label: ss.title,
        sublabel: `${mdw(ss.start_time)} ${hhmm(ss.start_time)}`,
        keywords: `${mdw(ss.start_time)} ${hhmm(ss.start_time)} ${ss.speaker || ''}`,
    }))
)

const {
    staffs, staffForm, staffPhotoPreview, roleDropdownOpen, roleOptions,
    sessions, editingStaffAvails, editingStaffPrefs, availForms, prefForms,
    staffAssignmentsWithAll, CAT_BG,
    catLabel, fmt, fmtShort, sessionLabel,
    submitStaff, editStaff, cancelEditStaff, deleteStaff,
    onNewStaffPhoto, clearNewStaffPhoto, deleteStaffPhoto, onPhotoPaste,
    addAvail, removeAvail, addPref, removePref,
    toggleSessionDetail, loadStaffAssignments,
} = useStore()

// 配置一覧用のデータを読み込む (スタッフ管理タブの enterTab では取得されないため)
onMounted(() => { loadStaffAssignments() })

const staffId = computed(() => Number(route.params.id))
const staff = computed(() => staffs.value.find(s => s.id === staffId.value))
const assignmentEntry = computed(() => staffAssignmentsWithAll.value.find((e: any) => e.staff.id === staffId.value))

// データロード完了後に編集フォームへスタッフ情報をセットする
watch(staff, (s) => {
    if (s && staffForm.editId !== s.id) editStaff(s)
}, { immediate: true })

function resetForm() {
    if (staff.value) editStaff(staff.value)
}

async function onDelete() {
    await deleteStaff(staffId.value)
    // 削除が確定した場合のみ一覧へ戻る (confirm キャンセル時は留まる)
    if (!staffs.value.find(s => s.id === staffId.value)) {
        cancelEditStaff()
        router.push('/staffs')
    }
}

// ファイル選択ボタン (テンプレート内でのDOMキャストを避けるため関数化)
function pickFile(e: MouseEvent) {
    const el = (e.target as HTMLElement).parentElement?.querySelector('input[type=file]')
    ;(el as HTMLInputElement | null)?.click()
}
</script>
