
# GrantStream 🌊

> On-chain grant milestone disbursement protocol. Funders lock grant funds 
> and release them automatically as grantees hit verifiable milestones — 
> no trust required.

[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](CONTRIBUTING.md)
[![Built with React](https://img.shields.io/badge/Built%20with-React-61DAFB?logo=react)](https://react.dev)
[![Chain: Base](https://img.shields.io/badge/Chain-Base-0052FF?logo=coinbase)](https://base.org)

---

## 🧩 The Problem

Most grants are paid upfront or in arbitrary tranches with zero accountability.
Grantees ghost. Deliverables slip. Funders have no recourse — and no way to
verify work before funds are released.

## ✅ The Solution

GrantStream locks grant funds in a smart contract and releases each tranche
**only** when a grantee submits evidence and a designated verifier (or DAO vote)
approves it on-chain. Every action is auditable, every release is permissioned,
and no party needs to trust the other.

---

## 🚀 Features

- **Create Grants** — Set title, total amount, milestones, and recipient wallet
- **Milestone Tracker** — Per-milestone status: `pending → submitted → approved → paid`
- **Verifier Panel** — Approve or reject submitted milestones with on-chain confirmation
- **Activity Feed** — Real-time log of all grant events
- **Wallet Connect** — SIWE-based authentication
- **Evidence Storage** — IPFS links attached to each milestone submission
- **Multi-verifier support** — Assign a single verifier or a multisig

---

## 🛠 Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React + TypeScript + Tailwind CSS |
| Routing | React Router v6 |
| Build | Vite |
| Testing | Vitest |
| Styling | Tailwind CSS + PostCSS |
| Containerization | Docker |
| Smart Contracts | Solidity (Hardhat) |
| Storage | IPFS (evidence attachments) |
| Auth | Sign-In With Ethereum (SIWE) |
| Chain | Base / Base Sepolia (testnet) |
| Deploy | Vercel (frontend) |

---

## 📁 Project Structure

```
grantstream/
├── src/
│   ├── components/       # Reusable UI components
│   ├── pages/            # Route-level page components
│   ├── hooks/            # Custom React hooks (wallet, contract)
│   ├── lib/              # Contract ABIs, helpers, constants
│   └── types/            # TypeScript interfaces
├── test/                 # Vitest unit + integration tests
├── __create/             # Grant creation flow
├── plugins/              # Vite plugins
├── Dockerfile
├── .env.example
└── README.md
```

---

## ⚙️ Getting Started

### Prerequisites

- Node.js v18+ or Bun
- A wallet (MetaMask or any EIP-1193 provider)
- (Optional) Docker

### Installation

```bash
git clone https://github.com/teethaking/GrantStream.git
cd GrantStream

# with bun (recommended)
bun install

# or npm
npm install
```

### Environment setup

```bash
cp .env.example .env
```

Fill in your values:

```env
VITE_WALLET_CONNECT_PROJECT_ID=your_project_id
VITE_CONTRACT_ADDRESS=0x...
VITE_CHAIN_ID=84532
VITE_IPFS_GATEWAY=https://ipfs.io/ipfs/
```

### Run locally

```bash
bun dev
# or
npm run dev
```

App runs at `http://localhost:5173`

### Run with Docker

```bash
docker build -t grantstream .
docker run -p 3000:3000 grantstream
```

---

## 🧪 Testing

```bash
# Run all tests
bun test

# With coverage
bun test --coverage
```

---

## 🔄 Core Flow

```
Funder creates grant
        │
        ▼
Funds locked in contract
        │
        ▼
Grantee completes milestone → submits evidence (IPFS link)
        │
        ▼
Verifier reviews submission
        │
   ┌────┴────┐
Approve     Reject
   │           │
Funds      Grantee
release    resubmits
```

---

## 🗺 Roadmap

- [ ] Smart contract audit
- [ ] DAO-based multi-verifier voting
- [ ] Mainnet deployment (Base)
- [ ] GitHub PR link as milestone evidence
- [ ] Email + webhook notifications
- [ ] Protocol fee and sustainability model
- [ ] SDK for embedding GrantStream into other platforms

---

## 🤝 Contributing

Pull requests are welcome. For major changes, open an issue first.

```bash
git checkout -b feature/your-feature
git commit -m "feat: add your feature"
git push origin feature/your-feature
```

Please follow [Conventional Commits](https://www.conventionalcommits.org/).

---

## 📄 License

MIT © [teethaking](https://github.com/teethaking)

---

## 🙏 Acknowledgements

Built as part of the open source web3 ecosystem.  
Inspired by Gitcoin, Drips, and the broader public goods funding movement.
