"use client";
import { getOrCreateMeterState, simulateOneTick } from "@/lib/iotSim";
import { setProducerWallet } from "@/lib/iotSim";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ethers } from "ethers";
import { appendMeterPoint, getMeterHistory } from "@/lib/meterHistory";
import { holtForecast, sum, clamp } from "@/lib/aiForecast";
/** =========================
 *  CONTRACT ADDRESSES
 *  ========================= */
const ETK_CONTRACT_ADDRESS = "0x8d101f2861539DC7DE912136bAE001768739F18e";
const MARKETPLACE_ADDRESS = "0x5Ebf9eB655DBEda45a456Dee2Ee76a7867A70A58";

/** =========================
 *  ABIs
 *  ========================= */
// ERC-20 (balance + meta + approve + allowance)
const ETK_ABI = [
  "function balanceOf(address owner) view returns (uint256)",
  "function decimals() view returns (uint8)",
  "function symbol() view returns (string)",
  "function approve(address spender, uint256 amount) returns (bool)",
  "function allowance(address owner, address spender) view returns (uint256)",
  "event Transfer(address indexed from, address indexed to, uint256 value)",
];

// Partial-matching Marketplace ABI (NEW)
const MARKETPLACE_ABI = [
  "function createListing(uint256 kwh, uint256 pricePerKwh) returns (uint256)",
  "function buy(uint256 id, uint256 kwhToBuy)",
  "function cancelListing(uint256 id)",
  "function nextId() view returns (uint256)",
  "function getListings(uint256 fromId, uint256 toId) view returns (tuple(uint256 id,address seller,uint256 kwhRemaining,uint256 pricePerKwh,bool active,uint256 createdAt)[])",
];

/** =========================
 *  SEPOLIA CONFIG
 *  ========================= */
const SEPOLIA_CHAIN_ID = "0xaa36a7"; // 11155111
const SEPOLIA_PARAMS = {
  chainId: SEPOLIA_CHAIN_ID,
  chainName: "Sepolia Test Network",
  nativeCurrency: { name: "SepoliaETH", symbol: "SEP", decimals: 18 },
  rpcUrls: ["https://rpc.sepolia.org"],
  blockExplorerUrls: ["https://sepolia.etherscan.io"],
};
const EXPLORER = "https://sepolia.etherscan.io";

function shortAddr(a = "") {
  if (!a) return "";
  return `${a.slice(0, 6)}...${a.slice(-4)}`;
}

function Toast({ toast, onClose }) {
  if (!toast) return null;
  const isErr = toast.type === "error";
  return (
    <div className="fixed top-5 right-5 z-50 w-[340px]">
      <div
        className={[
          "rounded-2xl border p-4 shadow-xl backdrop-blur-xl",
          isErr
            ? "bg-red-500/10 border-red-500/30 text-red-100"
            : "bg-green-500/10 border-green-500/30 text-green-100",
        ].join(" ")}
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="font-semibold">{isErr ? "Action failed" : "Success"}</p>
            <p className="text-sm opacity-90 mt-1">{toast.message}</p>

            {toast.txHash ? (
              <a
                className="inline-flex mt-2 text-sm underline underline-offset-4"
                href={`${EXPLORER}/tx/${toast.txHash}`}
                target="_blank"
                rel="noreferrer"
              >
                View on Etherscan
              </a>
            ) : null}
          </div>

          <button
            onClick={onClose}
            className="text-white/70 hover:text-white"
            aria-label="Close"
          >
            ✕
          </button>
        </div>
      </div>
    </div>
  );
}

export default function Dashboard() {
  const router = useRouter();
  
  /** =========================
   *  SELL FORM
   *  ========================= */
  const [meter, setMeter] = useState(null);
  const [autoSellKwh, setAutoSellKwh] = useState(""); // optional: autofill sell
  const [sellKwh, setSellKwh] = useState("");
  const [sellPricePerKwh, setSellPricePerKwh] = useState(""); // in ETK per kWh

  /** =========================
   *  WALLET + TOKEN
   *  ========================= */
  const [account, setAccount] = useState("");
  const [transactions, setTransactions] = useState([]);
  const [producerWallet, setProducerWallet] = useState("");
  const [etkBalance, setEtkBalance] = useState("0");
  const [tokenSymbol, setTokenSymbol] = useState("ETK");
  const [tokenDecimals, setTokenDecimals] = useState(18);
  const [pred, setPred] = useState(null);


  /** =========================
   *  LISTINGS
   *  ========================= */
  const [listings, setListings] = useState([]);
  const [loadingListings, setLoadingListings] = useState(false);

  // per-listing buy input: { [listingId]: "2" }
  const [buyKwhById, setBuyKwhById] = useState({});

  /** =========================
   *  UX STATE
   *  ========================= */
  const [busyLabel, setBusyLabel] = useState(""); // "", "Connecting...", "Creating...", "Approving...", "Buying...", "Cancelling..."
  const isBusy = !!busyLabel;

  const [toast, setToast] = useState(null);


  // =======================
// 🌱 CARBON CALCULATIONS
// =======================


const isProducer =
  account && producerWallet &&
  account.toLowerCase() === producerWallet.toLowerCase();

// You must already have these values tracked somewhere
// If not, temporarily use totals from meter
const personalKwh = isProducer
  ? (meter?.totalExported || 0)
  : (meter?.totalImported || 0);

// For global impact (simplest version for now)
// You can later replace this with total marketplace traded
const globalKwh = (meter?.totalExported || 0) + (meter?.totalImported || 0);

const EMISSION_FACTOR = 0.82;

const personalCo2 = (personalKwh * EMISSION_FACTOR).toFixed(2);
const globalCo2 = (globalKwh * EMISSION_FACTOR).toFixed(2);

const personalTrees = (personalCo2 / 21).toFixed(2);
const globalTrees = (globalCo2 / 21).toFixed(2);

const personalKm = (personalCo2 / 0.12).toFixed(1);
const globalKm = (globalCo2 / 0.12).toFixed(1);


const disconnectWallet = () => {
  setAccount("");
  setProducerWallet("");

  if (typeof window !== "undefined") {
    localStorage.removeItem("ETK_PRODUCER");
  }

  router.push("/");
};

useEffect(() => {
  if (typeof window !== "undefined") {
    const producer = localStorage.getItem("ETK_PRODUCER") || "";
    setProducerWallet(producer);
  }
}, []);

  useEffect(() => {
  if (!account) return;

  const h = getMeterHistory(account);
  if (!h || h.length < 8) {
    setPred(null);
    return;
  }

  const generated = h.map(p => Number(p.generated) || 0);
  const consumed  = h.map(p => Number(p.consumed) || 0);

  // Your sim is "5 minutes per tick" (minutesPerTick=5), so:
  const STEPS_NEXT_HOUR = 12;   // 12 * 5min = 60min
  const STEPS_NEXT_DAY  = 288;  // 288 * 5min = 24h

  // Forecast generation & consumption
  const gen1h = holtForecast(generated, STEPS_NEXT_HOUR);
  const con1h = holtForecast(consumed,  STEPS_NEXT_HOUR);

  const genDay = holtForecast(generated, STEPS_NEXT_DAY);
  const conDay = holtForecast(consumed,  STEPS_NEXT_DAY);

  // Convert to kWh totals (sum of next steps)
  const genNextHour = Math.max(0, sum(gen1h));
  const conNextHour = Math.max(0, sum(con1h));

  const genNextDay  = Math.max(0, sum(genDay));
  const conNextDay  = Math.max(0, sum(conDay));

  // Surplus & demand (clamped)
  const surplusNextHour = Math.max(0, genNextHour - conNextHour);
  const demandNextHour  = Math.max(0, conNextHour - genNextHour);

  const surplusNextDay  = Math.max(0, genNextDay - conNextDay);
  const demandNextDay   = Math.max(0, conNextDay - genNextDay);

  // House role
  const producerAddr = (localStorage.getItem("ETK_PRODUCER") || "").toLowerCase();
  const isHouseAProducer = account.toLowerCase() === producerAddr;

  // Smart price suggestion (simple + explainable)
  // Use predicted demand vs predicted surplus as signal.
  const basePrice = 2.0; // ETK/kWh baseline (you can tune)
  const ratio = (demandNextHour + 0.2) / (surplusNextHour + 0.2);
  const factor = clamp(ratio, 0.7, 2.2);
  const suggestedPrice = Number((basePrice * factor).toFixed(3));

  const reason =
    factor > 1.25 ? "High predicted demand vs supply" :
    factor < 0.9  ? "Low predicted demand / high supply" :
                    "Balanced predicted demand & supply";

  setPred({
    isHouseAProducer,
    genNextHour: Number(genNextHour.toFixed(3)),
    surplusNextHour: Number(surplusNextHour.toFixed(3)),
    demandNextHour: Number(demandNextHour.toFixed(3)),
    demandNextDay: Number(demandNextDay.toFixed(3)),
    suggestedPrice,
    reason,
  });
}, [account, meter]); // re-run as new meter ticks come in

  /** =========================
   *  FILTERS
   *  ========================= */
  const [showActiveOnly, setShowActiveOnly] = useState(true);
  const [showMineOnly, setShowMineOnly] = useState(false);
  const [sortBy, setSortBy] = useState("new"); // new | priceAsc | priceDesc | kwhAsc | kwhDesc

  const hasEthereum = useMemo(
    () => typeof window !== "undefined" && !!window.ethereum,
    []
  );

  const notify = (type, message, txHash) => {
    setToast({ type, message, txHash });
    window.clearTimeout((notify._t || 0));
    notify._t = window.setTimeout(() => setToast(null), 6000);
  };

  /** =========================
   *  HELPERS
   *  ========================= */
  const ensureSepolia = async () => {
    const chainId = await window.ethereum.request({ method: "eth_chainId" });
    if (chainId !== SEPOLIA_CHAIN_ID) {
      try {
        await window.ethereum.request({
          method: "wallet_switchEthereumChain",
          params: [{ chainId: SEPOLIA_CHAIN_ID }],
        });
      } catch (switchError) {
        if (switchError?.code === 4902) {
          await window.ethereum.request({
            method: "wallet_addEthereumChain",
            params: [SEPOLIA_PARAMS],
          });
        } else {
          throw switchError;
        }
      }
    }
  };

  const getProvider = () => new ethers.BrowserProvider(window.ethereum);

  const fetchTokenMetaOnce = async () => {
    const provider = getProvider();
    const token = new ethers.Contract(ETK_CONTRACT_ADDRESS, ETK_ABI, provider);
    const [decimals, symbol] = await Promise.all([token.decimals(), token.symbol()]);
    setTokenDecimals(Number(decimals));
    setTokenSymbol(symbol);
  };

  const fetchBalance = async (addr) => {
    if (!addr) return;
    const provider = getProvider();
    const token = new ethers.Contract(ETK_CONTRACT_ADDRESS, ETK_ABI, provider);
    const raw = await token.balanceOf(addr);
    setEtkBalance(ethers.formatUnits(raw, tokenDecimals));
  };

  const fetchListings = async () => {
    if (!hasEthereum) return;

    try {
      setLoadingListings(true);

      const provider = getProvider();
      const market = new ethers.Contract(MARKETPLACE_ADDRESS, MARKETPLACE_ABI, provider);

      const nextId = await market.nextId();
      const maxId = Number(nextId) - 1;

      if (maxId < 1) {
        setListings([]);
        return;
      }

      const data = await market.getListings(1, maxId);

      const normalized = data
        .map((L) => ({
          id: Number(L.id),
          seller: L.seller,
          kwhRemaining: Number(L.kwhRemaining),
          pricePerKwhRaw: L.pricePerKwh, // BigInt
          pricePerKwhETK: ethers.formatUnits(L.pricePerKwh, tokenDecimals),
          active: L.active,
          createdAt: Number(L.createdAt),
        }))
        .sort((a, b) => b.id - a.id);

      setListings(normalized);
    } catch (e) {
      console.error(e);
      notify("error", "Could not load listings. Check network / contract.");
    } finally {
      setLoadingListings(false);
    }
  };

  /** =========================
   *  CONNECT
   *  ========================= */
  const connectWallet = async () => {
  if (!hasEthereum) {
    notify("error", "MetaMask not found. Install it in this browser.");
    return;
  }

  try {
    setBusyLabel("Connecting...");
    const accounts = await window.ethereum.request({ method: "eth_requestAccounts" });
    await ensureSepolia();

    const addr = accounts?.[0] || "";

    // ✅ Set Producer FIRST (House A)
   if (!localStorage.getItem("ETK_PRODUCER")) {
  localStorage.setItem("ETK_PRODUCER", addr);
  console.log("✅ ETK_PRODUCER set:", addr);
}

    setAccount(addr);

      await fetchTokenMetaOnce();
      await fetchBalance(addr);
      await fetchTransactions(addr);
      await fetchListings();

      notify("success", "Wallet connected.");
    } catch (e) {
      console.error(e);
      if (e?.code === 4001) notify("error", "You rejected the connection.");
      else notify("error", "Wallet connection failed. Try again.");
    } finally {
      setBusyLabel("");
    }
  };

  /** =========================
   *  SELL (createListing)
   *  ========================= */
  const createListing = async () => {
    if (!account) return notify("error", "Connect wallet first.");

    const kwhNum = Number(sellKwh);
    const ppkNum = Number(sellPricePerKwh);

    if (!kwhNum || kwhNum <= 0) return notify("error", "Enter valid kWh.");
    if (!ppkNum || ppkNum <= 0) return notify("error", "Enter valid price per kWh.");

    try {
      setBusyLabel("Creating...");
      await ensureSepolia();

      const provider = getProvider();
      const signer = await provider.getSigner();
      const market = new ethers.Contract(MARKETPLACE_ADDRESS, MARKETPLACE_ABI, signer);

      // pricePerKwh in smallest units
      const pricePerKwhWei = ethers.parseUnits(sellPricePerKwh.toString(), tokenDecimals);

      const tx = await market.createListing(kwhNum, pricePerKwhWei);
      const receipt = await tx.wait();

      setSellKwh("");
      setSellPricePerKwh("");

      notify("success", "Listing created on-chain ✅", receipt?.hash);
      await fetchListings();
    } catch (e) {
      console.error(e);
      if (e?.code === 4001) notify("error", "Transaction rejected in MetaMask.");
      else notify("error", "Create listing failed. Try again.");
    } finally {
      setBusyLabel("");
    }
  };

  /** =========================
   *  CANCEL (seller only)
   *  ========================= */
  const cancelListing = async (id) => {
    if (!account) return notify("error", "Connect wallet first.");

    try {
      setBusyLabel("Cancelling...");
      await ensureSepolia();

      const provider = getProvider();
      const signer = await provider.getSigner();
      const market = new ethers.Contract(MARKETPLACE_ADDRESS, MARKETPLACE_ABI, signer);

      const tx = await market.cancelListing(id);
      const receipt = await tx.wait();

      notify("success", `Listing #${id} cancelled ✅`, receipt?.hash);
      await fetchListings();
    } catch (e) {
      console.error(e);
      if (e?.code === 4001) notify("error", "Transaction rejected in MetaMask.");
      else notify("error", "Cancel failed. Only seller can cancel.");
    } finally {
      setBusyLabel("");
    }
  };

  /** =========================
   *  BUY (approve if needed) + buy(id, kwhToBuy)
   *  ========================= */
  const approveAndBuyPartial = async (L) => {
    if (!account) return notify("error", "Connect wallet first.");
    if (!L.active) return notify("error", "This listing is not active.");
    if (L.seller?.toLowerCase() === account.toLowerCase())
      return notify("error", "You cannot buy your own listing.");

    const kwhStr = (buyKwhById[L.id] ?? "").toString().trim();
    const kwhToBuyNum = Number(kwhStr);

    if (!kwhToBuyNum || kwhToBuyNum <= 0) return notify("error", "Enter kWh to buy.");
    if (kwhToBuyNum > L.kwhRemaining)
      return notify("error", `Max available is ${L.kwhRemaining} kWh.`);

    try {
      await ensureSepolia();

      const provider = getProvider();
      const signer = await provider.getSigner();

      const token = new ethers.Contract(ETK_CONTRACT_ADDRESS, ETK_ABI, signer);
      const market = new ethers.Contract(MARKETPLACE_ADDRESS, MARKETPLACE_ABI, signer);

      // cost = kwhToBuy * pricePerKwhRaw (both in integer/smallest units)
      const cost = BigInt(kwhToBuyNum) * L.pricePerKwhRaw;

      // allowance check
      const allowance = await token.allowance(account, MARKETPLACE_ADDRESS);

      if (allowance < cost) {
        setBusyLabel("Approving...");
        const txApprove = await token.approve(MARKETPLACE_ADDRESS, cost);
        const r1 = await txApprove.wait();
        notify("success", "Approved ETK spend ✅", r1?.hash);
      }

      setBusyLabel("Buying...");
      const txBuy = await market.buy(L.id, kwhToBuyNum);
      const r2 = await txBuy.wait();

      // clear input for that listing
      setBuyKwhById((prev) => ({ ...prev, [L.id]: "" }));

      notify("success", `Purchased ${kwhToBuyNum} kWh ✅`, r2?.hash);

      await fetchBalance(account);
      await fetchTransactions(account);
      await fetchListings();
    } catch (e) {
      console.error(e);
      if (e?.code === 4001) notify("error", "Transaction rejected in MetaMask.");
      else notify("error", "Buy failed. Check ETK balance and try again.");
    } finally {
      setBusyLabel("");
    }
  };

  /** =========================
   *  INIT + LISTENERS
   *  ========================= */
  useEffect(() => {
    if (!hasEthereum) return;

    const init = async () => {
      try {
        // fetch token meta always (needed to format listing prices)
        await fetchTokenMetaOnce();

        const accounts = await window.ethereum.request({ method: "eth_accounts" });
        const addr = accounts?.[0] || "";
        if (addr) {
          setAccount(addr);
          await ensureSepolia();
          await fetchBalance(addr);
          await fetchTransactions(addr);
          await fetchListings();
        }
      } catch (e) {
        console.error(e);
      }
    };

    init();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasEthereum]);

  useEffect(() => {
    if (!hasEthereum) return;

    const handleAccountsChanged = async (accounts) => {
      const addr = accounts?.[0] || "";
      setAccount(addr);
      setEtkBalance("0");
      setBuyKwhById({});
      if (addr) {
        await ensureSepolia();
        await fetchBalance(addr);
        await fetchListings();
        notify("success", "Account changed.");
      }
    };

    const handleChainChanged = () => window.location.reload();

    window.ethereum.on("accountsChanged", handleAccountsChanged);
    window.ethereum.on("chainChanged", handleChainChanged);

    return () => {
      window.ethereum.removeListener("accountsChanged", handleAccountsChanged);
      window.ethereum.removeListener("chainChanged", handleChainChanged);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasEthereum]);



  useEffect(() => {
  if (!account) return;

  // load existing meter state first
  const initial = getOrCreateMeterState(account);
  setMeter(initial);

  // tick every 5 seconds (simulating smart meter updates)
  const id = setInterval(() => {
    const updated = simulateOneTick(account, 5); // 5 minutes per tick (simulated)
    setMeter(updated);

    appendMeterPoint(account, {
  t: Date.now(),
  generated: updated.generatedNow,
  consumed: updated.consumedNow,
  surplus: updated.surplusNow,
  deficit: updated.deficitNow,
});

    // Autofill sell kWh only if user has not typed anything manually
    setAutoSellKwh((prev) => {
      if (prev && prev.length > 0) return prev;
      // take current surplus (kWh) as suggested sell amount
      return updated?.surplusNow ? String(updated.surplusNow) : "";
    });
  }, 5000);

  return () => clearInterval(id);
}, [account]);

  /** =========================
   *  FILTER + SORT
   *  ========================= */
  const filtered = listings
    .filter((L) => (showActiveOnly ? L.active : true))
    .filter((L) =>
      showMineOnly && account ? L.seller.toLowerCase() === account.toLowerCase() : true
    )
    .sort((a, b) => {
      const pa = Number(a.pricePerKwhETK);
      const pb = Number(b.pricePerKwhETK);
      if (sortBy === "new") return b.id - a.id;
      if (sortBy === "priceAsc") return pa - pb;
      if (sortBy === "priceDesc") return pb - pa;
      if (sortBy === "kwhAsc") return a.kwhRemaining - b.kwhRemaining;
      if (sortBy === "kwhDesc") return b.kwhRemaining - a.kwhRemaining;
      return 0;
    });


  const fetchTransactions = async (walletAddress) => {
  if (!walletAddress) return;

  try {
    const provider = getProvider();
    const token = new ethers.Contract(ETK_CONTRACT_ADDRESS, ETK_ABI, provider);

    const sentFilter = token.filters.Transfer(walletAddress, null);
    const receivedFilter = token.filters.Transfer(null, walletAddress);

    const sentEvents = await token.queryFilter(sentFilter, -10000);
    const receivedEvents = await token.queryFilter(receivedFilter, -10000);

    const allEvents = [...sentEvents, ...receivedEvents];

    const formatted = allEvents.map((event) => ({
      from: event.args.from,
      to: event.args.to,
      value: ethers.formatUnits(event.args.value, tokenDecimals),
      hash: event.transactionHash,
    }));

    // remove duplicates if same tx appears in both arrays
    const unique = formatted.filter(
      (tx, index, self) =>
        index === self.findIndex((t) => t.hash === tx.hash && t.from === tx.from && t.to === tx.to)
    );

    setTransactions(unique.reverse());
  } catch (error) {
    console.error("Error fetching transactions:", error);
  }
};

  /** =========================
   *  UI
   *  ========================= */
  return (
    <div className="min-h-screen bg-gradient-to-br from-black via-slate-950 to-black text-white">
      <Toast toast={toast} onClose={() => setToast(null)} />

      {/* Top Bar */}
      <div className="sticky top-0 z-40 border-b border-white/10 bg-black/30 backdrop-blur-xl">
        <div className="mx-auto max-w-6xl px-6 py-4 flex items-center justify-between">
          <div>
            <p className="text-sm text-white/60">ETK Protocol</p>
            <h1 className="text-xl font-bold tracking-tight">⚡ Energy Marketplace</h1>
          </div>

          <div className="flex items-center gap-3">
            {account ? (
              <div className="hidden sm:flex items-center gap-2 rounded-full bg-white/10 border border-white/15 px-4 py-2">
                <span className="text-xs text-white/70">Wallet</span>
                <span className="font-mono text-sm">{shortAddr(account)}</span>
              </div>
            ) : null}

            <button
              onClick={connectWallet}
              disabled={isBusy}
              className="rounded-xl bg-gradient-to-r from-green-500 to-blue-600 px-5 py-2 text-sm font-semibold shadow-lg disabled:opacity-60"
            >
              {account ? (isBusy ? busyLabel : "Connected") : isBusy ? busyLabel : "Connect Wallet"}
            </button>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="mx-auto max-w-6xl px-6 py-8">
        {/* Stats */}
        <div className="grid md:grid-cols-3 gap-4 mb-6">
          <div className="rounded-2xl border border-white/10 bg-white/5 p-5">
            <p className="text-sm text-white/60">Token</p>
            <p className="mt-1 text-lg font-semibold">{tokenSymbol}</p>
          </div>
          <div className="rounded-2xl border border-white/10 bg-white/5 p-5">
            <p className="text-sm text-white/60">Balance</p>
            <p className="mt-1 text-lg font-semibold">
              {account ? `${etkBalance} ${tokenSymbol}` : "—"}
            </p>
          </div>
          <div className="rounded-2xl border border-white/10 bg-white/5 p-5">
            <p className="text-sm text-white/60">Marketplace</p>
            <a
              className="mt-1 inline-flex text-lg font-semibold underline underline-offset-4"
              href={`${EXPLORER}/address/${MARKETPLACE_ADDRESS}`}
              target="_blank"
              rel="noreferrer"
            >
              {shortAddr(MARKETPLACE_ADDRESS)}
            </a>
          </div>
        </div>


        {/* Smart Meter (IoT Simulation) */}
<div className="bg-white/10 backdrop-blur-lg border border-white/20 p-6 rounded-2xl shadow mb-6">
  <div className="flex items-center justify-between gap-4">
    <div>
      <h2 className="text-xl font-semibold">📡 Smart Meter (Simulated IoT)</h2>
      <p className="text-sm text-gray-300">
        Live generation/consumption updates (no hardware required).
      </p>
    </div>

    {meter?.homeType ? (
      <span className="text-xs px-3 py-1 rounded-full bg-white/10 border border-white/20">
        Mode: <span className="font-semibold">{meter.homeType.toUpperCase()}</span>
      </span>
    ) : null}
  </div>

  <div className="grid md:grid-cols-4 gap-4 mt-5">
    <div className="bg-black/30 border border-white/10 rounded-xl p-4">
      <p className="text-xs text-gray-400">Generated (this tick)</p>
      <p className="text-2xl font-bold mt-1">
        {meter ? meter.generatedNow : "--"} <span className="text-sm text-gray-300">kWh</span>
      </p>
    </div>

    <div className="bg-black/30 border border-white/10 rounded-xl p-4">
      <p className="text-xs text-gray-400">Consumed (this tick)</p>
      <p className="text-2xl font-bold mt-1">
        {meter ? meter.consumedNow : "--"} <span className="text-sm text-gray-300">kWh</span>
      </p>
    </div>

    <div className="bg-black/30 border border-white/10 rounded-xl p-4">
      <p className="text-xs text-gray-400">Surplus (exportable)</p>
      <p className="text-2xl font-bold mt-1">
        {meter ? Number(meter.surplusNow).toFixed(2) : "--"} <span className="text-sm text-gray-300">kWh</span>
      </p>
      <p className="text-xs text-gray-400 mt-1">Goes to grid physically</p>
    </div>

    <div className="bg-black/30 border border-white/10 rounded-xl p-4">
      <p className="text-xs text-gray-400">Deficit (needs)</p>
      <p className="text-2xl font-bold mt-1">
        {meter ? meter.deficitNow : "--"} <span className="text-sm text-gray-300">kWh</span>
      </p>
      <p className="text-xs text-gray-400 mt-1">Grid fallback if needed</p>
    </div>
  </div>

  <div className="grid md:grid-cols-4 gap-4 mt-4">
    <div className="bg-black/20 border border-white/10 rounded-xl p-4">
      <p className="text-xs text-gray-400">Total Generated</p>
      <p className="text-lg font-semibold">{meter ? meter.totalGenerated : "--"} kWh</p>
    </div>
    <div className="bg-black/20 border border-white/10 rounded-xl p-4">
      <p className="text-xs text-gray-400">Total Consumed</p>
      <p className="text-lg font-semibold">{meter ? meter.totalConsumed : "--"} kWh</p>
    </div>
    <div className="bg-black/20 border border-white/10 rounded-xl p-4">
      <p className="text-xs text-gray-400">Total Exported</p>
      <p className="text-lg font-semibold">{meter ? meter.totalExported : "--"} kWh</p>
    </div>
    <div className="bg-black/20 border border-white/10 rounded-xl p-4">
      <p className="text-xs text-gray-400">Total Imported</p>
      <p className="text-lg font-semibold">{meter ? meter.totalImported : "--"} kWh</p>
    </div>
  </div>
</div>

{/* AI Predictions */}
<div className="bg-white/10 backdrop-blur-lg border border-white/20 p-6 rounded-2xl shadow mb-6">
  <div className="flex items-center justify-between gap-4">
    <div>
      <h2 className="text-xl font-semibold">🤖 AI Predictions</h2>
      <p className="text-sm text-gray-300">
        Forecasts are based on smart meter time-series (Holt trend model).
      </p>
    </div>

    <span className="text-xs px-3 py-1 rounded-full bg-white/10 border border-white/20">
      {pred?.isHouseAProducer ? "HOUSE A (Producer)" : "HOUSE B (Consumer)"}
    </span>
  </div>

  {!pred ? (
    <p className="text-gray-300 mt-4">Collecting data… wait ~1 minute for better predictions.</p>
  ) : (
    <div className="grid md:grid-cols-3 gap-4 mt-5">
      {/* House A only */}
      {pred.isHouseAProducer ? (
        <>
          <div className="bg-black/30 border border-white/10 rounded-xl p-4">
            <p className="text-xs text-gray-400">Predicted Generation (Next 1 hour)</p>
            <p className="text-2xl font-bold mt-1">{pred.genNextHour} <span className="text-sm text-gray-300">kWh</span></p>
          </div>

          <div className="bg-black/30 border border-white/10 rounded-xl p-4">
            <p className="text-xs text-gray-400">Predicted Surplus (Next 1 hour)</p>
            <p className="text-2xl font-bold mt-1">{pred.surplusNextHour} <span className="text-sm text-gray-300">kWh</span></p>
          </div>
        </>
      ) : (
        <>
          {/* House B only */}
          <div className="bg-black/30 border border-white/10 rounded-xl p-4">
            <p className="text-xs text-gray-400">Predicted Demand (Next 1 hour)</p>
            <p className="text-2xl font-bold mt-1">{pred.demandNextHour} <span className="text-sm text-gray-300">kWh</span></p>
          </div>

          <div className="bg-black/30 border border-white/10 rounded-xl p-4">
            <p className="text-xs text-gray-400">Predicted Demand (Next 1 day)</p>
            <p className="text-2xl font-bold mt-1">{pred.demandNextDay} <span className="text-sm text-gray-300">kWh</span></p>
          </div>
        </>
      )}

      {/* Smart price suggestion (both can see; seller uses it) */}
      <div className="bg-black/30 border border-white/10 rounded-xl p-4">
        <p className="text-xs text-gray-400">Suggested Price (ETK/kWh)</p>
        <p className="text-2xl font-bold mt-1">{pred.suggestedPrice}</p>
        <p className="text-xs text-gray-400 mt-2">{pred.reason}</p>
      </div>
    </div>
  )}
</div>


{/* 🌱 Carbon Impact Dashboard */}
<div className="bg-gradient-to-br from-green-900/30 via-emerald-900/20 to-black border border-green-500/20 p-6 rounded-2xl shadow-lg mb-6">

  <div className="flex items-center justify-between mb-4">
    <div>
      <h2 className="text-xl font-semibold text-green-300">
        🌱 Carbon Impact Dashboard
      </h2>
      <p className="text-sm text-green-200/70">
        Renewable energy reduces grid-based carbon emissions.
      </p>
    </div>

    <span className="text-xs px-3 py-1 rounded-full bg-green-500/10 border border-green-400/30 text-green-200">
      Climate Positive
    </span>
  </div>

  {/* Personal Impact */}
  <div className="grid md:grid-cols-2 gap-6">

    <div className="bg-black/30 border border-green-400/20 rounded-xl p-5">
      <h3 className="text-lg font-semibold text-green-200 mb-3">
        👤 Your Impact
      </h3>

      {isProducer ? (
        <>
          <p className="text-sm text-green-100/80">
            You supplied <span className="font-bold text-white">{personalKwh} kWh</span> renewable energy.
          </p>
          <p className="mt-2 text-sm text-green-100/80">
            You avoided <span className="font-bold text-white">{personalCo2} kg CO₂</span>.
          </p>
        </>
      ) : (
        <>
          <p className="text-sm text-green-100/80">
            You supported <span className="font-bold text-white">{personalKwh} kWh</span> renewable energy.
          </p>
          <p className="mt-2 text-sm text-green-100/80">
            You reduced <span className="font-bold text-white">{personalCo2} kg CO₂</span>.
          </p>
        </>
      )}

      <div className="mt-4 grid grid-cols-2 gap-4">
        <div className="bg-green-900/30 border border-green-400/20 rounded-lg p-3 text-center">
          <p className="text-xs text-green-200/70">Trees Equivalent</p>
          <p className="text-lg font-bold text-green-300">{personalTrees}</p>
        </div>

        <div className="bg-green-900/30 border border-green-400/20 rounded-lg p-3 text-center">
          <p className="text-xs text-green-200/70">Car Travel Avoided</p>
          <p className="text-lg font-bold text-green-300">{personalKm} km</p>
        </div>
      </div>
    </div>

    {/* Global Impact */}
    <div className="bg-black/30 border border-green-400/20 rounded-xl p-5">
      <h3 className="text-lg font-semibold text-green-200 mb-3">
        🌍 Global Marketplace Impact
      </h3>

      <p className="text-sm text-green-100/80">
        Total Renewable Energy Traded:
      </p>
      <p className="text-2xl font-bold text-white mt-1">
        {globalKwh} kWh
      </p>

      <p className="mt-3 text-sm text-green-100/80">
        Total CO₂ Emissions Avoided:
      </p>
      <p className="text-2xl font-bold text-white mt-1">
        {globalCo2} kg
      </p>

      <div className="mt-4 grid grid-cols-2 gap-4">
        <div className="bg-green-900/30 border border-green-400/20 rounded-lg p-3 text-center">
          <p className="text-xs text-green-200/70">Trees Equivalent</p>
          <p className="text-lg font-bold text-green-300">{globalTrees}</p>
        </div>

        <div className="bg-green-900/30 border border-green-400/20 rounded-lg p-3 text-center">
          <p className="text-xs text-green-200/70">Car Travel Avoided</p>
          <p className="text-lg font-bold text-green-300">{globalKm} km</p>
        </div>
      </div>
    </div>

  </div>
</div>

        <div className="grid lg:grid-cols-3 gap-6">
          {/* Sell Card */}
          <div className="rounded-2xl border border-white/10 bg-white/5 p-6">
            <h2 className="text-lg font-semibold">Create Listing</h2>
            <p className="text-sm text-white/60 mt-1">
              Listing stays active until kWh remaining becomes 0.
            </p>

            <div className="mt-5 space-y-3">
              <div>
                <label className="text-xs text-white/60">Energy (kWh)</label>
                <input
                  className="mt-1 w-full rounded-xl bg-white/10 border border-white/15 px-3 py-2 text-white placeholder-white/40 outline-none focus:ring-2 focus:ring-white/20"
                  placeholder="e.g., 7"
                  value={sellKwh}
                  onChange={(e) => setSellKwh(e.target.value)}
                />
              </div>

              <div>
                <label className="text-xs text-white/60">
                  Price per kWh ({tokenSymbol})
                </label>
                <input
                  className="mt-1 w-full rounded-xl bg-white/10 border border-white/15 px-3 py-2 text-white placeholder-white/40 outline-none focus:ring-2 focus:ring-white/20"
                  placeholder="e.g., 2"
                  value={sellPricePerKwh}
                  onChange={(e) => setSellPricePerKwh(e.target.value)}
                />
                <p className="text-xs text-white/40 mt-1">
                  Buyer cost = kWh bought × pricePerKwh
                </p>
              </div>

              <button
                onClick={createListing}
                disabled={!account || isBusy}
                className="w-full rounded-xl bg-blue-600 px-4 py-2 font-semibold disabled:opacity-60"
              >
                {isBusy ? busyLabel : "Create On-chain Listing"}
              </button>

              {!account ? (
                <p className="text-xs text-white/50">Connect wallet to create listings.</p>
              ) : null}
            </div>
          </div>

          {/* Listings */}
          <div className="lg:col-span-2 rounded-2xl border border-white/10 bg-white/5 p-6">
            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 mb-4">
              <div>
                <h2 className="text-lg font-semibold">Marketplace Listings</h2>
                <p className="text-sm text-white/60">
                  Partial buy: choose kWh amount → approve (if needed) → buy.
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <button
                  onClick={fetchListings}
                  disabled={loadingListings || isBusy}
                  className="rounded-xl bg-white/10 border border-white/15 px-4 py-2 text-sm disabled:opacity-60"
                >
                  {loadingListings ? "Refreshing..." : "Refresh"}
                </button>

                <select
                  className="rounded-xl bg-white/10 border border-white/15 px-3 py-2 text-sm outline-none"
                  value={sortBy}
                  onChange={(e) => setSortBy(e.target.value)}
                >
                  <option value="new">Sort: Newest</option>
                  <option value="priceAsc">Price/kWh: Low → High</option>
                  <option value="priceDesc">Price/kWh: High → Low</option>
                  <option value="kwhAsc">Remaining: Low → High</option>
                  <option value="kwhDesc">Remaining: High → Low</option>
                </select>

                <button
                  onClick={() => setShowActiveOnly((s) => !s)}
                  className="rounded-xl bg-white/10 border border-white/15 px-3 py-2 text-sm"
                >
                  {showActiveOnly ? "Active only ✓" : "All listings"}
                </button>

                <button
                  onClick={() => setShowMineOnly((s) => !s)}
                  disabled={!account}
                  className="rounded-xl bg-white/10 border border-white/15 px-3 py-2 text-sm disabled:opacity-60"
                >
                  {showMineOnly ? "My listings ✓" : "My listings"}
                </button>
              </div>
            </div>

            {filtered.length === 0 ? (
              <div className="rounded-2xl border border-white/10 bg-black/20 p-8 text-center">
                <p className="text-white/70">No listings to show.</p>
                <p className="text-sm text-white/50 mt-1">Create one on the left, then refresh.</p>
              </div>
            ) : (
              <div className="grid md:grid-cols-2 gap-4">
                {filtered.map((L) => {
                  const isMine =
                    account && L.seller.toLowerCase() === account.toLowerCase();

                  return (
                    <div
                      key={L.id}
                      className="rounded-2xl border border-white/10 bg-black/20 p-5"
                    >
                      <div className="flex items-start justify-between">
                        <div>
                          <p className="text-sm text-white/60">Listing</p>
                          <p className="text-lg font-semibold">#{L.id}</p>
                        </div>
                        <span
                          className={[
                            "text-xs px-3 py-1 rounded-full border",
                            L.active
                              ? "border-green-500/30 bg-green-500/10 text-green-200"
                              : "border-white/10 bg-white/5 text-white/60",
                          ].join(" ")}
                        >
                          {L.active ? "Active" : "Inactive"}
                        </span>
                      </div>

                      <div className="mt-4 grid grid-cols-2 gap-3">
                        <div className="rounded-xl border border-white/10 bg-white/5 p-3">
                          <p className="text-xs text-white/60">Remaining</p>
                          <p className="font-semibold">{L.kwhRemaining} kWh</p>
                        </div>
                        <div className="rounded-xl border border-white/10 bg-white/5 p-3">
                          <p className="text-xs text-white/60">Price / kWh</p>
                          <p className="font-semibold">
                            {Number(L.pricePerKwhETK).toFixed(2)} {tokenSymbol}
                          </p>
                        </div>
                      </div>

                      <div className="mt-4 flex items-center justify-between gap-3">
                        <div>
                          <p className="text-xs text-white/60">Seller</p>
                          <a
                            className="font-mono text-sm underline underline-offset-4"
                            href={`${EXPLORER}/address/${L.seller}`}
                            target="_blank"
                            rel="noreferrer"
                          >
                            {shortAddr(L.seller)}
                          </a>
                          {isMine ? (
                            <span className="ml-2 text-xs text-green-300">(you)</span>
                          ) : null}
                        </div>

                        {/* Actions */}
                        {L.active && isMine ? (
                          <button
                            onClick={() => cancelListing(L.id)}
                            disabled={isBusy}
                            className="rounded-xl bg-red-600 px-4 py-2 font-semibold disabled:opacity-60"
                          >
                            {isBusy ? busyLabel : "Cancel"}
                          </button>
                        ) : L.active && !isMine ? (
                          <div className="flex items-center gap-2">
                            <input
                              className="w-24 rounded-xl bg-white/10 border border-white/15 px-3 py-2 text-sm outline-none"
                              placeholder="kWh"
                              value={buyKwhById[L.id] ?? ""}
                              onChange={(e) =>
                                setBuyKwhById((prev) => ({ ...prev, [L.id]: e.target.value }))
                              }
                            />
                            <button
                              onClick={() => approveAndBuyPartial(L)}
                              disabled={!account || isBusy}
                              className="rounded-xl bg-green-600 px-4 py-2 font-semibold disabled:opacity-60"
                            >
                              {isBusy ? busyLabel : "Buy"}
                            </button>
                          </div>
                        ) : (
                          <button
                            disabled
                            className="rounded-xl bg-gray-600 px-4 py-2 font-semibold opacity-60"
                          >
                            Inactive
                          </button>
                        )}
                      </div>

                      {!isMine && L.active ? (
                        <div className="mt-3 text-xs text-white/45">
                          Tip: enter kWh ≤ {L.kwhRemaining}
                        </div>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            )}

            <p className="text-xs text-white/40 mt-5">
              Note: first purchase may show 2 popups (approve → buy). Next time, only buy if allowance is enough.
            </p>
          </div>
        </div>
      </div>



      {/* Transaction History */}
<div className="mt-10 rounded-2xl border border-white/10 bg-white/5 p-6">
  <h2 className="text-xl font-semibold mb-4">Transaction History</h2>

  {transactions.length === 0 ? (
    <p className="text-gray-400">No transactions found.</p>
  ) : (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="border-b border-white/10 text-gray-400">
          <tr>
            <th className="text-left py-3">FROM</th>
            <th className="text-left py-3">TO</th>
            <th className="text-left py-3">ETK</th>
            <th className="text-left py-3">TXN HASH</th>
          </tr>
        </thead>
        <tbody>
          {transactions.map((tx, index) => (
            <tr key={index} className="border-b border-white/5">
              <td className="py-3 font-mono">
                {tx.from.slice(0, 6)}...{tx.from.slice(-4)}
              </td>
              <td className="py-3 font-mono">
                {tx.to.slice(0, 6)}...{tx.to.slice(-4)}
              </td>
              <td className="py-3">
                {Number(tx.value).toFixed(2)} ETK
              </td>
              <td className="py-3">
                <a
                  href={`https://sepolia.etherscan.io/tx/${tx.hash}`}
                  target="_blank"
                  rel="noreferrer"
                  className="text-blue-400 underline"
                >
                  {tx.hash.slice(0, 10)}...
                </a>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )}
</div>
      <div className="mt-10 flex justify-center">
  <button
    onClick={disconnectWallet}
    className="bg-red-600 hover:bg-red-700 px-6 py-3 rounded-xl font-semibold"
  >
    Disconnect Wallet
  </button>
</div>



    </div>
  );
}