use anyhow::{Context, Result};
use clap::Args;
use colored::Colorize;
use ethers::types::U256;

use crate::{
    config::Config,
    contract::{build_signing_client, parse_address, milestone_status_label, GrantStreamEscrow},
};

#[derive(Args, Debug)]
pub struct GrantStatusArgs {
    /// Grant ID to inspect
    #[arg(long, value_name = "ID")]
    pub grant_id: u64,
}

pub async fn run(cfg: Config, args: GrantStatusArgs) -> Result<()> {
    let client = build_signing_client(&cfg.rpc_url, &cfg.private_key).await?;
    let contract_address = parse_address(&cfg.contract_address)?;
    let escrow = GrantStreamEscrow::new(contract_address, client.clone());

    let grant_id = U256::from(args.grant_id);

    // Fetch grant core data
    let (funder, grantee, verifier, total_amount, paid_amount, funded, exists) = escrow
        .grants(grant_id)
        .call()
        .await
        .context("Failed to read grant from contract")?;

    if !exists {
        anyhow::bail!("Grant {} does not exist", args.grant_id);
    }

    // Determine overall grant status
    let overall_status = if paid_amount == total_amount && total_amount > U256::zero() {
        "Completed".green().bold().to_string()
    } else if funded {
        "Active".cyan().bold().to_string()
    } else {
        "Unfunded".yellow().bold().to_string()
    };

    println!("{}", "── Grant Status ──────────────────────────────".cyan().bold());
    println!("  Grant ID  : {}", args.grant_id.to_string().bold());
    println!("  Status    : {}", overall_status);
    println!("  Funder    : {}", format!("{funder:#x}").yellow());
    println!("  Grantee   : {}", format!("{grantee:#x}").yellow());
    println!("  Verifier  : {}", format!("{verifier:#x}").yellow());
    println!(
        "  Released  : {} / {} USDC",
        (paid_amount.as_u64() as f64 / 1_000_000.0).to_string().green(),
        (total_amount.as_u64() as f64 / 1_000_000.0).to_string().yellow()
    );

    // Progress bar
    let progress = if total_amount > U256::zero() {
        (paid_amount.as_u128() * 20 / total_amount.as_u128()) as usize
    } else {
        0
    };
    let bar = format!(
        "[{}{}] {}%",
        "█".repeat(progress).green(),
        "░".repeat(20 - progress).dimmed(),
        paid_amount.as_u128() * 100 / total_amount.as_u128().max(1)
    );
    println!("  Progress  : {}", bar);

    // Milestones
    let count: U256 = escrow
        .get_milestone_count(grant_id)
        .call()
        .await
        .context("Failed to read milestone count")?;

    println!("\n  {} Milestones ({})", "─".dimmed(), count);

    for idx in 0..count.as_u64() {
        let (m_amount, m_uri, m_status) = escrow
            .get_milestone(grant_id, U256::from(idx))
            .call()
            .await
            .with_context(|| format!("Failed to read milestone {idx}"))?;

        let status_str = match m_status {
            0 => "Pending".normal().to_string(),
            1 => "Submitted".yellow().to_string(),
            2 => "Approved".cyan().to_string(),
            3 => "Paid".green().bold().to_string(),
            4 => "Rejected".red().to_string(),
            _ => "Unknown".dimmed().to_string(),
        };

        let _ = milestone_status_label(m_status); // used via display above

        println!(
            "\n  Milestone #{} — {} USDC  [{}]",
            idx,
            (m_amount.as_u64() as f64 / 1_000_000.0),
            status_str
        );

        if !m_uri.is_empty() {
            println!("    Evidence: {}", m_uri.dimmed());
        } else {
            println!("    Evidence: {}", "(none submitted)".dimmed());
        }
    }

    println!();
    Ok(())
}
