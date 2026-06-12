use anyhow::{Context, Result};
use clap::Args;
use colored::Colorize;
use ethers::types::U256;

use crate::{
    config::Config,
    contract::{build_signing_client, parse_address, GrantStreamEscrow},
};

#[derive(Args, Debug)]
pub struct SubmitMilestoneArgs {
    /// Grant ID
    #[arg(long, value_name = "ID")]
    pub grant_id: u64,

    /// Zero-based milestone index
    #[arg(long, value_name = "INDEX")]
    pub milestone_id: u64,

    /// IPFS evidence URI (e.g. ipfs://Qm...)
    #[arg(long, value_name = "URI")]
    pub evidence_uri: String,
}

pub async fn run(cfg: Config, args: SubmitMilestoneArgs) -> Result<()> {
    let client = build_signing_client(&cfg.rpc_url, &cfg.private_key).await?;
    let contract_address = parse_address(&cfg.contract_address)?;
    let escrow = GrantStreamEscrow::new(contract_address, client.clone());

    if args.evidence_uri.is_empty() {
        anyhow::bail!("--evidence-uri cannot be empty");
    }

    println!("{}", "── Submit Milestone ──────────────────────────".cyan().bold());
    println!("  Grant ID     : {}", args.grant_id.to_string().yellow());
    println!("  Milestone ID : {}", args.milestone_id.to_string().yellow());
    println!("  Evidence URI : {}", args.evidence_uri.yellow());

    println!("\n{} Sending submitMilestone transaction…", "→".blue());

    let receipt = escrow
        .submit_milestone(
            U256::from(args.grant_id),
            U256::from(args.milestone_id),
            args.evidence_uri.clone(),
        )
        .send()
        .await
        .context("submitMilestone transaction failed")?
        .await
        .context("submitMilestone receipt not received")?
        .context("submitMilestone returned no receipt")?;

    println!(
        "{} Milestone {} submitted for grant {}  (tx: {})",
        "✓".green().bold(),
        args.milestone_id.to_string().cyan(),
        args.grant_id.to_string().cyan(),
        format!("{:#x}", receipt.transaction_hash).dimmed()
    );

    Ok(())
}
