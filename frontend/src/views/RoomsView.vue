<template>
        <div class="panel active">
            <h2>部屋管理</h2>
            <div class="form-row">
                <div class="form-group"><label>部屋名 <span class="req">必須</span></label><input v-model="roomForm.name" placeholder="例: ホールA"></div>
                <div class="form-group"><label>定員</label><input v-model.number="roomForm.capacity" type="number" placeholder="100"></div>
                <div class="form-group"><label>階</label><input v-model.number="roomForm.floor" type="number" placeholder="1"></div>
            </div>
            <div style="display:flex;gap:8px;margin-bottom:12px">
                <button class="btn" @click="submitRoom">{{ roomForm.editId ? '更新' : '追加' }}</button>
                <button v-if="roomForm.editId" class="btn btn-danger" @click="cancelEditRoom">キャンセル</button>
            </div>
            <table>
                <thead><tr><th>ID</th><th>部屋名</th><th>階</th><th>定員</th><th></th></tr></thead>
                <tbody>
                    <tr v-for="r in selectableRooms" :key="r.id" :style="roomForm.editId === r.id ? 'background:#fff3e0;outline:2px solid #ff9800' : ''">
                        <td>{{ r.id }}</td><td>{{ r.name }}</td><td>{{ r.floor }}F</td><td>{{ r.capacity }}</td>
                        <td>
                            <button class="btn btn-sm edit-btn" @click="editRoom(r)" style="margin-right:4px" :style="roomForm.editId === r.id ? 'background:#ff9800;color:#fff' : ''">{{ roomForm.editId === r.id ? '編集中' : '編集' }}</button>
                            <button class="del-btn" @click="deleteRoom(r.id)">削除</button>
                        </td>
                    </tr>
                </tbody>
            </table>
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
