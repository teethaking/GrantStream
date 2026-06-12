use anyhow::{Context, Result};
use ethers::{
    middleware::SignerMiddleware,
    prelude::LocalWallet,
    providers::{Http, Middleware, Provider},
    signers::Signer,
    types::Address,
};
use std::sync::Arc;

// ---------------------------------------------------------------------------
// ABI bindings generated at compile-time via abigen! macro
// ---------------------------------------------------------------------------

ethers::contract::abigen!(
    GrantStreamEscrow,
    r#"[
        function createGrant(address grantee, address verifier, uint256[] milestoneAmounts) external returns (uint256 grantId)
        function fundGrant(uint256 grantId) external
        function submitMilestone(uint256 grantId, uint256 milestoneId, string evidenceURI) external
        function approveMilestone(uint256 grantId, uint256 milestoneId) external
        function rejectMilestone(uint256 grantId, uint256 milestoneId) external
        function getMilestone(uint256 grantId, uint256 milestoneId) external view returns (uint256 amount, string evidenceURI, uint8 status)
        function getMilestoneCount(uint256 grantId) external view returns (uint256)
        function grants(uint256) external view returns (address funder, address grantee, address verifier, uint256 totalAmount, uint256 paidAmount, bool funded, bool exists)
        function nextGrantId() external view returns (uint256)
        function usdc() external view returns (address)
        event GrantCreated(uint256 indexed grantId, address indexed funder, address indexed grantee, address verifier, uint256 totalAmount)
        event GrantFunded(uint256 indexed grantId, uint256 amount)
        event MilestoneSubmitted(uint256 indexed grantId, uint256 indexed milestoneId, string evidenceURI)
        event MilestoneApproved(uint256 indexed grantId, uint256 indexed milestoneId)
        event MilestoneRejected(uint256 indexed grantId, uint256 indexed milestoneId)
        event MilestonePaid(uint256 indexed grantId, uint256 indexed milestoneId, address indexed grantee, uint256 amount)
    ]"#
);

ethers::contract::abigen!(
    ERC20,
    r#"[
        function approve(address spender, uint256 amount) external returns (bool)
        function allowance(address owner, address spender) external view returns (uint256)
        function balanceOf(address account) external view returns (uint256)
        function decimals() external view returns (uint8)
        function symbol() external view returns (string)
    ]"#
);

// ---------------------------------------------------------------------------
// Shared client type aliases
// ---------------------------------------------------------------------------

pub type EthProvider = Provider<Http>;
pub type SigningClient = Arc<SignerMiddleware<EthProvider, LocalWallet>>;

/// Build a signing middleware from config values.
/// This is `async` so it can await `get_chainid()` from the provider.
pub async fn build_signing_client(rpc_url: &str, private_key: &str) -> Result<SigningClient> {
    let provider =
        Provider::<Http>::try_from(rpc_url).context("Invalid RPC URL")?;

    // Strip leading "0x" if present before parsing
    let key_hex = private_key.trim_start_matches("0x");
    let wallet: LocalWallet = key_hex
        .parse()
        .context("Invalid PRIVATE_KEY — expected hex-encoded secp256k1 key")?;

    let chain_id = provider
        .get_chainid()
        .await
        .context("Could not fetch chain ID from RPC")?
        .as_u64();

    let wallet = wallet.with_chain_id(chain_id);
    Ok(Arc::new(SignerMiddleware::new(provider, wallet)))
}

/// Parse an Ethereum address, accepting both checksummed and lowercase hex.
pub fn parse_address(s: &str) -> Result<Address> {
    s.parse::<Address>()
        .with_context(|| format!("Invalid Ethereum address: {s}"))
}

/// Human-readable milestone status labels.
pub fn milestone_status_label(status: u8) -> &'static str {
    match status {
        0 => "Pending",
        1 => "Submitted",
        2 => "Approved",
        3 => "Paid",
        4 => "Rejected",
        _ => "Unknown",
    }
}
