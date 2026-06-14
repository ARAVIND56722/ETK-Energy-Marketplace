 ⚡ ETK Energy Marketplace — v2.0

> **This is an improved and extended version of my original [ETK Energy Marketplace](https://github.com/YOUR_USERNAME/YOUR_ORIGINAL_REPO) project.**  
> The original was a basic proof-of-concept for peer-to-peer energy trading. This version adds AI-powered forecasting, IoT smart meter simulation, carbon impact analytics, and a fully redesigned dashboard UI.

---


## 📖 About the Project

**ETK Energy Marketplace** is a decentralized peer-to-peer energy trading platform built on the **Ethereum Sepolia Testnet**. It allows energy producers (e.g., solar panel owners) to list surplus electricity for sale, and consumers to purchase it — all settled on-chain using the **ETK ERC-20 token**.

No middlemen. No central server. Just smart contracts, wallets, and green energy.

---

## 🚀 What's New in v2.0

Compared to the [original project](https://github.com/YOUR_USERNAME/YOUR_ORIGINAL_REPO), this version introduces:

| Feature | v1.0 (Original) | v2.0 (This Repo) |
|---|---|---|
| Energy Marketplace | ✅ Basic | ✅ Partial buy, cancel, filters, sorting |
| Wallet Integration | ✅ MetaMask | ✅ Auto chain-switch, account listeners |
| IoT Smart Meter | ❌ | ✅ Tick-based simulation (5s intervals) |
| AI Price Forecasting | ❌ | ✅ Holt's exponential smoothing |
| Carbon Impact Dashboard | ❌ | ✅ CO₂, trees, km equivalents |
| Transaction History | ❌ | ✅ Live ETK Transfer event log |
| Toast Notifications | ❌ | ✅ With Etherscan tx links |
| UI/UX | Basic | Redesigned dark glassmorphism UI |

---

## 🛠️ Tech Stack

| Layer | Technology |
|---|---|
| **Frontend Framework** | [Next.js 14](https://nextjs.org/) (App Router) |
| **Styling** | [Tailwind CSS](https://tailwindcss.com/) |
| **Blockchain Library** | [ethers.js v6](https://docs.ethers.org/v6/) |
| **Wallet** | [MetaMask](https://metamask.io/) |
| **Smart Contracts** | Solidity on Ethereum Sepolia Testnet |
| **Token Standard** | ERC-20 (ETK Token) |
| **IoT Simulation** | Custom `iotSim` module |
| **AI Forecasting** | Custom `aiForecast` module (Holt's method) |
| **State Management** | React Hooks |
| **Blockchain Explorer** | [Sepolia Etherscan](https://sepolia.etherscan.io/) |

---

## ✨ Features

### 🔌 Wallet & Authentication
- Connect / disconnect MetaMask wallet
- Auto-detects Ethereum network and prompts to switch to Sepolia
- Persists producer wallet identity via `localStorage`
- Listens for account and chain changes in real-time

### 📟 IoT Smart Meter Simulation
- Simulates a real-world smart meter that ticks every 5 seconds
- Tracks real-time energy **generated**, **consumed**, **surplus**, and **deficit**
- Meter history stored per wallet address for forecasting

### 🤖 AI Energy Forecasting
- Uses **Holt's double exponential smoothing** on meter history
- Predicts energy surplus/demand for the **next 1 hour** and **next 24 hours**
- Dynamically suggests an optimal **sell price** based on supply/demand ratio
- Displays reasoning: "High predicted demand vs supply", etc.

### 🛒 Energy Marketplace (On-Chain)
- **Create listings** — list surplus kWh at a chosen ETK price per kWh
- **Partial buy** — buy only the kWh you need from any active listing
- **Auto-approve** — automatically approves ETK spend if allowance is insufficient
- **Cancel listings** — sellers can cancel their own active listings
- **Filter & sort** — filter by active/mine, sort by price or kWh remaining

### 🌱 Carbon Impact Dashboard
- Calculates **CO₂ saved** (kg) based on traded energy
- Shows equivalent number of **trees planted**
- Shows equivalent **car kilometres** offset
- Displayed for both personal impact and global marketplace impact

### 📋 Transaction History
- Listens for `Transfer` events on the ETK contract
- Displays from, to, amount, and clickable Etherscan links for every ETK transfer

### 🔔 Toast Notifications
- Success and error notifications with auto-dismiss (6 seconds)
- Includes direct **"View on Etherscan"** link for every on-chain transaction

---

## 📜 Smart Contracts

Both contracts are deployed on **Ethereum Sepolia Testnet**.

| Contract | Address |
|---|---|
| ETK Token (ERC-20) | `0x8d101f2861539DC7DE912136bAE001768739F18e` |
| Marketplace | `0x5Ebf9eB655DBEda45a456Dee2Ee76a7867A70A58` |

### ETK Token ABI (key functions)
```solidity
function balanceOf(address owner) view returns (uint256)
function approve(address spender, uint256 amount) returns (bool)
function allowance(address owner, address spender) view returns (uint256)
```

### Marketplace ABI (key functions)
```solidity
function createListing(uint256 kwh, uint256 pricePerKwh) returns (uint256)
function buy(uint256 id, uint256 kwhToBuy)
function cancelListing(uint256 id)
function getListings(uint256 fromId, uint256 toId) view returns (tuple[])
```


🚀 Getting Started

 Prerequisites

- [Node.js](https://nodejs.org/) v18+
- [MetaMask](https://metamask.io/) browser extension
- Sepolia testnet ETH (get from [Sepolia Faucet](https://sepoliafaucet.com/))
- ETK tokens (from the token contract or a faucet if available)

 Installation

```bash
# Clone the repository
git clone https://github.com/YOUR_USERNAME/YOUR_REPO_NAME.git

# Navigate into the project
cd YOUR_REPO_NAME

# Install dependencies
npm install

# Start the development server
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

---
⚙️ Environment Setup

No `.env` file is required for basic usage — contract addresses are hardcoded for Sepolia testnet.

If you want to deploy your own contracts, update these constants in `page.js`:

```js
const ETK_CONTRACT_ADDRESS = "your_etk_token_address";
const MARKETPLACE_ADDRESS  = "your_marketplace_address";
```

---

 💡 How It Works

```
User connects MetaMask
        │
        ▼
Smart meter starts simulating (every 5s tick)
        │
        ▼
AI forecasts next-hour surplus/demand → suggests sell price
        │
   ┌────┴────┐
   │         │
Producer   Consumer
   │         │
Creates    Browses
listing    listings
(on-chain) │
           │
        Approves ETK spend
           │
        Buys kWh (on-chain)
           │
        ETK transferred
        seller ← buyer
```

---

 📸 Screenshots

##  Wallet Connection

<img width="843" height="431" alt="image" src="https://github.com/user-attachments/assets/44bbcdb9-9164-4849-809b-cad8a87eb08f" />

##  SmartMeter Simulation

<img width="1532" height="696" alt="image" src="https://github.com/user-attachments/assets/93737f07-551e-4233-beab-60c6cfcdec66" />

##  AI Prediction & Carbon Impact Dashboard

<img width="1447" height="901" alt="image" src="https://github.com/user-attachments/assets/7c8d4e12-fa46-4296-90f9-592c5083aa51" />

##  Energy Marketplace

<img width="1452" height="606" alt="image" src="https://github.com/user-attachments/assets/cddac12d-7f44-44c1-b091-48bf40495782" />

##  Transaction History

<img width="1867" height="338" alt="image" src="https://github.com/user-attachments/assets/825040ee-4032-44e6-81eb-ebbb8df5810f" />

##  MetaMask Wallet

<img width="1097" height="877" alt="image" src="https://github.com/user-attachments/assets/e0c9b4f3-a7e2-42c9-891d-150dcae947a3" />

##  Sepolia EtherScan (Transactions)

<img width="1700" height="777" alt="image" src="https://github.com/user-attachments/assets/1419a4b0-fc11-4ca0-85a7-afa9b46ae919" />


---

## 🗺️ Roadmap

- [ ] Deploy to Ethereum Mainnet
- [ ] Real IoT device integration (Raspberry Pi smart meter)
- [ ] Mobile-responsive layout improvements
- [ ] Multi-token support (USDC, DAI)
- [ ] Auction-based listing model
- [ ] Email/push notifications for listing events
- [ ] Backend analytics dashboard

---

 🤝 Contributing

Contributions are welcome! Here's how:

```bash
# Fork the repo, then:
git checkout -b feature/your-feature-name
git commit -m "Add your feature"
git push origin feature/your-feature-name
# Open a Pull Request
```

Please open an issue first to discuss major changes.

---


## 🙏 Acknowledgements

- [ethers.js](https://docs.ethers.org/) — Ethereum library
- [OpenZeppelin](https://openzeppelin.com/) — ERC-20 token standard reference
- [Sepolia Testnet](https://sepolia.etherscan.io/) — Test network
- Original project inspiration: [v1.0 repo](https://github.com/YOUR_USERNAME/YOUR_ORIGINAL_REPO)

---

<p align="center">Built with ⚡ and 🌱 for a greener decentralized future</p>
