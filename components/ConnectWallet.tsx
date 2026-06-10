"use client";

import { useState } from "react";
import { ethers } from "ethers";

export default function ConnectWallet() {
  const [account, setAccount] = useState("");

  const connectWallet = async () => {
  console.log("Button clicked");

  try {
    if (!(window as any).ethereum) {
      alert("Install MetaMask");
      return;
    }

    const accounts = await (window as any).ethereum.request({
      method: "eth_requestAccounts",
    });

    const addr = accounts[0];
    console.log("Accounts:", accounts);

    // ✅ First connected wallet becomes Producer (House A)
    if (!localStorage.getItem("ETK_PRODUCER")) {
      localStorage.setItem("ETK_PRODUCER", addr);
      console.log("✅ ETK_PRODUCER set:", addr);
    }

    setAccount(addr);

  } catch (error) {
    console.error("MetaMask error:", error);
  }
};

  return (
    <div>
      {account ? (
        <p className="text-green-500">
          Connected: {account.slice(0, 6)}...
        </p>
      ) : (
        <button
          onClick={connectWallet}
          className="bg-blue-600 px-4 py-2 rounded-lg text-white"
        >
          Connect Wallet
        </button>
      )}
    </div>
  );
}