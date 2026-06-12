use anyhow::{Context, Result};
use std::path::Path;

/// Runtime configuration loaded from a .env file or environment variables.
#[derive(Debug, Clone)]
pub struct Config {
    /// HTTP/WS RPC endpoint (e.g. https://sepolia.base.org)
    pub rpc_url: String,

    /// Hex-encoded private key for the signer wallet (without 0x prefix is fine)
    pub private_key: String,

    /// Deployed GrantStreamEscrow contract address
    pub contract_address: String,

    /// USDC ERC-20 token address used by the escrow
    pub usdc_address: String,
}

impl Config {
    /// Load config from a .env file.
    ///
    /// If `path` is `Some`, that file is loaded explicitly.
    /// Otherwise the standard dotenvy lookup walks up from the current directory.
    pub fn load(path: Option<&Path>) -> Result<Self> {
        match path {
            Some(p) => {
                dotenvy::from_path(p)
                    .with_context(|| format!("Failed to load config from {}", p.display()))?;
            }
            None => {
                // Best-effort: don't fail if no .env exists — env vars may already be set
                let _ = dotenvy::dotenv();
            }
        }

        let rpc_url = read_env("RPC_URL")?;
        let private_key = read_env("PRIVATE_KEY")?;
        let contract_address = read_env("CONTRACT_ADDRESS")?;
        let usdc_address = read_env("USDC_ADDRESS")?;

        Ok(Self {
            rpc_url,
            private_key,
            contract_address,
            usdc_address,
        })
    }
}

fn read_env(key: &str) -> Result<String> {
    std::env::var(key).with_context(|| {
        format!(
            "Missing environment variable `{}`. Set it in your .env file or export it.",
            key
        )
    })
}
