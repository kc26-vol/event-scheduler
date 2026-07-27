<template>
        <template v-for="cat in categories" :key="'catm-'+cat.key">
        <div v-if="cat.key === ckey" class="panel active">
            <h2>{{ cat.label }}管理</h2>

            <!-- 日程タブ -->
            <div v-if="catKeyDates(cat.key).length > 0" class="tab-bar">
                <button class="tab-btn"
                    :style="catGroupTabs[cat.key] === 0 ? {background:'#333', color:'#fff'} : {background:'#f5f5f5', color:'#666'}"
                    @click="catGroupTabs[cat.key] = 0">
                    全日程
                </button>
                <button v-for="date in catKeyDates(cat.key)" :key="'catm-tab-'+cat.key+'-'+date"
                    class="tab-btn"
                    :style="catGroupTabs[cat.key] === date ? {background: cat.color || '#1a73e8', color:'#fff'} : {background:'#f5f5f5', color:'#666'}"
                    @click="catGroupTabs[cat.key] = date">
                    {{ date }}
                </button>
            </div>

            <div style="margin-bottom:20px;border-radius:8px;padding:16px" :style="{ border: '1px solid ' + cat.color + '40', background: cat.color + '10' }">
                <h3 style="margin:0 0 12px" :style="{ color: cat.color }">{{ categoryForms[cat.key]?.editId ? cat.label + '編集' : cat.label + '追加' }}</h3>
                <div class="form-row">
                    <div class="form-group"><label>{{ cat.label }}名 <span class="req">必須</span></label><input v-model="categoryForms[cat.key].title" placeholder="名前を入力"></div>
                    <div class="form-group"><label>必要スタッフ数</label><input v-model.number="categoryForms[cat.key].required_staff" type="number" min="1" placeholder="2"></div>
                </div>
                <div class="form-row">
                    <div class="form-group"><label>開始時刻 <span class="req">必須</span></label><input v-model="categoryForms[cat.key].start_time" type="datetime-local" step="300" @change="autoSetEndTime(categoryForms[cat.key])"></div>
                    <div class="form-group"><label>終了時刻 <span class="req">必須</span></label><input v-model="categoryForms[cat.key].end_time" type="datetime-local" step="300"></div>
                    <div class="form-group"><label>場所 <span class="req">必須</span></label>
                        <select v-model.number="categoryForms[cat.key].room_id">
                            <option v-for="r in selectableRooms" :key="r.id" :value="r.id">{{ r.name }}</option>
                        </select>
                    </div>
                </div>
                <div class="form-row">
                    <div class="form-group"><label>英語対応</label>
                        <label style="margin:0;display:flex;align-items:center;gap:4px;padding-top:4px"><input type="checkbox" v-model="categoryForms[cat.key].english_required" style="width:16px;height:16px;cursor:pointer"> 必要</label>
                    </div>
                </div>
                <div class="form-group"><label>備考</label><textarea v-model="categoryForms[cat.key].notes" rows="2"></textarea></div>
                <div style="display:flex;gap:8px">
                    <button class="btn" :style="{ background: cat.color }" @click="submitCategory(cat.key)">{{ categoryForms[cat.key]?.editId ? '更新' : '追加' }}</button>
                    <button v-if="categoryForms[cat.key]?.editId" class="btn btn-danger" @click="cancelEditCategory(cat.key)">キャンセル</button>
                </div>
            </div>
            <!-- 配置表 -->
            <template v-if="catGroupFiltered(cat.key).length && catGroupTabs[cat.key] !== 0">
                <h3 style="margin-top:0">配置表</h3>
                <tl-grid
                    :grid-style="catGridStyle(cat.key)" :rooms="catGridRooms(cat.key)" :labels="catGridLabels(cat.key)"
                    :entries="catGroupFiltered(cat.key)" :color="cat.color || '#1a73e8'"
                    :entry-style="e => catDragSessionStyle(cat.key, e)"
                    :fmt-short="fmtShort"
                    @dragstart="(ev, entry) => onCatDragStart(ev, cat.key, entry, true)"
                    @select="(id, ev, entry) => showGridMenu(ev, entry, 'cat', cat.key)">
                </tl-grid>
            </template>

            <h3>登録済み一覧</h3>
            <p v-if="!catGroupFiltered(cat.key).length" style="color:#666">{{ cat.label }}がまだ登録されていません。</p>
            <table v-else>
                <thead><tr><th>{{ cat.label }}名</th><th>時間</th><th>場所</th><th>英語</th><th>必要人数</th><th>操作</th></tr></thead>
                <tbody>
                    <tr v-for="e in catGroupFiltered(cat.key)" :key="'catm-'+cat.key+'-'+e.session.id" :style="categoryForms[cat.key]?.editId === e.session.id ? 'background:#fff3e0;outline:2px solid #ff9800' : ''">
                        <td><strong>{{ e.session.title }}</strong></td>
                        <td style="white-space:nowrap">{{ fmt(e.session.start_time) }} - {{ fmt(e.session.end_time) }}</td>
                        <td>{{ e.session.room ? e.session.room.name : '' }}</td>
                        <td><span v-if="e.session.english_required" class="badge" style="background:#e0f2f1;color:#00695c">EN</span></td>
                        <td>{{ e.session.required_staff }}</td>
                        <td>
                            <button class="btn btn-sm edit-btn" @click="editCategory(cat.key, e.session)" style="margin-right:4px" :style="categoryForms[cat.key]?.editId === e.session.id ? 'background:#ff9800;color:#fff' : ''">{{ categoryForms[cat.key]?.editId === e.session.id ? '編集中' : '編集' }}</button>
                            <button class="del-btn" @click="deleteCategory(cat.key, e.session.id)">削除</button>
                        </td>
                    </tr>
                </tbody>
            </table>
        </div>
        </template>
</template>

<script>
import { computed } from 'vue'
import { useRoute } from 'vue-router'
import { useStore } from '../store'

export default {
    setup() {
        const route = useRoute()
        return { ...useStore(), ckey: computed(() => route.params.key) }
    },
}
</script>
