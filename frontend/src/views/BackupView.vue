<template>
        <div class="panel active">
            <h2>バックアップ</h2>
            <div style="max-width:720px">

                <!-- ステータス -->
                <div style="background:#e8f5e9;border-radius:8px;padding:16px;margin-bottom:16px">
                    <h3 style="margin:0 0 12px;color:#2e7d32">ステータス</h3>
                    <div style="display:flex;gap:24px;flex-wrap:wrap;font-size:0.9rem">
                        <div>
                            <strong>自動バックアップ:</strong>
                            <span :style="{color: abSettings.enabled ? '#2e7d32' : '#999'}">{{ abSettings.enabled ? '有効' : '無効' }}</span>
                        </div>
                        <div v-if="abStatus.last_run">
                            <strong>最終実行:</strong> {{ new Date(abStatus.last_run).toLocaleString('ja-JP') }}
                            <span v-if="abStatus.last_status === 'ok'" style="color:#2e7d32">&#10003;</span>
                            <span v-else-if="abStatus.last_status === 'error'" style="color:#d32f2f">&#10007;</span>
                        </div>
                        <div v-if="abStatus.next_run && abSettings.enabled">
                            <strong>次回予定:</strong> {{ new Date(abStatus.next_run).toLocaleString('ja-JP') }}
                        </div>
                    </div>
                    <div v-if="abStatus.error" style="color:#d32f2f;margin-top:8px;font-size:0.85rem">エラー: {{ abStatus.error }}</div>
                </div>

                <!-- 設定 -->
                <div style="background:#e3f2fd;border-radius:8px;padding:16px;margin-bottom:16px">
                    <h3 style="margin:0 0 12px;color:#1565c0">バックアップ設定</h3>
                    <div style="display:flex;flex-direction:column;gap:12px">
                        <label style="display:flex;align-items:center;gap:8px;cursor:pointer">
                            <input type="checkbox" v-model="abSettings.enabled" style="width:16px;height:16px;cursor:pointer">
                            自動バックアップを有効にする
                        </label>
                        <div class="form-row" style="gap:16px;align-items:flex-end">
                            <div class="form-group">
                                <label>スケジュール種別</label>
                                <select v-model="abSettings.schedule_type" style="padding:6px 8px;border:1px solid #ccc;border-radius:4px">
                                    <option value="interval">時間間隔</option>
                                    <option value="daily">日次（時刻指定）</option>
                                </select>
                            </div>
                            <div class="form-group" v-if="abSettings.schedule_type === 'interval'">
                                <label>実行間隔</label>
                                <select v-model.number="abSettings.interval_minutes" style="padding:6px 8px;border:1px solid #ccc;border-radius:4px">
                                    <option :value="60">1時間</option>
                                    <option :value="360">6時間</option>
                                    <option :value="720">12時間</option>
                                </select>
                            </div>
                            <div class="form-group" v-if="abSettings.schedule_type === 'daily'">
                                <label>実行時刻</label>
                                <input type="time" v-model="abSettings.daily_time" style="padding:6px 8px;border:1px solid #ccc;border-radius:4px">
                            </div>
                            <div class="form-group">
                                <label>保持世代数</label>
                                <input type="number" v-model.number="abSettings.retention_count" min="1" max="100" style="width:80px;padding:6px 8px;border:1px solid #ccc;border-radius:4px">
                            </div>
                        </div>
                        <div v-if="abSettings.schedule_type === 'interval'" style="font-size:0.75rem;color:#888;margin-top:-4px">
                            設定を保存した時刻が起点になります
                        </div>
                        <div>
                            <button class="btn btn-primary" @click="saveAbSettings" style="margin-right:8px">設定を保存</button>
                            <button class="btn" @click="triggerBackupNow" style="background:#4caf50;color:#fff">今すぐバックアップ</button>
                            <label style="display:inline-flex;align-items:center;gap:4px;margin-left:12px;cursor:pointer;font-size:0.85rem;color:#555">
                                <input type="checkbox" v-model="abDownload" style="width:14px;height:14px;cursor:pointer"> 同時にダウンロード
                            </label>
                        </div>
                        <div v-if="abMsg" style="font-size:0.85rem;color:#2e7d32;margin-top:4px">{{ abMsg }}</div>
                    </div>
                </div>

                <!-- 履歴 -->
                <div style="background:#fff;border:1px solid #e0e0e0;border-radius:8px;padding:16px">
                    <h3 style="margin:0 0 12px;color:#333">バックアップ履歴 <span style="font-weight:normal;font-size:0.85rem;color:#888">({{ abHistory.length }}件)</span></h3>
                    <div v-if="abHistory.length === 0" style="color:#888;font-size:0.9rem">バックアップはまだありません</div>
                    <div v-else style="overflow-x:auto">
                        <table style="width:100%;border-collapse:collapse;font-size:0.85rem">
                            <thead>
                                <tr style="border-bottom:2px solid #e0e0e0;text-align:left">
                                    <th style="padding:8px">日時</th>
                                    <th style="padding:8px">サイズ</th>
                                    <th style="padding:8px">種別</th>
                                    <th style="padding:8px">状態</th>
                                    <th style="padding:8px">操作</th>
                                </tr>
                            </thead>
                            <tbody>
                                <tr v-for="b in abHistory" :key="b.id" style="border-bottom:1px solid #f0f0f0">
                                    <td style="padding:8px">{{ new Date(b.created_at).toLocaleString('ja-JP') }}</td>
                                    <td style="padding:8px">{{ (b.size_bytes / 1024).toFixed(1) }} KB</td>
                                    <td style="padding:8px">{{ b.trigger === 'auto' ? '自動' : '手動' }}</td>
                                    <td style="padding:8px">
                                        <span v-if="b.status === 'ok'" style="color:#2e7d32">成功</span>
                                        <span v-else style="color:#d32f2f">失敗</span>
                                    </td>
                                    <td style="padding:8px;white-space:nowrap">
                                        <button v-if="b.status === 'ok'" @click="downloadBackupEntry(b.id, b.created_at)" style="background:none;border:none;color:#1a73e8;cursor:pointer;font-size:0.85rem;margin-right:8px">ダウンロード</button>
                                        <button @click="deleteBackupEntry(b.id)" style="background:none;border:none;color:#d32f2f;cursor:pointer;font-size:0.85rem">削除</button>
                                    </td>
                                </tr>
                            </tbody>
                        </table>
                    </div>
                </div>

                <!-- インポート -->
                <div style="background:#fff3e0;border:1px solid #ffe0b2;border-radius:8px;padding:16px;margin-top:16px">
                    <h3 style="margin:0 0 8px;color:#e65100">バックアップインポート</h3>
                    <p style="margin:0 0 4px;font-size:0.9rem;color:#555">バックアップZIPファイルからデータを復元します。</p>
                    <p style="margin:0 0 12px;font-size:0.85rem;color:#d93025;font-weight:600">※ 現在の全データは削除され、バックアップの内容で上書きされます。</p>
                    <div style="display:flex;align-items:center;gap:12px;flex-wrap:wrap">
                        <label style="display:inline-flex;align-items:center;gap:8px;padding:8px 16px;background:#fff;border:2px dashed #e65100;border-radius:8px;cursor:pointer;font-size:0.9rem;color:#e65100;font-weight:600">
                            ZIPファイルを選択
                            <input type="file" accept=".zip" style="display:none" @change="onBackupFileChange">
                        </label>
                        <span v-if="backupFileName" style="font-size:0.9rem;color:#333">{{ backupFileName }}</span>
                    </div>
                    <div v-if="backupFileName" style="margin-top:12px">
                        <button class="btn btn-danger" style="padding:8px 20px" @click="importBackup">インポート実行</button>
                    </div>
                    <div v-if="ioMsg" :style="{marginTop:'12px',padding:'10px 16px',borderRadius:'6px',fontSize:'0.9rem',background: ioMsgError ? '#fce4ec' : '#e8f5e9', color: ioMsgError ? '#c62828' : '#2e7d32'}">
                        {{ ioMsg }}
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
}
</script>
