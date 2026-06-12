use anyhow::{Context, Result};
use clap::Args;
use colored::Colorize;
use ethers::types::U256;

use crate::{
    config::Config,
    contract::{build_signing_client, parse_address, ERC20, GrantStreamEscrow},
};

#[derive(Args, Debug)]
pub struct CreateGrantArgs {
    /// Grantee wallet address
    #[arg(long, value_name = "ADDRESS")]
    pub grantee: String,

    /// Verifier wallet address
    #[arg(long, value_name = "ADDRESS")]
    pub verifier: String,

    /// Comma-separated milestone amounts in USDC units (e.g. 100,200,300 means 100 USDC, 200 USDC, 300 USDC)
    #[arg(long, value_name = "AMOUNTS", value_delimiter = ',')]
    pub milestones: Vec<f64>,

    /// Also approve + fund the grant in the same command (default: true)
    #[arg(long, default_value_t = true)]
    pub fund: bool,
}

pub async fn run(cfg: Config, args: CreateGrantArgs) -> Result<()> {
    let client = build_signing_client(&cfg.rpc_url, &cfg.private_key).await?;

    let contract_address = parse_address(&cfg.contract_address)?;
    let usdc_address = parse_address(&cfg.usdc_address)?;
    let grantee = parse_address(&args.grantee)?;
    let verifier = parse_address(&args.verifier)?;

    if args.milestones.is_empty() {
        anyhow::bail!("At least one milestone amount is required (--milestones 100,200)");
    }

    // Convert USDC float amounts to raw units (6 decimals)
    let milestone_amounts: Vec<U256> = args
        .milestones
        .iter()
        .map(|&amt| {
            let raw = (amt * 1_000_000.0).round() as u64;
            U256::from(raw)
        })
        .collect();

    let total: U256 = milestone_amounts.iter().fold(U256::zero(), |acc, &x| acc + x);

    println!("{}", "── Create Grant ──────────────────────────────".cyan().bold());
    println!("  Grantee  : {}", args.grantee.yellow());
    println!("  Verifier : {}", args.verifier.yellow());
    println!(
        "  Milestones: {}",
        milestone_amounts
            .iter()
            .map(|a| format!("{} USDC", a.as_u64() as f64 / 1_000_000.0))
            .collect::<Vec<_>>()
            .join(", ")
            .yellow()
    );
    println!(
        "  Total    : {} USDC",
        (total.as_u64() as f64 / 1_000_000.0).to_string().yellow()
    );

    let escrow = GrantStreamEscrow::new(contract_address, client.clone());

    // Step 1 — createGrant
    println!("\n{} Sending createGrant transaction…", "→".blue());
    let tx = escrow
        .create_grant(grantee, verifier, milestone_amounts)
        .send()
        .await
        .context("createGrant transaction failed")?
        .await
        .context("createGrant receipt not received")?
        .context("createGrant returned no receipt")?;

    // Extract grantId from GrantCreated event log
    let grant_id = extract_grant_id_from_receipt(&tx)?;

    println!(
        "{} Grant created! ID = {}  (tx: {})",
        "✓".green().bold(),
        grant_id.to_string().cyan().bold(),
        format!("{:#x}", tx.transaction_hash).dimmed()
    );

    // Step 2 — approve + fundGrant (optional)
    if args.fund {
        let usdc = ERC20::new(usdc_address, client.clone());

        println!("\n{} Approving USDC allowance…", "→".blue());
        let approve_tx = usdc
            .approve(contract_address, total)
            .send()
            .await
            .context("USDC approve transaction failed")?
            .await
            .context("USDC approve receipt not received")?
            .context("USDC approve returned no receipt")?;

        println!(
            "{} USDC approved  (tx: {})",
            "✓".green(),
            format!("{:#x}", approve_tx.transaction_hash).dimmed()
        );

        println!("{} Funding grant…", "→".blue());
        let fund_tx = escrow
            .fund_grant(grant_id)
            .send()
            .await
            .context("fundGrant transaction failed")?
            .await
            .context("fundGrant receipt not received")?
            .context("fundGrant returned no receipt")?;

        println!(
            "{} Grant funded!  (tx: {})",
            "✓".green().bold(),
            format!("{:#x}", fund_tx.transaction_hash).dimmed()
        );
    }

    Ok(())
}

/// Parse the GrantCreated event to get the grantId from the transaction receipt.
fn extract_grant_id_from_receipt(
    receipt: &ethers::types::TransactionReceipt,
) -> Result<U256> {
    // GrantCreated(uint256 indexed grantId, ...) — grantId is topic[1]
    for log in &receipt.logs {
        // topic[0] is the event signature hash; topic[1] is the indexed grantId
        if log.topics.len() >= 2 {
            return Ok(U256::from(log.topics[1].as_bytes()));
        }
    }
    anyhow::bail!("Could not extract grantId from transaction receipt — no GrantCreated log found")
}
