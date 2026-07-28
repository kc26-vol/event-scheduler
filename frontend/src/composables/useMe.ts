// 「自分は誰か」と「今どのスタッフを見ているか」を扱うシングルトン composable。
//
// 認証は全員共通パスワード (app/auth_middleware.py) が担っている。ここで扱う
// スタッフIDは権限ではなく表示上の識別子にすぎず、他人への切り替えを禁じる
// 仕組みでもない。あくまで「自分の担当をすぐ出す」ための既定値。
//
// 重要: 他人を閲覧しても myStaffId は書き換えない。閲覧対象 (viewingStaffId) と
// 本人 (myStaffId) を別の ref に分けているのはそのため。
import { computed, ref, watch } from 'vue'
import { useStore } from '../store'
import type { Staff } from '../types'

const STORAGE_KEY = 'es.myStaffId'
// マネージャーなど、スタッフとして登録されていないが閲覧はしたい人がいる。
// 「自分を選ばない」という選択も記憶して、毎回モーダルに引き止めない。
const SKIP_KEY = 'es.identitySkipped'

// localStorage はプライベートブラウジングや設定次第で例外を投げる。
// 識別子が保存できないだけで画面が落ちるのは割に合わないので握り潰す。
function readStored(): number | null {
    try {
        const raw = localStorage.getItem(STORAGE_KEY)
        if (!raw) return null
        const n = Number(raw)
        return Number.isInteger(n) && n > 0 ? n : null
    } catch {
        return null
    }
}

function writeStored(id: number | null): void {
    try {
        if (id === null) localStorage.removeItem(STORAGE_KEY)
        else localStorage.setItem(STORAGE_KEY, String(id))
    } catch {
        /* 保存できなくてもセッション中は ref が保持する */
    }
}

function readSkipped(): boolean {
    try {
        return localStorage.getItem(SKIP_KEY) === '1'
    } catch {
        return false
    }
}

function writeSkipped(v: boolean): void {
    try {
        if (v) localStorage.setItem(SKIP_KEY, '1')
        else localStorage.removeItem(SKIP_KEY)
    } catch {
        /* 保存できなくてもセッション中は ref が保持する */
    }
}

type MeApi = ReturnType<typeof create>
let _instance: MeApi | null = null

function create() {
    const store = useStore()
    const staffs = store.staffs
    const loaded = store.loaded

    const myStaffId = ref<number | null>(readStored())
    const viewingStaffId = ref<number | null>(myStaffId.value)
    const identitySkipped = ref(readSkipped())

    // 別タブで切り替えたときに追従する
    window.addEventListener('storage', (e) => {
        if (e.key !== STORAGE_KEY) return
        const next = readStored()
        const wasSelf = viewingStaffId.value === myStaffId.value
        myStaffId.value = next
        if (wasSelf) viewingStaffId.value = next
    })

    function findStaff(id: number | null): Staff | null {
        if (id === null) return null
        return staffs.value.find(s => s.id === id) ?? null
    }

    const me = computed(() => findStaff(myStaffId.value))
    const viewing = computed(() => findStaff(viewingStaffId.value))
    const isViewingSelf = computed(() =>
        viewingStaffId.value !== null && viewingStaffId.value === myStaffId.value
    )

    /**
     * 本人選択のモーダルを出すべきか。
     * スタッフ一覧のロードが終わるまでは判断できない (まだ誰も居ないように見える)。
     * 保存済みIDのスタッフが削除されていた場合もここで true になる。
     *
     * マネージャーなどスタッフ登録の無い人は「選ばない」を選べる。その場合は
     * 以後モーダルを出さず、閲覧対象だけを切り替えて使ってもらう。
     */
    const needsIdentity = computed(() => {
        if (!loaded.staffs || identitySkipped.value) return false
        return myStaffId.value === null || me.value === null
    })

    // 保存済みIDのスタッフが消えていたら保存値も掃除する
    watch([() => loaded.staffs, staffs], () => {
        if (!loaded.staffs || myStaffId.value === null) return
        if (findStaff(myStaffId.value) === null) {
            myStaffId.value = null
            viewingStaffId.value = null
            writeStored(null)
        }
    })

    function setMe(id: number | null): void {
        myStaffId.value = id
        viewingStaffId.value = id
        writeStored(id)
        // 一度でも本人を選んだら「選ばない」の記憶は不要
        identitySkipped.value = false
        writeSkipped(false)
    }

    function clearMe(): void {
        myStaffId.value = null
        viewingStaffId.value = null
        writeStored(null)
        identitySkipped.value = false
        writeSkipped(false)
    }

    /** スタッフ登録が無い人向け。本人選択をせずに使い始める。 */
    function skipIdentity(): void {
        identitySkipped.value = true
        writeSkipped(true)
    }

    /** 他人を閲覧する。myStaffId は変えない。 */
    function viewAs(id: number | null): void {
        viewingStaffId.value = id
    }

    function backToMe(): void {
        viewingStaffId.value = myStaffId.value
    }

    /** SearchSelect にそのまま渡せる形 */
    const staffOptions = computed(() =>
        staffs.value.map(s => ({
            value: s.id,
            label: s.name,
            // アカウント名でも引けるようにする (Slack名で覚えている人がいるため)
            keywords: s.slack_name || '',
            sublabel: s.slack_name || '',
            data: s,
        }))
    )

    return {
        myStaffId, viewingStaffId, identitySkipped,
        me, viewing, isViewingSelf, needsIdentity,
        setMe, clearMe, skipIdentity, viewAs, backToMe,
        staffOptions,
    }
}

export function useMe(): MeApi {
    if (!_instance) _instance = create()
    return _instance
}
