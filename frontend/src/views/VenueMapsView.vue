<template>
        <div class="panel active">
            <h2>会場地図</h2>
            <div class="form-row">
                <div class="form-group"><label>タイトル <span class="req">必須</span></label><input v-model="venueMapForm.title" placeholder="例: 1F フロアマップ"></div>
                <div class="form-group"><label>表示順</label><input v-model.number="venueMapForm.order" type="number" placeholder="0"></div>
            </div>
            <div class="form-row">
                <div class="form-group">
                    <label>地図画像</label>
                    <input type="file" ref="venueMapInput" accept="image/jpeg,image/png,image/gif,image/webp" @change="onVenueMapChange" style="display:none">
                    <button type="button" class="btn" style="background:#607d8b;font-size:0.85rem;padding:6px 14px" @click="$event.target.parentElement.querySelector('input[type=file]').click()">ファイルを選択</button>
                    <span tabindex="0" @paste.prevent="onPhotoPaste($event)" style="display:inline-block;margin-left:8px;padding:6px 10px;border:1px dashed #90a4ae;border-radius:4px;font-size:0.8rem;color:#607d8b;cursor:text">クリックしてCtrl+Vで貼り付け</span>
                    <div style="margin-top:8px">
                        <img v-if="venueMapPreview" :src="venueMapPreview" style="max-width:200px;max-height:120px;border-radius:4px;border:1px solid #ccc">
                        <div v-if="venueMapForm.editId && venueMapForm.currentImage && !venueMapPreview" style="font-size:0.8rem;color:#666">
                            <img :src="venueMapForm.currentImage" style="max-width:200px;max-height:120px;border-radius:4px;border:1px solid #ccc">
                            <br>新しい画像を選択しない場合、現在の地図が維持されます
                        </div>
                    </div>
                </div>
            </div>
            <div style="display:flex;gap:8px;margin-bottom:12px">
                <button class="btn" @click="submitVenueMap">{{ venueMapForm.editId ? '更新' : '追加' }}</button>
                <button v-if="venueMapForm.editId" class="btn btn-danger" @click="cancelEditVenueMap">キャンセル</button>
            </div>

            <div v-if="!venueMaps.length" style="color:#888;font-size:0.9rem">地図が登録されていません。</div>
            <div v-for="m in venueMaps" :key="m.id" style="border:1px solid #e0e0e0;border-radius:8px;padding:12px;margin-bottom:12px" :style="venueMapForm.editId === m.id ? 'background:#fff3e0;outline:2px solid #ff9800' : ''">
                <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
                    <h3 style="margin:0">{{ m.title }}</h3>
                    <div>
                        <button class="btn btn-sm edit-btn" @click="editVenueMap(m)" style="margin-right:4px" :style="venueMapForm.editId === m.id ? 'background:#ff9800;color:#fff' : ''">{{ venueMapForm.editId === m.id ? '編集中' : '編集' }}</button>
                        <button class="del-btn" @click="deleteVenueMap(m.id)">削除</button>
                    </div>
                </div>
                <img :src="m.image" style="max-width:100%;max-height:400px;border-radius:4px;border:1px solid #ddd;cursor:pointer" @click="mapModal=m">
            </div>

            <!-- 地図拡大モーダル -->
            <div v-if="mapModal" class="modal-overlay" @click.self="mapModal=null">
                <div style="background:#fff;border-radius:8px;padding:20px;max-width:90vw;max-height:90vh;overflow:auto;position:relative">
                    <h3 style="margin-bottom:12px">{{ mapModal.title }}</h3>
                    <img :src="mapModal.image" style="max-width:80vw;max-height:70vh;border-radius:4px">
                    <br><button class="btn btn-sm" style="margin-top:12px" @click="mapModal=null">閉じる</button>
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
