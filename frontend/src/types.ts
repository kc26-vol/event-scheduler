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
    session: Session | null
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

export interface AssignedStaffEntry {
    assignment_id: number
    staff: Staff
}

export interface ScheduleEntry {
    session: Session
    assigned_staff: AssignedStaffEntry[]
}

export interface StaffScheduleEntry {
    staff: Staff
    assigned_sessions: Session[]
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
