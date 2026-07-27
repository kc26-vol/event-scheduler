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
                    <button type="button" class="btn" style="background:#607d8b;font-size:0.85rem;padding:6px 14px" @click="$event.target.parentElement.querySelector('input[type=file]').click()">ファイルを選択</button>
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

            <div style="margin-top:20px">
                <div v-for="s in staffs" :key="s.id" class="staff-detail-card" :style="staffForm.editId === s.id ? 'background:#fff3e0;outline:2px solid #ff9800' : ''">
                    <div style="display:flex;justify-content:space-between;align-items:center">
                        <div style="display:flex;align-items:center;gap:10px">
                            <img v-if="s.photo" :src="s.photo" :alt="s.name" class="speaker-photo"
                                 :style="staffForm.editId ? '' : 'cursor:pointer'"
                                 @click="!staffForm.editId && triggerStaffPhotoInput(s.id)">
                            <span v-else class="speaker-photo-placeholder"
                                  :style="staffForm.editId ? '' : 'cursor:pointer'"
                                  @click="!staffForm.editId && triggerStaffPhotoInput(s.id)">{{ s.name.charAt(0) }}</span>
                            <input type="file" :id="'staffPhotoInput_'+s.id" accept="image/jpeg,image/png,image/gif,image/webp"
                                   style="display:none" @change="uploadStaffPhoto(s.id, $event)">
                            <h3 style="margin:0">
                                {{ s.name }}
                                <span v-if="s.slack_name" style="font-weight:normal;font-size:0.85rem;color:#888">( a.k.a {{ s.slack_name }} )</span>
                                <span v-if="!s.role || !s.role.length" class="badge" style="background:#eceff1;color:#666">なし</span>
                                <span class="badge" v-for="r in (Array.isArray(s.role) ? s.role : [s.role])" :key="r">{{ catLabel(r) }}</span>
                                <span v-if="s.english_ok" class="badge" style="background:#e0f2f1;color:#00695c">EN</span>
                                <span v-if="s.experience_count === 0" class="badge warn">初参加</span>
                                <span v-else class="badge avail">{{ s.experience_count }}回目</span>
                                <span class="badge" style="background:#e8f0fe;color:#1a73e8">担当: {{ staffAssignCount[s.id] || 0 }}件</span>
                            </h3>
                            <div v-if="s.emergency_contact" style="font-size:0.8rem;color:#888;margin-top:2px">緊急連絡先: {{ s.emergency_contact }}</div>
                        </div>
                        <div>
                            <button class="btn btn-sm edit-btn" @click="editStaff(s)" style="margin-right:4px" :style="staffForm.editId === s.id ? 'background:#ff9800;color:#fff' : ''">{{ staffForm.editId === s.id ? '編集中' : '編集' }}</button>
                            <button class="del-btn" @click="deleteStaff(s.id)">削除</button>
                        </div>
                    </div>
                    <div style="margin-top:4px">
                        <span style="font-size:0.8rem;color:#666">活動可能時間: </span>
                        <template v-if="s.availabilities.length">
                            <span class="badge avail" v-for="a in s.availabilities" :key="a.id">
                                {{ fmt(a.start_time) }} - {{ fmtShort(a.end_time) }}
                            </span>
                        </template>
                        <span v-else style="color:#999;font-size:0.85rem">制限なし（終日対応可能）</span>
                    </div>
                    <div v-if="s.preferred_sessions.length" style="margin-top:4px">
                        <span style="font-size:0.8rem;color:#666">希望:</span>
                        <div style="display:flex;flex-direction:column;gap:4px;align-items:flex-start;margin-top:4px">
                            <span class="badge pref" v-for="p in sortedPrefs(s.preferred_sessions)" :key="p.id">
                                第{{ p.priority }}希望: {{ p.session ? fmt(p.session.start_time) + ' ' + p.session.title : 'セッション ' + p.session_id }}
                            </span>
                        </div>
                    </div>
                </div>
            </div>
        </div>
</template>

<script>
import { useStore } from '../store'

export default {
    setup() {
        return useStore()
    },
    methods: {
        // テンプレート内で document を直接参照できないためメソッド経由にする
        triggerStaffPhotoInput(id) {
            document.getElementById('staffPhotoInput_' + id).click()
        },
    },
}
</script>
