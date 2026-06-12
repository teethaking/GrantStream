use anyhow::{Context, Result};
use clap::Args;
use colored::Colorize;
use ethers::types::U256;

use crate::{
    config::Config,
    contract::{build_signing_client, parse_address, GrantStreamEscrow},
};

#[derive(Args, Debug)]
pub struct RejectMilestoneArgs {
    /// Grant ID
    #[arg(long, value_name = "ID")]
    pub grant_id: u64,

    /// Zero-based milestone index to reject
    #[arg(long, value_name = "INDEX")]
    pub milestone_id: u64,
}

pub async fn run(cfg: Config, args: RejectMilestoneArgs) -> Result<()> {
    let client = build_signing_client(&cfg.rpc_url, &cfg.private_key).await?;
    let contract_address = parse_address(&cfg.contract_address)?;
    let escrow = GrantStreamEscrow::new(contract_address, client.clone());

    println!("{}", "── Reject Milestone ──────────────────────────".cyan().bold());
    println!("  Grant ID     : {}", args.grant_id.to_string().yellow());
    println!("  Milestone ID : {}", args.milestone_id.to_string().yellow());

    println!("\n{} Sending rejectMilestone transaction…", "→".blue());

    let receipt = escrow
        .reject_milestone(U256::from(args.grant_id), U256::from(args.milestone_id))
        .send()
        .await
        .context("rejectMilestone transaction failed")?
        .await
        .context("rejectMilestone receipt not received")?
        .context("rejectMilestone returned no receipt")?;

    println!(
        "{} Milestone {} rejected — grantee may resubmit evidence.  (tx: {})",
        "✓".green().bold(),
        args.milestone_id.to_string().cyan(),
        format!("{:#x}", receipt.transaction_hash).dimmed()
    );

    Ok(())
}
