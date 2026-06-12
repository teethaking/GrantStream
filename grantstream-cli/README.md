# grantstream-cli

A Rust CLI for interacting with the **GrantStreamEscrow** smart contract.

Built with [`clap`](https://docs.rs/clap) for argument parsing and [`ethers-rs`](https://docs.rs/ethers) for signing and broadcasting transactions.

---

## Setup

### 1. Prerequisites

**Choose one:**

- **Windows MSVC** (recommended): Install [Visual Studio Build Tools](https://visualstudio.microsoft.com/downloads/#build-tools-for-visual-studio-2022) with the "Desktop development with C++" workload, then:
  ```
  rustup override set stable-x86_64-pc-windows-msvc
  ```
- **Windows GNU**: Install [WinLibs GCC](https://winlibs.com/) (adds `gcc.exe` to PATH), the default toolchain works as-is.

### 2. Config file

Copy `.env.example` to `.env` and fill in the values:

```
RPC_URL=https://sepolia.base.org
PRIVATE_KEY=your_private_key_here
CONTRACT_ADDRESS=0x...
USDC_ADDRESS=0x...
```

### 3. Build

```bash
cargo build --release
```

Binary will be at `target/release/grantstream.exe`.

---

## Usage

All commands load config from `.env` in the current directory. Override with `--config`:

```bash
grantstream --config /path/to/.env <SUBCOMMAND>
```

### Subcommands

#### `create-grant` (funder)

Creates a new grant and, by default, also approves USDC and funds the escrow in one go.

```bash
grantstream create-grant \
  --grantee 0xGranteeAddress \
  --verifier 0xVerifierAddress \
  --milestones 100,200,300
```

- `--milestones` — comma-separated USDC amounts (e.g. `100,200` = 100 USDC + 200 USDC)
- `--fund false` — skip the approve+fund step if you want to fund separately

#### `fund-grant` (funder)

Approves USDC and funds an existing unfunded grant.

```bash
grantstream fund-grant --grant-id 0
```

#### `submit-milestone` (grantee)

Submits IPFS evidence for a specific milestone.

```bash
grantstream submit-milestone \
  --grant-id 0 \
  --milestone-id 0 \
  --evidence-uri ipfs://QmYourHash
```

#### `approve-milestone` (verifier)

Approves a submitted milestone, releasing its USDC to the grantee.

```bash
grantstream approve-milestone --grant-id 0 --milestone-id 0
```

#### `reject-milestone` (verifier)

Rejects a submitted milestone; grantee can resubmit evidence.

```bash
grantstream reject-milestone --grant-id 0 --milestone-id 0
```

#### `list-grants` (read-only)

Lists all grants on the contract, optionally filtering by funder or grantee.

```bash
# All grants
grantstream list-grants

# Grants for a specific funder
grantstream list-grants --funder 0xFunderAddress

# Grants for a specific grantee, with milestone details
grantstream list-grants --grantee 0xGranteeAddress --verbose
```

#### `grant-status` (read-only)

Shows full status of a specific grant including all milestones and a progress bar.

```bash
grantstream grant-status --grant-id 0
```

---

## Project layout

```
src/
  main.rs          — entry point, routes subcommands
  cli.rs           — clap CLI definition
  config.rs        — .env loading
  contract.rs      — ethers abigen! bindings + signing client builder
  commands/
    create_grant.rs
    fund_grant.rs
    submit_milestone.rs
    approve_milestone.rs
    reject_milestone.rs
    list_grants.rs
    grant_status.rs
```
