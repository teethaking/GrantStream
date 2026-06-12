use anyhow::{Context, Result};
use clap::Args;
use colored::Colorize;
use ethers::types::U256;

use crate::{
    config::Config,
    contract::{build_signing_client, parse_address, GrantStreamEscrow},
};

#[derive(Args, Debug)]
pub struct ApproveMilestoneArgs {
    /// Grant ID
    #[arg(long, value_name = "ID")]
    pub grant_id: u64,

    /// Zero-based milestone index to approve
    #[arg(long, value_name = "INDEX")]
    pub milestone_id: u64,
}

pub async fn run(cfg: Config, args: ApproveMilestoneArgs) -> Result<()> {
    let client = build_signing_client(&cfg.rpc_url, &cfg.private_key).await?;
    let contract_address = parse_address(&cfg.contract_address)?;
    let escrow = GrantStreamEscrow::new(contract_address, client.clone());

    println!("{}", "── Approve Milestone ─────────────────────────".cyan().bold());
    println!("  Grant ID     : {}", args.grant_id.to_string().yellow());
    println!("  Milestone ID : {}", args.milestone_id.to_string().yellow());

    println!("\n{} Sending approveMilestone transaction…", "→".blue());

    let receipt = escrow
        .approve_milestone(U256::from(args.grant_id), U256::from(args.milestone_id))
        .send()
        .await
        .context("approveMilestone transaction failed")?
        .await
        .context("approveMilestone receipt not received")?
        .context("approveMilestone returned no receipt")?;

    println!(
        "{} Milestone {} approved — funds released to grantee!  (tx: {})",
        "✓".green().bold(),
        args.milestone_id.to_string().cyan(),
        format!("{:#x}", receipt.transaction_hash).dimmed()
    );

    Ok(())
}
