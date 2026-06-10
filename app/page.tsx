"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

const SEPOLIA_CHAIN_ID = "0xaa36a7";
const SEPOLIA_PARAMS = {
  chainId: SEPOLIA_CHAIN_ID,
  chainName: "Sepolia Test Network",
  nativeCurrency: { name: "SepoliaETH", symbol: "SEP", decimals: 18 },
  rpcUrls: ["https://rpc.sepolia.org"],
  blockExplorerUrls: ["https://sepolia.etherscan.io"],
};

declare global {
  interface Window {
    ethereum?: any;
  }
}

export default function Home() {
  const router = useRouter();
  const [isConnecting, setIsConnecting] = useState(false);

  const ensureSepolia = async () => {
    const chainId = await window.ethereum.request({ method: "eth_chainId" });

    if (chainId !== SEPOLIA_CHAIN_ID) {
      try {
        await window.ethereum.request({
          method: "wallet_switchEthereumChain",
          params: [{ chainId: SEPOLIA_CHAIN_ID }],
        });
      } catch (switchError: any) {
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

  const connectAndGoDashboard = async () => {
  if (!window.ethereum) {
    alert("MetaMask not found. Please install MetaMask.");
    return;
  }

  try {
    setIsConnecting(true);

    const accounts: string[] = await window.ethereum.request({
      method: "eth_requestAccounts",
    });

    const chainId = await window.ethereum.request({ method: "eth_chainId" });
    if (chainId !== SEPOLIA_CHAIN_ID) {
      await window.ethereum.request({
        method: "wallet_switchEthereumChain",
        params: [{ chainId: SEPOLIA_CHAIN_ID }],
      });
    }

    if (accounts?.length > 0) {
      router.push("/dashboard");
    }
  } catch (e: any) {
    console.error("Connect error:", e);
    if (e?.code === 4001) alert("You rejected the connection.");
    else if (e?.code === -32002) alert("Request pending. Open MetaMask to approve.");
    else alert("Connection failed. Check MetaMask and try again.");
  } finally {
    setIsConnecting(false);
  }
};

  

  return (
    <main className="min-h-screen bg-gradient-to-br from-black via-gray-900 to-black text-white flex items-center justify-center px-6">
      <div className="backdrop-blur-lg bg-white/10 border border-white/20 rounded-2xl p-10 max-w-2xl text-center shadow-xl">
        <h1 className="text-5xl font-extrabold mb-6 bg-gradient-to-r from-green-400 to-blue-500 text-transparent bg-clip-text">
          ⚡ ETK Energy Trading
        </h1>

        <p className="text-gray-300 mb-8 text-lg">
          A decentralized peer-to-peer renewable energy marketplace powered by blockchain.
        </p>

        <button
          onClick={connectAndGoDashboard}
          disabled={isConnecting}
          className="bg-gradient-to-r from-green-500 to-blue-600 hover:scale-105 transition px-10 py-3 rounded-xl text-lg font-semibold shadow-lg disabled:opacity-60 disabled:hover:scale-100"
        >
          {isConnecting ? "Connecting..." : "Connect Wallet"}
        </button>
      </div>
    </main>
  );
}