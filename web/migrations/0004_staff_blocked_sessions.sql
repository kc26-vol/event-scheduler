CREATE TABLE staff_blocked_sessions (
    staff_id   INTEGER NOT NULL REFERENCES staffs(id) ON DELETE CASCADE,
    session_id INTEGER NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
    PRIMARY KEY (staff_id, session_id)
);
CREATE INDEX blocked_sessions_by_session ON staff_blocked_sessions(session_id);

-- Enforce both directions, including during bulk changes and backup restores.
CREATE TRIGGER assignment_respects_block BEFORE INSERT ON assignments
WHEN EXISTS (SELECT 1 FROM staff_blocked_sessions WHERE staff_id=NEW.staff_id AND session_id=NEW.session_id)
BEGIN
    SELECT RAISE(ABORT, 'assignment blocked by staff restriction');
END;
CREATE TRIGGER changed_assignment_respects_block BEFORE UPDATE OF staff_id, session_id ON assignments
WHEN EXISTS (SELECT 1 FROM staff_blocked_sessions WHERE staff_id=NEW.staff_id AND session_id=NEW.session_id)
BEGIN
    SELECT RAISE(ABORT, 'assignment blocked by staff restriction');
END;
CREATE TRIGGER block_respects_assignments BEFORE INSERT ON staff_blocked_sessions
WHEN EXISTS (SELECT 1 FROM assignments WHERE staff_id=NEW.staff_id AND session_id=NEW.session_id)
BEGIN
    SELECT RAISE(ABORT, 'assignment blocked by staff restriction');
END;
