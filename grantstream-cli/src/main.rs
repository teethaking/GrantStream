mod cli;
mod commands;
mod config;
mod contract;

use anyhow::Result;
use clap::Parser;
use cli::{Cli, Commands};
use colored::Colorize;

#[tokio::main]
async fn main() {
    if let Err(e) = run().await {
        eprintln!("{} {:#}", "Error:".red().bold(), e);
        std::process::exit(1);
    }
}

async fn run() -> Result<()> {
    let cli = Cli::parse();

    // Load config: --config flag takes precedence, otherwise load .env
    let cfg = config::Config::load(cli.config.as_deref())?;

    match cli.command {
        Commands::CreateGrant(args) => commands::create_grant::run(cfg, args).await,
        Commands::FundGrant(args) => commands::fund_grant::run(cfg, args).await,
        Commands::SubmitMilestone(args) => commands::submit_milestone::run(cfg, args).await,
        Commands::ApproveMilestone(args) => commands::approve_milestone::run(cfg, args).await,
        Commands::RejectMilestone(args) => commands::reject_milestone::run(cfg, args).await,
        Commands::ListGrants(args) => commands::list_grants::run(cfg, args).await,
        Commands::GrantStatus(args) => commands::grant_status::run(cfg, args).await,
    }
}
