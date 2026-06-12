use clap::{Parser, Subcommand};
use std::path::PathBuf;

/// GrantStream CLI — interact with GrantStreamEscrow smart contracts
#[derive(Parser, Debug)]
#[command(
    name = "grantstream",
    version,
    about = "CLI for the GrantStream on-chain grant escrow protocol",
    long_about = None
)]
pub struct Cli {
    /// Path to a .env config file (overrides default .env lookup)
    #[arg(long, short = 'c', global = true, value_name = "FILE")]
    pub config: Option<PathBuf>,

    #[command(subcommand)]
    pub command: Commands,
}

#[derive(Subcommand, Debug)]
pub enum Commands {
    /// Create a new grant (funder role). Also approves + funds the escrow with USDC.
    #[command(name = "create-grant")]
    CreateGrant(crate::commands::create_grant::CreateGrantArgs),

    /// Approve USDC allowance and deposit funds into an existing unfunded grant (funder role)
    #[command(name = "fund-grant")]
    FundGrant(crate::commands::fund_grant::FundGrantArgs),

    /// Submit milestone evidence URI (grantee role)
    #[command(name = "submit-milestone")]
    SubmitMilestone(crate::commands::submit_milestone::SubmitMilestoneArgs),

    /// Approve a submitted milestone and release funds (verifier role)
    #[command(name = "approve-milestone")]
    ApproveMilestone(crate::commands::approve_milestone::ApproveMilestoneArgs),

    /// Reject a submitted milestone (verifier role)
    #[command(name = "reject-milestone")]
    RejectMilestone(crate::commands::reject_milestone::RejectMilestoneArgs),

    /// List all grants for a given funder or grantee address (read-only)
    #[command(name = "list-grants")]
    ListGrants(crate::commands::list_grants::ListGrantsArgs),

    /// Show full status of a specific grant and all its milestones (read-only)
    #[command(name = "grant-status")]
    GrantStatus(crate::commands::grant_status::GrantStatusArgs),
}
