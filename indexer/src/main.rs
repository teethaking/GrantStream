use anyhow::{Context, Result};
use ethers::{
    prelude::*,
    providers::{Provider, Ws},
};
use grantstream_shared::VerificationJob;
use sqlx::SqlitePool;
use std::sync::Arc;
use tokio::sync::mpsc;

mod db;

ethers::contract::abigen!(
    GrantStreamEscrow,
    r#"[
        event MilestoneSubmitted(uint256 indexed grantId, uint256 indexed milestoneId, string evidenceURI)
    ]"#
);

#[tokio::main]
async fn main() -> Result<()> {
    tracing_subscriber::fmt::init();

    let config = load_config()?;

    let db_pool = db::init_pool(&config.database_url)
        .await
        .context("failed to init db pool")?;

    sqlx::migrate!("./migrations")
        .run(&db_pool)
        .await
        .context("failed to run migrations")?;

    let (job_tx, mut job_rx) = mpsc::channel::<VerificationJob>(100);

    let verifier_db_pool = db_pool.clone();
    tokio::spawn(async move {
        let verifier_url = std::env::var("VERIFIER_URL")
            .unwrap_or_else(|_| "http://127.0.0.1:8081".to_string());

        loop {
            match job_rx.recv().await {
                Some(job) => {
                    if let Err(e) = submit_verification(&verifier_url, &job).await {
                        tracing::error!(?e, "verifier submit failed for job {:?}", job);
                    }
                }
                None => {
                    tracing::info!("job channel closed");
                    break;
                }
            }
        }
    });

    tracing::info!("Connecting to provider {}", config.rpc_url);
    let ws = Ws::connect(&config.rpc_url).await?;
    let provider = Provider::new(ws);

    let contract_address: Address = config.contract_address.parse()?;
    let contract = GrantStreamEscrow::new(contract_address, Arc::new(provider));

    let event_filter = contract.events::<MilestoneSubmittedFilter>();
    let mut stream = event_filter.stream().await?;
    tracing::info!("Listening for MilestoneSubmitted events...");

    while let Some(Ok(event)) = stream.next().await {
        let data = event.data;
        let parsed = data;

        let job = VerificationJob {
            grant_id: parsed.grant_id.as_u64(),
            milestone_id: parsed.milestone_id.as_u64(),
            evidence_uri: parsed.evidence_uri,
            submitted_at: chrono::Utc::now().naive_utc(),
        };

        tracing::info!(?job, "enqueuing verification job");

        if let Err(e) = db::insert_pending_job(&db_pool, &job).await {
            tracing::error!(?e, "failed to insert pending job");
            continue;
        }

        if let Err(e) = job_tx.send(job).await {
            tracing::error!(?e, "job channel send failed");
        }
    }

    Ok(())
}

async fn submit_verification(
    verifier_url: &str,
    job: &VerificationJob,
) -> Result<()> {
    let client = reqwest::Client::new();
    let res = client
        .post(format!("{}/verify", verifier_url))
        .json(job)
        .send()
        .await?;

    let _ = res.error_for_status()?;
    Ok(())
}

#[derive(Debug, Clone)]
pub struct Config {
    pub rpc_url: String,
    pub contract_address: String,
    pub database_url: String,
}

impl Config {
    pub fn from_env() -> Result<Self> {
        Ok(Self {
            rpc_url: std::env::var("RPC_URL")?,
            contract_address: std::env::var("CONTRACT_ADDRESS")?,
            database_url: std::env::var("DATABASE_URL").unwrap_or_else(|_| "sqlite:indexer.db".into()),
        })
    }
}

fn load_config() -> Result<Config> {
    let _ = dotenvy::dotenv();
    Config::from_env()
}
