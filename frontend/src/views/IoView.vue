<template>
        <div class="panel active">
            <h2>エクスポート</h2>

            <!-- Excelエクスポート -->
            <div style="background:#e8f0fe;border:1px solid #a8c7fa;border-radius:8px;padding:20px;margin-bottom:20px">
                <h3 style="margin:0 0 8px;color:#1a73e8">Excelエクスポート</h3>
                <p style="margin:0 0 12px;font-size:0.9rem;color:#555">全データをExcelファイルとしてエクスポートします。全体スケジュールマトリクス、セッション管理、スタッフ管理、受付案内、懇親会担当の各シートが含まれます。</p>
                <button class="btn" style="background:#1a73e8;font-size:1rem;padding:10px 24px" @click="exportExcel">Excelファイルをダウンロード</button>
            </div>

            <!-- connpass共通設定 -->
            <div style="background:#f5f5f5;border:1px solid #e0e0e0;border-radius:8px;padding:16px 20px;margin-bottom:20px">
                <h3 style="margin:0 0 8px;color:#333">connpass出力設定</h3>
                <div class="form-group" style="margin:0">
                    <label style="font-size:0.85rem">画像ベースURL <span style="color:#888;font-weight:normal">（登壇者写真のURL生成に使用）</span></label>
                    <input v-model="connpassBaseUrl" placeholder="例: https://example.com" style="width:400px">
                </div>
            </div>

            <!-- connpass タイムライン -->
            <div style="background:#fce4ec;border:1px solid #f48fb1;border-radius:8px;padding:20px;margin-bottom:20px">
                <h3 style="margin:0 0 8px;color:#c2185b">connpass タイムライン</h3>
                <p style="margin:0 0 12px;font-size:0.9rem;color:#555">connpassのイベントページに貼り付け可能なMarkdown形式のタイムテーブルを生成します。</p>
                <button class="btn" style="background:#c2185b;font-size:1rem;padding:10px 24px" @click="generateConnpassTimeline">タイムラインを生成</button>
                <div v-if="connpassTimeline" style="margin-top:12px">
                    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px">
                        <span style="font-size:0.85rem;color:#666">生成結果（コピーしてconnpassに貼り付け）</span>
                        <button class="btn btn-sm" style="background:#c2185b" @click="copyToClipboard(connpassTimeline)">コピー</button>
                    </div>
                    <textarea readonly :value="connpassTimeline" style="width:100%;height:300px;font-family:monospace;font-size:0.85rem;padding:12px;border:1px solid #ccc;border-radius:6px;background:#fff;resize:vertical"></textarea>
                </div>
            </div>

            <!-- connpass 登壇者テンプレート -->
            <div style="background:#e8eaf6;border:1px solid #9fa8da;border-radius:8px;padding:20px;margin-bottom:20px">
                <h3 style="margin:0 0 8px;color:#283593">connpass 登壇者テンプレート</h3>
                <p style="margin:0 0 12px;font-size:0.9rem;color:#555">connpassのイベントページ用の登壇者一覧をMarkdown形式で生成します。</p>
                <button class="btn" style="background:#283593;font-size:1rem;padding:10px 24px" @click="generateSpeakerTemplate">登壇者テンプレートを生成</button>
                <div v-if="speakerTemplate" style="margin-top:12px">
                    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px">
                        <span style="font-size:0.85rem;color:#666">生成結果（コピーしてconnpassに貼り付け）</span>
                        <button class="btn btn-sm" style="background:#283593" @click="copyToClipboard(speakerTemplate)">コピー</button>
                    </div>
                    <textarea readonly :value="speakerTemplate" style="width:100%;height:300px;font-family:monospace;font-size:0.85rem;padding:12px;border:1px solid #ccc;border-radius:6px;background:#fff;resize:vertical"></textarea>
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
