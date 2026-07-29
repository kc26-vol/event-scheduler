from datetime import datetime
from pydantic import BaseModel, field_validator, model_validator


# --- SessionGroup ---
class SessionGroupCreate(BaseModel):
    label: str
    date: str = ""
    order: int = 0
    color: str = "#1a73e8"


class SessionGroupResponse(BaseModel):
    id: int
    label: str
    date: str
    order: int
    color: str

    model_config = {"from_attributes": True}


# --- Category ---
class CategoryCreate(BaseModel):
    key: str | None = None
    label: str
    color: str = "#607d8b"
    order: int = 0


class CategoryResponse(BaseModel):
    id: int
    key: str
    label: str
    color: str
    order: int

    model_config = {"from_attributes": True}


# --- VenueMap ---
class VenueMapResponse(BaseModel):
    id: int
    title: str
    image: str
    order: int

    model_config = {"from_attributes": True}


# --- Room ---
class RoomCreate(BaseModel):
    name: str
    capacity: int
    floor: int = 1


class RoomResponse(BaseModel):
    id: int
    name: str
    capacity: int
    floor: int

    model_config = {"from_attributes": True}


# --- Session ---
class SessionCreate(BaseModel):
    title: str
    description: str = ""
    notes: str = ""
    speaker: str
    speaker_kana: str = ""
    speaker_photo: str = ""
    speaker_org: str = ""
    speaker_title: str = ""
    speaker_profile: str = ""
    start_time: datetime
    end_time: datetime
    room_id: int
    required_staff: int = 0
    category: str = "general"
    english_required: bool = False
    group_id: int | None = None


class SessionResponse(BaseModel):
    id: int
    title: str
    description: str
    notes: str
    speaker: str
    speaker_kana: str
    speaker_photo: str
    speaker_org: str
    speaker_title: str
    speaker_profile: str
    start_time: datetime
    end_time: datetime
    room_id: int
    required_staff: int
    category: str
    english_required: bool
    group_id: int | None = None
    room: RoomResponse | None = None
    lt_talks: list["LTTalkResponse"] = []

    model_config = {"from_attributes": True}


# --- LT Talk ---
class LTTalkCreate(BaseModel):
    title: str
    speaker: str
    speaker_kana: str = ""
    speaker_org: str = ""
    speaker_title: str = ""
    speaker_photo: str = ""
    start_time: str = ""
    end_time: str = ""
    order: int = 0
    is_representative: int = 0


class LTTalkResponse(BaseModel):
    id: int
    session_id: int
    title: str
    speaker: str
    speaker_kana: str
    speaker_org: str
    speaker_title: str
    speaker_photo: str
    start_time: str
    end_time: str
    order: int
    is_representative: int = 0

    model_config = {"from_attributes": True}

    @field_validator("is_representative", mode="before")
    @classmethod
    def _default_is_representative(cls, v):
        return v if v is not None else 0


# --- Staff ---
class StaffSkillResponse(BaseModel):
    id: int
    skill: str

    model_config = {"from_attributes": True}


class StaffPreferredSessionCreate(BaseModel):
    session_id: int
    priority: int = 1


class SessionBrief(BaseModel):
    """他のレスポンスに埋め込むための軽いセッション。

    description / notes / 登壇者プロフィール / lt_talks を持たない。これらは
    1件あたり数KBあり、埋め込み側では一度も読まれないのに件数分だけ重複する。
    """

    id: int
    title: str
    start_time: datetime
    end_time: datetime
    room_id: int
    category: str

    model_config = {"from_attributes": True}


class SessionSummary(SessionBrief):
    """担当一覧に埋め込むセッション。本文系は落とすが、カードの描画に必要な
    部屋・必要人数・登壇者名までは残す。"""

    speaker: str = ""
    speaker_org: str = ""
    speaker_title: str = ""
    required_staff: int = 0
    english_required: bool = False
    group_id: int | None = None
    room: RoomResponse | None = None

    model_config = {"from_attributes": True}


class StaffPreferredSessionResponse(BaseModel):
    id: int
    session_id: int
    priority: int
    # 画面が読むのは開始時刻とタイトルだけ (StaffsView の希望セッション表示)。
    session: SessionBrief | None = None

    model_config = {"from_attributes": True}


class StaffAvailabilityCreate(BaseModel):
    start_time: datetime
    end_time: datetime

    @model_validator(mode="after")
    def validate_time_range(self):
        if self.start_time >= self.end_time:
            raise ValueError("start_time must be before end_time")
        return self


class StaffAvailabilityResponse(BaseModel):
    id: int
    start_time: datetime
    end_time: datetime

    model_config = {"from_attributes": True}


class StaffCreate(BaseModel):
    name: str
    slack_name: str = ""
    english_ok: bool = False
    role: list[str] = []
    max_hours: int = 8
    experience_count: int = 0
    emergency_contact: str = ""
    skills: list[str] = []
    preferred_sessions: list[StaffPreferredSessionCreate] = []
    availabilities: list[StaffAvailabilityCreate] = []


class StaffUpdate(BaseModel):
    name: str
    slack_name: str = ""
    english_ok: bool = False
    role: list[str] = []
    max_hours: int = 8
    experience_count: int = 0
    emergency_contact: str = ""
    skills: list[str] = []


class StaffResponse(BaseModel):
    id: int
    name: str
    slack_name: str
    photo: str
    english_ok: bool
    role: list[str]
    max_hours: int
    experience_count: int
    emergency_contact: str
    skills: list[StaffSkillResponse] = []
    preferred_sessions: list[StaffPreferredSessionResponse] = []
    availabilities: list[StaffAvailabilityResponse] = []

    model_config = {"from_attributes": True}

    @field_validator("emergency_contact", mode="before")
    @classmethod
    def _default_emergency_contact(cls, v):
        return v or ""

    @field_validator("role", mode="before")
    @classmethod
    def _split_role(cls, v):
        if isinstance(v, str):
            return [r for r in v.split(",") if r]
        return v


class StaffBrief(BaseModel):
    """配置一覧に埋め込むための軽いスタッフ。

    希望セッション (preferred_sessions) と活動可能時間 (availabilities) を
    持たない。特に preferred_sessions は 1人あたり約 15KB あり、
    /api/assignments/schedule では配置件数ぶん (実データで 940 回) 重複して
    レスポンス全体の 96% を占めていた。画面側がここから読むのは
    id / name / photo だけ。

    ORM 属性から作れないよう model_config は付けない — 明示的に
    from_staff() を通すことで、遅延ロードが走る経路を残さない。
    """

    id: int
    name: str
    slack_name: str
    photo: str
    english_ok: bool
    role: list[str]
    max_hours: int
    experience_count: int
    emergency_contact: str
    skills: list[StaffSkillResponse] = []

    @classmethod
    def from_staff(cls, s) -> "StaffBrief":
        role = s.role or ""
        return cls(
            id=s.id,
            name=s.name,
            slack_name=s.slack_name or "",
            photo=s.photo or "",
            english_ok=bool(s.english_ok),
            role=[r for r in role.split(",") if r] if isinstance(role, str) else role,
            max_hours=s.max_hours,
            experience_count=s.experience_count,
            emergency_contact=s.emergency_contact or "",
            skills=[StaffSkillResponse.model_validate(k) for k in s.skills],
        )


# --- Assignment ---
class AssignmentResponse(BaseModel):
    id: int
    session_id: int
    staff_id: int
    role: str
    session: SessionResponse | None = None
    staff: StaffResponse | None = None

    model_config = {"from_attributes": True}


class AssignmentCreate(BaseModel):
    session_id: int
    staff_id: int
    role: str = "support"


# --- Schedule output ---
class AssignedStaffEntry(BaseModel):
    assignment_id: int
    staff: StaffBrief


class ScheduleEntry(BaseModel):
    session: SessionResponse
    assigned_staff: list[AssignedStaffEntry]


class ScheduleResponse(BaseModel):
    schedule: list[ScheduleEntry]


class StaffWithAvailability(StaffBrief):
    """スタッフ別担当表で使う。活動可能時間は画面に出るので残す。

    希望セッション (preferred_sessions) はスタッフ編集フォームでしか読まれず、
    そちらは /api/staffs/ を見ているので、ここには要らない。
    """

    availabilities: list[StaffAvailabilityResponse] = []

    @classmethod
    def from_staff(cls, s) -> "StaffWithAvailability":
        base = StaffBrief.from_staff(s)
        return cls(
            **base.model_dump(),
            availabilities=[StaffAvailabilityResponse.model_validate(a) for a in s.availabilities],
        )


class StaffScheduleEntry(BaseModel):
    staff: StaffWithAvailability
    assigned_sessions: list[SessionSummary]


class StaffScheduleResponse(BaseModel):
    staff_assignments: list[StaffScheduleEntry]
