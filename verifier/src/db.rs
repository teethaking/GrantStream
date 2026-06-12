use anyhow::Result;
use grantstream_shared::VerificationResult;
use sqlx::SqlitePool;

pub async fn init_pool(database_url: &str) -> Result<SqlitePool> {
    let pool = SqlitePool::connect(database_url).await?;
    Ok(pool)
}

pub async fn upsert_verification(
    pool: &SqlitePool,
    grant_id: u64,
    milestone_id: u64,
    result: &VerificationResult,
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
