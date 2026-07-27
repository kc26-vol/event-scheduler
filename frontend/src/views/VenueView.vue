<template>
        <div class="panel active">
            <h2>会場</h2>
            <p v-if="!venueMaps.length" style="color:#888;font-size:0.9rem">会場地図が登録されていません。「会場地図」から追加してください。</p>
            <div v-for="m in venueMaps" :key="'vv-'+m.id" style="margin-bottom:24px">
                <h3 style="margin-bottom:8px">{{ m.title }}</h3>
                <img :src="m.image" style="max-width:100%;max-height:500px;border-radius:6px;border:1px solid #ddd;cursor:pointer" @click="mapModal=m">
            </div>
            <!-- 地図拡大モーダル（共有） -->
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
