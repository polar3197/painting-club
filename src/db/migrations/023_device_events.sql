-- 023 — device/perf telemetry (#6)
-- Paper-trail only: brand-new table, built by create_all at startup. Kept for
-- the migration record. Stream B owns 022–024.

CREATE TABLE IF NOT EXISTS device_event (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    member_id    UUID NOT NULL REFERENCES member(id) ON DELETE CASCADE,
    kind         VARCHAR(30) NOT NULL,         -- 'crash' | 'memory_warning' | 'perf'
    platform     VARCHAR(20),                  -- 'ios' | 'android'
    app_version  VARCHAR(40),
    os_version   VARCHAR(40),
    device_model VARCHAR(80),
    detail       TEXT,
    occurred_at  TIMESTAMP NOT NULL DEFAULT now(),
    created_at   TIMESTAMP NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ix_device_event_member_id ON device_event (member_id);
CREATE INDEX IF NOT EXISTS ix_device_event_kind ON device_event (kind);
CREATE INDEX IF NOT EXISTS ix_device_event_occurred_at ON device_event (occurred_at);
