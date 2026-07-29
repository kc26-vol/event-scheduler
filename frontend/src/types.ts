// API レスポンスの型定義 (app/schemas.py の Response モデルに対応)

export interface SessionGroup {
    id: number
    label: string
    date: string
    order: number
    color: string
}

export interface Category {
    id: number
    key: string
    label: string
    color: string
    order: number
}

export interface VenueMap {
    id: number
    title: string
    image: string
    order: number
}

export interface Room {
    id: number
    name: string
    capacity: number
    floor: number
}

export interface LTTalk {
    id: number
    session_id: number
    title: string
    speaker: string
    speaker_kana: string
    speaker_org: string
    speaker_title: string
    speaker_photo: string
    start_time: string
    end_time: string
    order: number
    is_representative: number
}

export interface Session {
    id: number
    title: string
    description: string
    notes: string
    speaker: string
    speaker_kana: string
    speaker_photo: string
    speaker_org: string
    speaker_title: string
    speaker_profile: string
    start_time: string
    end_time: string
    room_id: number
    required_staff: number
    category: string
    english_required: boolean
    group_id: number | null
    room: Room | null
    lt_talks: LTTalk[]
}

export interface StaffSkill {
    id: number
    skill: string
}

export interface StaffPreferredSession {
    id: number
    session_id: number
    priority: number
    /* 表示に使うのは開始時刻とタイトルだけなので、API 側も絞ってある。
       宣言の直後に SessionBrief を定義しているため型は後方参照になる。 */
    session: SessionBrief | null
}

export interface StaffAvailability {
    id: number
    start_time: string
    end_time: string
}

export interface Staff {
    id: number
    name: string
    slack_name: string
    photo: string
    english_ok: boolean
    role: string[]
    max_hours: number
    experience_count: number
    emergency_contact: string
    skills: StaffSkill[]
    preferred_sessions: StaffPreferredSession[]
    availabilities: StaffAvailability[]
}

export interface Assignment {
    id: number
    session_id: number
    staff_id: number
    role: string
    session: Session | null
    staff: Staff | null
}

/* 一覧に埋め込まれるスタッフ / セッションは、本体より項目が少ない。
 *
 * 以前は完全な Staff / Session をそのまま埋め込んでいたが、希望セッションに
 * 各セッションの本文が丸ごと入るため、/api/assignments/schedule が 11MB に
 * なっていた (実データ)。画面が読む項目だけを返すよう API 側を絞ってある
 * (app/schemas.py の StaffBrief / SessionSummary 等)。
 *
 * ここを Staff / Session のままにしておくと、型は通るのに実行時 undefined、
 * という形で事故る。API の形に合わせて別の型として書いておく。 */

/** 配置一覧のチップ用。希望セッション・活動可能時間は入っていない。 */
export type StaffBrief = Omit<Staff, 'preferred_sessions' | 'availabilities'>

/** スタッフ別担当表用。活動可能時間は画面に出るので入っている。 */
export type StaffWithAvailability = StaffBrief & {
    availabilities: StaffAvailability[]
}

/** 埋め込み用の軽いセッション。本文・登壇者プロフィール・LT一覧は入っていない。 */
export type SessionBrief = Pick<
    Session,
    'id' | 'title' | 'start_time' | 'end_time' | 'room_id' | 'category'
>

/** 担当カードの描画に必要な項目まで含む。本文系は入っていない。 */
export type SessionSummary = SessionBrief & Pick<
    Session,
    'speaker' | 'speaker_org' | 'speaker_title'
    | 'required_staff' | 'english_required' | 'group_id' | 'room'
>

export interface AssignedStaffEntry {
    assignment_id: number
    staff: StaffBrief
}

export interface ScheduleEntry {
    session: Session
    assigned_staff: AssignedStaffEntry[]
}

export interface StaffScheduleEntry {
    staff: StaffWithAvailability
    assigned_sessions: SessionSummary[]
}

// 設定画面などで使う補助型
export interface SessionCatOption {
    key: string
    label: string
}

export interface CustomRole {
    key: string
    label: string
    order?: number
}

export interface AutoBackupEntry {
    id: number
    filename: string
    created_at: string
    size_bytes: number
    kind?: string
    [key: string]: any
}

export interface PublishSnapshot {
    id: number
    published_at: string
    is_active?: boolean | number
    note?: string
    [key: string]: any
}
