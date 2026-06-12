use anyhow::{Context, Result};
use clap::Args;
use colored::Colorize;
use ethers::types::U256;

use crate::{
    config::Config,
    contract::{build_signing_client, parse_address, milestone_status_label, GrantStreamEscrow},
};

#[derive(Args, Debug)]
pub struct ListGrantsArgs {
    /// List grants where this address is the funder (mutually exclusive with --grantee)
    #[arg(long, value_name = "ADDRESS", conflicts_with = "grantee")]
    pub funder: Option<String>,

    /// List grants where this address is the grantee (mutually exclusive with --funder)
    #[arg(long, value_name = "ADDRESS", conflicts_with = "funder")]
    pub grantee: Option<String>,

    /// Show full milestone details for each grant
    #[arg(long, default_value_t = false)]
    pub verbose: bool,
}

pub async fn run(cfg: Config, args: ListGrantsArgs) -> Result<()> {
    let client = build_signing_client(&cfg.rpc_url, &cfg.private_key).await?;
    let contract_address = parse_address(&cfg.contract_address)?;
    let escrow = GrantStreamEscrow::new(contract_address, client.clone());

    // Determine the range of grants to scan.
    // GrantStreamEscrow uses nextGrantId() as an incrementing counter starting at 0.
    let next_id: U256 = escrow
        .next_grant_id()
        .call()
        .await
        .context("Failed to read nextGrantId")?;

    let total = next_id.as_u64();

    if total == 0 {
        println!("{}", "No grants found on this contract.".dimmed());
        return Ok(());
    }

    // Filter: if --funder or --grantee is given, parse the address
    let filter_funder = args.funder.as_deref().map(parse_address).transpose()?;
    let filter_grantee = args.grantee.as_deref().map(parse_address).transpose()?;

    println!("{}", "── List Grants ───────────────────────────────".cyan().bold());
    if let Some(addr) = filter_funder {
        println!("  Funder filter : {}", format!("{addr:#x}").yellow());
    }
    if let Some(addr) = filter_grantee {
        println!("  Grantee filter: {}", format!("{addr:#x}").yellow());
    }
    println!("  Total grants  : {}", total.to_string().yellow());
    println!();

    let mut found = 0u64;

    for id in 0..total {
        let grant = escrow
            .grants(U256::from(id))
            .call()
            .await
            .with_context(|| format!("Failed to read grant {id}"))?;

        let (funder, grantee, verifier, total_amount, paid_amount, funded, exists) = grant;

        if !exists {
            continue;
        }

        // Apply address filters
        if let Some(f) = filter_funder {
            if funder != f {
                continue;
            }
        }
        if let Some(g) = filter_grantee {
            if grantee != g {
                continue;
            }
        }

        found += 1;

        let status = if paid_amount == total_amount {
            "Completed".green().to_string()
        } else if funded {
            "Active".cyan().to_string()
        } else {
            "Unfunded".yellow().to_string()
        };

        println!(
            "{} Grant #{}  [{}]",
            "●".blue(),
            id.to_string().bold(),
            status
        );
        println!("    Funder  : {}", format!("{funder:#x}").dimmed());
        println!("    Grantee : {}", format!("{grantee:#x}").dimmed());
        println!("    Verifier: {}", format!("{verifier:#x}").dimmed());
        println!(
            "    Amount  : {} / {} USDC",
            (paid_amount.as_u64() as f64 / 1_000_000.0).to_string().green(),
            (total_amount.as_u64() as f64 / 1_000_000.0).to_string().yellow()
        );

        if args.verbose {
            let count: U256 = escrow
                .get_milestone_count(U256::from(id))
                .call()
                .await
                .with_context(|| format!("Failed to read milestone count for grant {id}"))?;

            for m_idx in 0..count.as_u64() {
                let (m_amount, m_uri, m_status) = escrow
                    .get_milestone(U256::from(id), U256::from(m_idx))
                    .call()
                    .await
                    .with_context(|| format!("Failed to read milestone {m_idx} for grant {id}"))?;

                println!(
                    "    Milestone #{}: {} USDC  [{}]  {}",
                    m_idx,
                    (m_amount.as_u64() as f64 / 1_000_000.0),
                    milestone_status_label(m_status),
                    if m_uri.is_empty() { "(no evidence)".dimmed().to_string() } else { m_uri.dimmed().to_string() }
                );
            }
        }

        println!();
    }

    if found == 0 {
        println!("{}", "No matching grants found.".dimmed());
    } else {
        println!("Found {} grant(s).", found.to_string().cyan().bold());
    }

    Ok(())
}
