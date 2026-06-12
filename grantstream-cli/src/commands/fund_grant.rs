use anyhow::{Context, Result};
use clap::Args;
use colored::Colorize;
use ethers::types::U256;

use crate::{
    config::Config,
    contract::{build_signing_client, parse_address, ERC20, GrantStreamEscrow},
};

#[derive(Args, Debug)]
pub struct FundGrantArgs {
    /// Grant ID to fund
    #[arg(long, value_name = "ID")]
    pub grant_id: u64,
}

pub async fn run(cfg: Config, args: FundGrantArgs) -> Result<()> {
    let client = build_signing_client(&cfg.rpc_url, &cfg.private_key).await?;

    let contract_address = parse_address(&cfg.contract_address)?;
    let usdc_address = parse_address(&cfg.usdc_address)?;

    let escrow = GrantStreamEscrow::new(contract_address, client.clone());
    let grant_id = U256::from(args.grant_id);

    // Fetch the grant to get totalAmount for the approval
    let grant = escrow
        .grants(grant_id)
        .call()
        .await
        .context("Failed to read grant from contract")?;

    // grants() returns (funder, grantee, verifier, totalAmount, paidAmount, funded, exists)
    let (_, _, _, total_amount, _, funded, exists) = grant;

    if !exists {
        anyhow::bail!("Grant {} does not exist", args.grant_id);
    }
    if funded {
        anyhow::bail!("Grant {} is already funded", args.grant_id);
    }

    println!("{}", "── Fund Grant ────────────────────────────────".cyan().bold());
    println!("  Grant ID : {}", args.grant_id.to_string().yellow());
    println!(
        "  Amount   : {} USDC",
        (total_amount.as_u64() as f64 / 1_000_000.0).to_string().yellow()
    );

    // Approve USDC
    let usdc = ERC20::new(usdc_address, client.clone());

    println!("\n{} Approving USDC allowance…", "→".blue());
    let approve_receipt = usdc
        .approve(contract_address, total_amount)
        .send()
        .await
        .context("USDC approve transaction failed")?
        .await
        .context("USDC approve receipt not received")?
        .context("USDC approve returned no receipt")?;

    println!(
        "{} USDC approved  (tx: {})",
        "✓".green(),
        format!("{:#x}", approve_receipt.transaction_hash).dimmed()
    );

    // Fund the grant
    println!("{} Sending fundGrant transaction…", "→".blue());
    let fund_receipt = escrow
        .fund_grant(grant_id)
        .send()
        .await
        .context("fundGrant transaction failed")?
        .await
        .context("fundGrant receipt not received")?
        .context("fundGrant returned no receipt")?;

    println!(
        "{} Grant {} funded successfully!  (tx: {})",
        "✓".green().bold(),
        args.grant_id.to_string().cyan().bold(),
        format!("{:#x}", fund_receipt.transaction_hash).dimmed()
    );

    Ok(())
}
