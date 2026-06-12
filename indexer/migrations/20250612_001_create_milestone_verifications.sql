CREATE TABLE IF NOT EXISTS milestone_verifications (
    grant_id INTEGER NOT NULL,
    milestone_id INTEGER NOT NULL,
    evidence_uri TEXT NOT NULL,
    submitted_at TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'Pending',
    result_reason TEXT,
    verified_at TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    PRIMARY KEY (grant_id, milestone_id)
);

CREATE INDEX IF NOT EXISTS idx_verifications_status
    ON milestone_verifications (status);
