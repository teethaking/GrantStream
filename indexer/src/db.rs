use anyhow::Result;
use grantstream_shared::VerificationJob;
use sqlx::SqlitePool;

pub async fn init_pool(database_url: &str) -> Result<SqlitePool> {
    let pool = SqlitePool::connect(database_url).await?;
    Ok(pool)
}

pub async fn insert_pending_job(pool: &SqlitePool, job: &VerificationJob) -> Result<()> {
    sqlx::query(
        r#"
        INSERT INTO milestone_verifications (grant_id, milestone_id, evidence_uri, submitted_at, status)
        VALUES (?, ?, ?, ?, 'Pending')
        ON CONFLICT(grant_id, milestone_id) DO UPDATE SET
            evidence_uri = excluded.evidence_uri,
            submitted_at = excluded.submitted_at,
            status = 'Pending'
        "#,
    )
    .bind(job.grant_id as i64)
    .bind(job.milestone_id as i64)
    .bind(&job.evidence_uri)
    .bind(job.submitted_at.to_string())
    .execute(pool)
    .await?;

    Ok(())
}

pub async fn upsert_verification(
    pool: &SqlitePool,
    grant_id: u64,
    milestone_id: u64,
    result: &grantstream_shared::VerificationResult,
) -> Result<()> {
    sqlx::query(
        r#"
        UPDATE milestone_verifications
        SET status = ?, result_reason = ?, verified_at = ?
        WHERE grant_id = ? AND milestone_id = ?
        "#,
    )
    .bind(result.status_label())
    .bind(result.reason())
    .bind(result.checked_at().to_string())
    .bind(grant_id as i64)
    .bind(milestone_id as i64)
    .execute(pool)
    .await?;

    Ok(())
}
