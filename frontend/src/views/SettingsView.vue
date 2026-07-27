<template>
        <div class="panel active">
            <h2>設定</h2>

            <!-- アプリタイトル -->
            <div style="background:#e3f2fd;border:1px solid #90caf9;border-radius:8px;padding:20px;margin-bottom:20px">
                <h3 style="margin:0 0 12px;color:#1565c0">アプリ設定</h3>
                <div style="display:flex;align-items:flex-end;gap:12px;flex-wrap:wrap;margin-bottom:12px">
                    <div class="form-group" style="margin:0;flex:1;min-width:240px">
                        <label style="font-size:0.85rem">アプリケーションタイトル</label>
                        <input v-model="settingsForm.app_title" placeholder="アプリケーションタイトル" style="width:100%">
                    </div>
                </div>
                <div style="display:flex;align-items:flex-end;gap:12px;flex-wrap:wrap;margin-bottom:12px">
                    <div class="form-group" style="margin:0">
                        <label style="font-size:0.85rem">タイムゾーン</label>
                        <select v-model="settingsForm.timezone" style="width:240px;padding:8px 12px;border:1px solid #ccc;border-radius:6px;font-size:0.95rem">
                            <option value="Asia/Tokyo">Asia/Tokyo (JST)</option>
                            <option value="UTC">UTC</option>
                            <option value="America/New_York">America/New_York (EST)</option>
                            <option value="America/Los_Angeles">America/Los_Angeles (PST)</option>
                            <option value="Europe/London">Europe/London (GMT)</option>
                            <option value="Europe/Berlin">Europe/Berlin (CET)</option>
                            <option value="Asia/Shanghai">Asia/Shanghai (CST)</option>
                            <option value="Asia/Singapore">Asia/Singapore (SGT)</option>
                            <option value="Asia/Seoul">Asia/Seoul (KST)</option>
                            <option value="Australia/Sydney">Australia/Sydney (AEST)</option>
                        </select>
                        <div style="font-size:0.8rem;color:#666;margin-top:4px">バックアップやエクスポートのタイムスタンプに使用されます</div>
                    </div>
                </div>
                <div style="margin-bottom:12px">
                    <label style="display:flex;align-items:center;gap:8px;cursor:pointer">
                        <input type="checkbox" v-model="settingsForm.allow_overlap">
                        <span>スタッフの時間重複配置を許可する</span>
                    </label>
                    <div style="font-size:0.8rem;color:#666;margin-top:4px;margin-left:26px">有効にすると、同一スタッフを時間が重なるセッションに配置できます</div>
                </div>
                <div style="margin-bottom:12px">
                    <label style="display:block;font-weight:600;margin-bottom:4px">別部屋への移動時間（分）</label>
                    <input type="number" min="0" v-model.number="settingsForm.travel_buffer_minutes" style="width:120px;padding:8px 12px;border:1px solid #ccc;border-radius:6px;font-size:0.95rem">
                    <div style="font-size:0.8rem;color:#666;margin-top:4px">別の部屋のセッションを続けて担当する場合に必要な最低間隔。自動配置・手動配置・ドラッグ移動で考慮されます（0で無効）</div>
                </div>
                <div>
                    <button class="btn" @click="saveSettings">保存</button>
                </div>
                <div v-if="settingsMsg" style="margin-top:10px;font-size:0.85rem;color:#2e7d32">{{ settingsMsg }}</div>
            </div>

            <!-- セッション形式管理 -->
            <div style="background:#e8f5e9;border:1px solid #a5d6a7;border-radius:8px;padding:20px;margin-bottom:20px">
                <h3 style="margin:0 0 12px;color:#2e7d32">セッション形式管理</h3>
                <p style="margin:0 0 12px;font-size:0.85rem;color:#555">セッション登録時に選択できる形式を追加できます。デフォルト（一般・ワークショップ・基調講演・パネルディスカッション・LT）は常に表示されます。</p>

                <!-- デフォルトカテゴリ一覧 -->
                <div v-for="dc in defaultSessionCats" :key="'defcat-'+dc.key" style="display:flex;align-items:center;gap:12px;padding:8px 12px;background:#f5f5f5;border-radius:6px;margin-bottom:6px;border:1px solid #e0e0e0">
                    <span style="font-weight:600;flex:1">{{ dc.label }}</span>
                    <span style="font-size:0.8rem;color:#aaa">{{ dc.key }}</span>
                    <span style="font-size:0.75rem;color:#999">デフォルト</span>
                </div>

                <!-- 追加カテゴリ一覧 -->
                <div v-for="(ec, idx) in extraSessionCats" :key="'excat-'+ec.key" style="display:flex;align-items:center;gap:12px;padding:8px 12px;border-radius:6px;margin-bottom:6px;border:1px solid #e0e0e0" :style="sessCatForm.editIdx === idx ? 'background:#fff3e0;outline:2px solid #ff9800' : 'background:#fff'">
                    <span style="font-weight:600;flex:1">{{ ec.label }}</span>
                    <span style="font-size:0.8rem;color:#888">{{ ec.key }}</span>
                    <button class="btn btn-sm edit-btn" @click="editSessCat(idx)" style="padding:4px 10px;font-size:0.8rem" :style="sessCatForm.editIdx === idx ? 'background:#ff9800;color:#fff' : ''">{{ sessCatForm.editIdx === idx ? '編集中' : '編集' }}</button>
                    <button class="del-btn" @click="deleteSessCat(idx)" style="padding:4px 10px;font-size:0.8rem">削除</button>
                </div>

                <!-- 追加/編集フォーム -->
                <div style="margin-top:12px;padding:12px;background:#f0fff0;border-radius:6px;border:1px dashed #a5d6a7">
                    <strong style="font-size:0.85rem;color:#2e7d32">{{ sessCatForm.editIdx !== null ? '形式編集' : '新しい形式を追加' }}</strong>
                    <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:8px;align-items:flex-end">
                        <div class="form-group" style="margin:0;flex:1;min-width:120px">
                            <label style="font-size:0.8rem">表示名</label>
                            <input v-model="sessCatForm.label" placeholder="例: パネルディスカッション" style="width:100%">
                        </div>
                        <button class="btn" style="background:#2e7d32;align-self:flex-end" @click="saveSessCat">{{ sessCatForm.editIdx !== null ? '更新' : '追加' }}</button>
                        <button v-if="sessCatForm.editIdx !== null" class="btn btn-danger" style="align-self:flex-end" @click="cancelSessCat">キャンセル</button>
                    </div>
                    <div v-if="sessCatMsg" style="margin-top:8px;font-size:0.85rem;color:#2e7d32">{{ sessCatMsg }}</div>
                </div>
            </div>

            <!-- 担当管理 -->
            <div style="background:#e0f2f1;border:1px solid #80cbc4;border-radius:8px;padding:20px;margin-bottom:20px">
                <h3 style="margin:0 0 12px;color:#00695c">担当管理</h3>
                <p style="margin:0 0 12px;font-size:0.85rem;color:#555">スタッフの担当として選択できる項目を追加・編集できます。セッションとカテゴリの担当は常に表示されます。</p>

                <!-- 固定担当 -->
                <div style="display:flex;align-items:center;gap:12px;padding:8px 12px;background:#f5f5f5;border-radius:6px;margin-bottom:6px;border:1px solid #e0e0e0">
                    <span style="font-weight:600;flex:1">セッション</span>
                    <span style="font-size:0.8rem;color:#aaa">session</span>
                    <span style="font-size:0.75rem;color:#999">デフォルト</span>
                </div>

                <!-- カテゴリ由来の担当 -->
                <div v-for="cat in categories" :key="'rolecat-'+cat.key" style="display:flex;align-items:center;gap:12px;padding:8px 12px;background:#f5f5f5;border-radius:6px;margin-bottom:6px;border:1px solid #e0e0e0">
                    <span style="font-weight:600;flex:1">{{ cat.label }}</span>
                    <span style="font-size:0.8rem;color:#aaa">{{ cat.key }}</span>
                    <span style="font-size:0.75rem;color:#999">カテゴリ</span>
                </div>

                <!-- カスタム担当一覧 -->
                <div v-for="(cr, idx) in customRoles" :key="'crole-'+cr.key" style="display:flex;align-items:center;gap:12px;padding:8px 12px;border-radius:6px;margin-bottom:6px;border:1px solid #e0e0e0" :style="roleSettingForm.editIdx === idx ? 'background:#fff3e0;outline:2px solid #ff9800' : 'background:#fff'">
                    <span style="font-weight:600;flex:1">{{ cr.label }}</span>
                    <span style="font-size:0.8rem;color:#888">{{ cr.key }}</span>
                    <button class="btn btn-sm edit-btn" @click="editRoleSetting(idx)" style="padding:4px 10px;font-size:0.8rem" :style="roleSettingForm.editIdx === idx ? 'background:#ff9800;color:#fff' : ''">{{ roleSettingForm.editIdx === idx ? '編集中' : '編集' }}</button>
                    <button class="del-btn" @click="deleteRoleSetting(idx)" style="padding:4px 10px;font-size:0.8rem">削除</button>
                </div>

                <!-- 追加/編集フォーム -->
                <div style="margin-top:12px;padding:12px;background:#f0faf9;border-radius:6px;border:1px dashed #80cbc4">
                    <strong style="font-size:0.85rem;color:#00695c">{{ roleSettingForm.editIdx !== null ? '担当編集' : '新しい担当を追加' }}</strong>
                    <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:8px;align-items:flex-end">
                        <div class="form-group" style="margin:0;flex:1;min-width:120px">
                            <label style="font-size:0.8rem">表示名</label>
                            <input v-model="roleSettingForm.label" placeholder="例: 設営" style="width:100%">
                        </div>
                        <button class="btn" style="background:#00695c;align-self:flex-end" @click="saveRoleSetting">{{ roleSettingForm.editIdx !== null ? '更新' : '追加' }}</button>
                        <button v-if="roleSettingForm.editIdx !== null" class="btn btn-danger" style="align-self:flex-end" @click="cancelRoleSetting">キャンセル</button>
                    </div>
                    <div v-if="roleSettingMsg" style="margin-top:8px;font-size:0.85rem;color:#00695c">{{ roleSettingMsg }}</div>
                </div>
            </div>

            <!-- セッショングループ管理 -->
            <div style="background:#e3f2fd;border:1px solid #90caf9;border-radius:8px;padding:20px;margin-bottom:20px">
                <h3 style="margin:0 0 12px;color:#1565c0">セッショングループ管理</h3>
                <p style="margin:0 0 12px;font-size:0.85rem;color:#555">セッショングループを追加・編集できます。各グループはセッション管理ページと担当ページのセットとして機能します。</p>

                <!-- 既存グループ一覧 -->
                <div v-for="grp in sessionGroups" :key="'grpsettings-'+grp.id" style="display:flex;align-items:center;gap:12px;padding:10px 12px;border-radius:6px;margin-bottom:8px;border:1px solid #e0e0e0" :style="grpSettingForm.editId === grp.id ? 'background:#fff3e0;outline:2px solid #ff9800' : 'background:#fff'">
                    <span :style="{width:'16px',height:'16px',borderRadius:'50%',background:grp.color,flexShrink:0}"></span>
                    <span style="font-weight:600;flex:1">{{ grp.label }}</span>
                    <span class="badge" style="background:#e0f2f1;color:#00695c">担当: セッション</span>
                    <span v-for="rk in (groupRoleLinks[grp.id] || [])" :key="'grl-'+grp.id+'-'+rk" class="badge" style="background:#e8f0fe;color:#1a73e8">担当: {{ catLabel(rk) }}</span>
                    <span style="font-size:0.8rem;color:#888">order: {{ grp.order }}</span>
                    <button class="btn btn-sm edit-btn" @click="editGrpSetting(grp)" style="padding:4px 10px;font-size:0.8rem" :style="grpSettingForm.editId === grp.id ? 'background:#ff9800;color:#fff' : ''">{{ grpSettingForm.editId === grp.id ? '編集中' : '編集' }}</button>
                    <button class="del-btn" @click="deleteGrpSetting(grp.id)" style="padding:4px 10px;font-size:0.8rem">削除</button>
                </div>

                <!-- 追加/編集フォーム -->
                <div style="margin-top:16px;padding:12px;background:#f0f7ff;border-radius:6px;border:1px dashed #90caf9">
                    <strong style="font-size:0.85rem;color:#1565c0">{{ grpSettingForm.editId ? 'グループ編集' : '新しいグループを追加' }}</strong>
                    <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:8px;align-items:flex-end">
                        <div class="form-group" style="margin:0;flex:1;min-width:120px">
                            <label style="font-size:0.8rem">表示名</label>
                            <input v-model="grpSettingForm.label" placeholder="例: メイン" style="width:100%">
                        </div>
                        <div class="form-group" style="margin:0;min-width:60px">
                            <label style="font-size:0.8rem">色</label>
                            <input v-model="grpSettingForm.color" type="color" style="width:48px;height:34px;padding:2px;cursor:pointer">
                        </div>
                        <div class="form-group" style="margin:0;min-width:60px">
                            <label style="font-size:0.8rem">順序</label>
                            <input v-model.number="grpSettingForm.order" type="number" min="0" style="width:60px">
                        </div>
                        <button class="btn" style="background:#1565c0;align-self:flex-end" @click="saveGrpSetting">{{ grpSettingForm.editId ? '更新' : '追加' }}</button>
                        <button v-if="grpSettingForm.editId" class="btn btn-danger" style="align-self:flex-end" @click="cancelGrpSetting">キャンセル</button>
                    </div>
                    <!-- 担当の紐づけ（編集中のみ） -->
                    <div v-if="grpSettingForm.editId" style="margin-top:12px;display:flex;align-items:center;gap:8px;flex-wrap:wrap">
                        <label style="font-size:0.8rem;font-weight:600;margin:0">担当:</label>
                        <span class="badge" style="background:#e0f2f1;color:#00695c">セッション（デフォルト）</span>
                        <span v-for="rk in (groupRoleLinks[grpSettingForm.editId] || [])" :key="'grlf-'+rk" class="badge" style="background:#e8f0fe;color:#1a73e8;display:inline-flex;align-items:center;gap:4px">
                            {{ catLabel(rk) }}
                            <button @click="removeGrpRoleLink(grpSettingForm.editId, rk)" style="background:none;border:none;color:#d93025;cursor:pointer;font-size:0.9rem;padding:0 2px" title="削除">&#10005;</button>
                        </span>
                        <template v-if="customRoles.filter(cr => !(groupRoleLinks[grpSettingForm.editId] || []).includes(cr.key)).length">
                            <select v-model="grpRoleLinkSelect[grpSettingForm.editId]" style="padding:2px 6px;font-size:0.8rem;border:1px solid #ccc;border-radius:4px">
                                <option value="">＋担当を紐づけ</option>
                                <option v-for="cr in customRoles.filter(cr => !(groupRoleLinks[grpSettingForm.editId] || []).includes(cr.key))" :key="'grlfopt-'+cr.key" :value="cr.key">{{ cr.label }}</option>
                            </select>
                            <button v-if="grpRoleLinkSelect[grpSettingForm.editId]" class="btn btn-sm" @click="addGrpRoleLink(grpSettingForm.editId)" style="padding:2px 8px">追加</button>
                        </template>
                    </div>
                    <div v-if="grpSettingMsg" style="margin-top:8px;font-size:0.85rem;color:#2e7d32">{{ grpSettingMsg }}</div>
                </div>
            </div>

            <!-- カテゴリ管理 -->
            <div style="background:#f3e5f5;border:1px solid #ce93d8;border-radius:8px;padding:20px;margin-bottom:20px">
                <h3 style="margin:0 0 12px;color:#6a1b9a">カテゴリ管理</h3>
                <p style="margin:0 0 12px;font-size:0.85rem;color:#555">受付案内・懇親会などの担当カテゴリを追加・編集できます。各カテゴリは管理ページと担当ページのセットとして機能します。</p>

                <!-- 既存カテゴリ一覧 -->
                <div v-for="cat in categories" :key="'catsettings-'+cat.id" style="display:flex;align-items:center;gap:12px;padding:10px 12px;border-radius:6px;margin-bottom:8px;border:1px solid #e0e0e0;flex-wrap:wrap" :style="catSettingForm.editId === cat.id ? 'background:#fff3e0;outline:2px solid #ff9800' : 'background:#fff'">
                    <span :style="{width:'16px',height:'16px',borderRadius:'50%',background:cat.color,flexShrink:0}"></span>
                    <span style="font-weight:600;flex:1">{{ cat.label }}</span>
                    <span class="badge" style="background:#e0f2f1;color:#00695c">担当: {{ cat.label }}</span>
                    <span v-for="rk in (categoryRoleLinks[cat.key] || [])" :key="'crl-'+cat.key+'-'+rk" class="badge" style="background:#e8f0fe;color:#1a73e8">担当: {{ catLabel(rk) }}</span>
                    <span style="font-size:0.8rem;color:#888">order: {{ cat.order }}</span>
                    <button class="btn btn-sm edit-btn" @click="editCatSetting(cat)" style="padding:4px 10px;font-size:0.8rem" :style="catSettingForm.editId === cat.id ? 'background:#ff9800;color:#fff' : ''">{{ catSettingForm.editId === cat.id ? '編集中' : '編集' }}</button>
                    <button class="del-btn" @click="deleteCatSetting(cat.id)" style="padding:4px 10px;font-size:0.8rem">削除</button>
                </div>

                <!-- 追加/編集フォーム -->
                <div style="margin-top:16px;padding:12px;background:#faf5fc;border-radius:6px;border:1px dashed #ce93d8">
                    <strong style="font-size:0.85rem;color:#6a1b9a">{{ catSettingForm.editId ? 'カテゴリ編集' : '新しいカテゴリを追加' }}</strong>
                    <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:8px;align-items:flex-end">
                        <div class="form-group" style="margin:0;flex:1;min-width:100px">
                            <label style="font-size:0.8rem">表示名</label>
                            <input v-model="catSettingForm.label" placeholder="例: 設営" style="width:100%">
                        </div>
                        <div class="form-group" style="margin:0;min-width:60px">
                            <label style="font-size:0.8rem">色</label>
                            <input v-model="catSettingForm.color" type="color" style="width:48px;height:34px;padding:2px;cursor:pointer">
                        </div>
                        <div class="form-group" style="margin:0;min-width:60px">
                            <label style="font-size:0.8rem">順序</label>
                            <input v-model.number="catSettingForm.order" type="number" min="0" style="width:60px">
                        </div>
                        <button class="btn" style="background:#6a1b9a;align-self:flex-end" @click="saveCatSetting">{{ catSettingForm.editId ? '更新' : '追加' }}</button>
                        <button v-if="catSettingForm.editId" class="btn btn-danger" style="align-self:flex-end" @click="cancelCatSetting">キャンセル</button>
                    </div>
                    <!-- 担当の紐づけ（編集中のみ） -->
                    <div v-if="catSettingForm.editId" style="margin-top:12px;display:flex;align-items:center;gap:8px;flex-wrap:wrap">
                        <label style="font-size:0.8rem;font-weight:600;margin:0">担当:</label>
                        <span class="badge" style="background:#e0f2f1;color:#00695c">{{ catSettingForm.label }}（デフォルト）</span>
                        <span v-for="rk in (categoryRoleLinks[catSettingForm.key] || [])" :key="'crlf-'+rk" class="badge" style="background:#e8f0fe;color:#1a73e8;display:inline-flex;align-items:center;gap:4px">
                            {{ catLabel(rk) }}
                            <button @click="removeCatRoleLink(catSettingForm.key, rk)" style="background:none;border:none;color:#d93025;cursor:pointer;font-size:0.9rem;padding:0 2px" title="削除">&#10005;</button>
                        </span>
                        <template v-if="customRoles.filter(cr => !(categoryRoleLinks[catSettingForm.key] || []).includes(cr.key)).length">
                            <select v-model="catRoleLinkSelect[catSettingForm.key]" style="padding:2px 6px;font-size:0.8rem;border:1px solid #ccc;border-radius:4px">
                                <option value="">＋担当を紐づけ</option>
                                <option v-for="cr in customRoles.filter(cr => !(categoryRoleLinks[catSettingForm.key] || []).includes(cr.key))" :key="'crlfopt-'+cr.key" :value="cr.key">{{ cr.label }}</option>
                            </select>
                            <button v-if="catRoleLinkSelect[catSettingForm.key]" class="btn btn-sm" @click="addCatRoleLink(catSettingForm.key)" style="padding:2px 8px">追加</button>
                        </template>
                    </div>
                    <div v-if="catSettingMsg" style="margin-top:8px;font-size:0.85rem;color:#2e7d32">{{ catSettingMsg }}</div>
                </div>
            </div>

            <!-- パスワード変更 -->
            <div style="background:#fff3e0;border:1px solid #ffcc80;border-radius:8px;padding:20px;margin-bottom:20px">
                <h3 style="margin:0 0 12px;color:#e65100">ログインパスワード変更</h3>
                <div style="display:flex;align-items:flex-end;gap:12px;flex-wrap:wrap">
                    <div class="form-group" style="margin:0">
                        <label style="font-size:0.85rem">現在のパスワード</label>
                        <input v-model="pwForm.current" type="password" placeholder="現在のパスワード" style="width:200px">
                    </div>
                    <div class="form-group" style="margin:0">
                        <label style="font-size:0.85rem">新しいパスワード</label>
                        <input v-model="pwForm.newPw" type="password" placeholder="新しいパスワード" style="width:200px">
                    </div>
                    <button class="btn" @click="changePassword" :disabled="!pwForm.current || !pwForm.newPw">変更</button>
                </div>
                <div v-if="pwMsg" :style="{marginTop:'10px',fontSize:'0.85rem',color: pwMsgError ? '#c62828' : '#2e7d32'}">{{ pwMsg }}</div>
            </div>

            <!-- 管理者パスワード変更 -->
            <div style="background:#fff3e0;border:1px solid #ffe0b2;border-radius:8px;padding:20px;margin-bottom:20px">
                <h3 style="margin:0 0 8px;color:#e65100">管理者パスワードの変更</h3>
                <p style="margin:0 0 12px;font-size:0.9rem;color:#555">管理者操作に使用するパスワードを変更します。</p>
                <div style="display:flex;align-items:flex-end;gap:12px;flex-wrap:wrap">
                    <div class="form-group" style="margin:0">
                        <label style="font-size:0.85rem">現在のパスワード</label>
                        <input v-model="resetPwForm.current" type="password" placeholder="現在のパスワード" style="width:200px">
                    </div>
                    <div class="form-group" style="margin:0">
                        <label style="font-size:0.85rem">新しいパスワード</label>
                        <input v-model="resetPwForm.newPw" type="password" placeholder="新しいパスワード" style="width:200px">
                    </div>
                    <button class="btn" style="background:#e65100;padding:8px 20px" @click="changeResetPassword" :disabled="!resetPwForm.current || !resetPwForm.newPw">変更</button>
                </div>
                <div v-if="resetPwMsg" :style="{marginTop:'12px',padding:'10px 16px',borderRadius:'6px',fontSize:'0.9rem',background: resetPwMsgError ? '#fce4ec' : '#e8f5e9', color: resetPwMsgError ? '#c62828' : '#2e7d32'}">
                    {{ resetPwMsg }}
                </div>
            </div>

            <!-- データ初期化 -->
            <div style="background:#fce4ec;border:1px solid #ef9a9a;border-radius:8px;padding:20px;margin-bottom:20px">
                <h3 style="margin:0 0 8px;color:#c62828">データの完全初期化</h3>
                <p style="margin:0 0 8px;font-size:0.9rem;color:#555">すべてのデータ（部屋、セッション、スタッフ、配置、会場地図、アップロード画像）を完全に削除し、初期状態に戻します。</p>
                <p style="margin:0 0 16px;font-size:0.85rem;color:#c62828;font-weight:600">※ この操作は取り消せません。必要に応じて事前にバックアップをエクスポートしてください。</p>
                <div style="display:flex;align-items:center;gap:12px;flex-wrap:wrap">
                    <div class="form-group" style="margin:0">
                        <label style="font-size:0.85rem">パスワード</label>
                        <input v-model="resetPassword" type="password" placeholder="管理者パスワードを入力" style="width:240px">
                    </div>
                    <button class="btn btn-danger" style="font-size:1rem;padding:10px 24px;align-self:flex-end" @click="resetAllData" :disabled="!resetPassword" :style="{opacity: resetPassword ? 1 : 0.5, cursor: resetPassword ? 'pointer' : 'not-allowed'}">完全初期化を実行</button>
                </div>
                <div v-if="resetMsg" :style="{marginTop:'12px',padding:'10px 16px',borderRadius:'6px',fontSize:'0.9rem',background: resetMsgError ? '#fce4ec' : '#e8f5e9', color: resetMsgError ? '#c62828' : '#2e7d32'}">
                    {{ resetMsg }}
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
