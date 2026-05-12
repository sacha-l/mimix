"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Connection,
  PublicKey,
  Transaction,
  clusterApiUrl,
} from "@solana/web3.js";
import {
  createTransferInstruction,
  getAssociatedTokenAddress,
} from "@solana/spl-token";

type PhantomProvider = {
  isPhantom: boolean;
  publicKey: { toString(): string } | null;
  connect: () => Promise<{ publicKey: { toString(): string } }>;
  disconnect: () => Promise<void>;
  signAndSendTransaction: (tx: Transaction) => Promise<{ signature: string }>;
};

function getPhantom(): PhantomProvider | null {
  const w = window as any;
  const p = w.phantom?.solana || w.solana;
  if (p?.isPhantom) return p;
  return null;
}

const USDG_DECIMALS = 6;
const RPC_URL = "https://api.devnet.solana.com";

export default function PayPage() {
  const router = useRouter();
  const [pending, setPending] = useState<any>(null);
  const [phantomDetected, setPhantomDetected] = useState<boolean | null>(null);
  const [userPubkey, setUserPubkey] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [faucetResult, setFaucetResult] = useState<{ sol?: string; usdg?: string } | null>(null);

  const debugMode = process.env.NEXT_PUBLIC_DEBUG_MODE === "true";
  const treasuryPubkey = process.env.NEXT_PUBLIC_TREASURY_PUBKEY || "";
  const usdgMint = process.env.NEXT_PUBLIC_USDG_MINT || "";

  useEffect(() => {
    const cached = localStorage.getItem("mimix.pending_run");
    if (cached) { try { setPending(JSON.parse(cached)); } catch {} }
    // Phantom can inject after page load — give it a moment then detect.
    const detect = () => {
      const p = getPhantom();
      setPhantomDetected(!!p);
      if (p?.publicKey) setUserPubkey(p.publicKey.toString());
    };
    detect();
    const t = setTimeout(detect, 800);
    return () => clearTimeout(t);
  }, []);

  if (!pending) {
    return <div>No pending run found. <a href="/register" className="underline">Start over</a>.</div>;
  }

  const amount = (pending.personas?.length ?? 0) * 5;

  const startRun = async (signature: string, verified: boolean) => {
    const res = await fetch("/api/runs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        target_dapp_url: pending.url,
        target_name: pending.name,
        target_description: pending.description,
        personas: pending.personas,
        payment_signature: signature,
        payment_verified: verified,
      }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "create_run_failed");
    localStorage.removeItem("mimix.pending_run");
    router.push(`/run/${data.run_id}`);
  };

  const handleConnect = async () => {
    setError(null);
    setBusy("connect");
    try {
      const p = getPhantom();
      if (!p) throw new Error("Phantom not found");
      const res = await p.connect();
      setUserPubkey(res.publicKey.toString());
    } catch (e: any) {
      setError(e.message || "connect_failed");
    } finally {
      setBusy(null);
    }
  };

  const handleFaucet = async () => {
    if (!userPubkey) return;
    setError(null);
    setBusy("faucet");
    try {
      const res = await fetch("/api/faucet", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pubkey: userPubkey }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "faucet_failed");
      setFaucetResult({ sol: data.sol?.signature, usdg: data.usdg?.signature });
    } catch (e: any) {
      setError(e.message || "faucet_failed");
    } finally {
      setBusy(null);
    }
  };

  const handlePay = async () => {
    if (!userPubkey || !treasuryPubkey || !usdgMint) {
      setError("missing_config");
      return;
    }
    setError(null);
    setBusy("pay");
    try {
      const p = getPhantom();
      if (!p) throw new Error("Phantom not found");

      const mint = new PublicKey(usdgMint);
      const sender = new PublicKey(userPubkey);
      const recipient = new PublicKey(treasuryPubkey);

      const senderAta = await getAssociatedTokenAddress(mint, sender);
      const recipientAta = await getAssociatedTokenAddress(mint, recipient);

      const conn = new Connection(RPC_URL, "confirmed");

      const tx = new Transaction().add(
        createTransferInstruction(
          senderAta,
          recipientAta,
          sender,
          BigInt(Math.round(amount * 10 ** USDG_DECIMALS)),
        ),
      );

      const { blockhash, lastValidBlockHeight } = await conn.getLatestBlockhash("confirmed");
      tx.recentBlockhash = blockhash;
      tx.feePayer = sender;

      const { signature } = await p.signAndSendTransaction(tx);

      // Wait for confirmation, then verify server-side.
      await conn.confirmTransaction(
        { signature, blockhash, lastValidBlockHeight },
        "confirmed",
      );

      const verifyRes = await fetch("/api/pay/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ signature, expected_amount_usdg: amount }),
      });
      const verifyData = await verifyRes.json();
      if (!verifyData.verified) {
        throw new Error(`verification_failed:${verifyData.reason || "unknown"}`);
      }

      await startRun(signature, true);
    } catch (e: any) {
      setError(e.message || "pay_failed");
    } finally {
      setBusy(null);
    }
  };

  const handleSkip = async () => {
    setError(null);
    setBusy("skip");
    try {
      await startRun("debug-skip", false);
    } catch (e: any) {
      setError(e.message);
      setBusy(null);
    }
  };

  return (
    <div className="max-w-xl">
      <h1 className="text-3xl font-bold mb-2">Pay with USDG</h1>
      <p className="text-slate-600 mb-8">
        Solana devnet. ${amount} USDG total for {pending.personas?.length} persona{pending.personas?.length === 1 ? "" : "s"}.
      </p>

      <div className="bg-white border border-slate-200 rounded-xl p-6 mb-6">
        <div className="text-sm text-slate-500 mb-1">Treasury address</div>
        <div className="font-mono text-xs break-all bg-slate-50 p-2 rounded mb-4" data-testid="treasury-address">
          {treasuryPubkey || "(set TREASURY_PUBKEY in .env.local)"}
        </div>
        <div className="text-sm text-slate-500 mb-1">USDG mint</div>
        <div className="font-mono text-xs break-all bg-slate-50 p-2 rounded mb-4" data-testid="usdg-mint">
          {usdgMint || "(set USDG_MINT in .env.local)"}
        </div>
        <div className="text-sm text-slate-500 mb-1">Required amount</div>
        <div className="text-2xl font-semibold">{amount} USDG</div>
      </div>

      {phantomDetected === false && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 mb-4 text-sm text-amber-900">
          <strong>No Phantom detected.</strong> Install{" "}
          <a className="underline" href="https://phantom.app" target="_blank" rel="noreferrer">phantom.app</a>{" "}
          and switch the network to <strong>Devnet</strong> in Settings → Developer Mode.
        </div>
      )}

      {phantomDetected && !userPubkey && (
        <button
          onClick={handleConnect}
          disabled={busy !== null}
          data-testid="connect-phantom"
          className="w-full bg-purple-600 hover:bg-purple-700 text-white py-3 rounded-lg font-semibold mb-4 disabled:opacity-50"
        >
          {busy === "connect" ? "Connecting…" : "Connect Phantom (Devnet)"}
        </button>
      )}

      {userPubkey && (
        <>
          <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-3 mb-4 text-xs">
            Connected: <span className="font-mono">{userPubkey.slice(0, 8)}…{userPubkey.slice(-6)}</span>
            <div className="text-emerald-700 mt-1">
              ⚠️ Make sure Phantom is set to <strong>Devnet</strong> (Settings → Developer Mode → Solana → Devnet).
            </div>
          </div>

          <button
            onClick={handleFaucet}
            disabled={busy !== null}
            data-testid="faucet"
            className="w-full border border-slate-300 hover:border-slate-400 py-3 rounded-lg font-semibold mb-3 disabled:opacity-50"
          >
            {busy === "faucet" ? "Funding…" : "Top up devnet USDG (faucet)"}
          </button>

          {faucetResult && (
            <div className="bg-slate-50 border border-slate-200 rounded-lg p-3 mb-3 text-xs">
              <div className="font-medium mb-1">Faucet sent ✓</div>
              <div className="space-y-1 font-mono">
                {faucetResult.sol && (
                  <a className="text-blue-600 underline block truncate"
                     href={`https://solscan.io/tx/${faucetResult.sol}?cluster=devnet`}
                     target="_blank" rel="noreferrer">
                    SOL: {faucetResult.sol}
                  </a>
                )}
                {faucetResult.usdg && (
                  <a className="text-blue-600 underline block truncate"
                     href={`https://solscan.io/tx/${faucetResult.usdg}?cluster=devnet`}
                     target="_blank" rel="noreferrer">
                    USDG: {faucetResult.usdg}
                  </a>
                )}
              </div>
            </div>
          )}

          <button
            onClick={handlePay}
            disabled={busy !== null}
            data-testid="pay"
            className="w-full bg-slate-900 hover:bg-slate-800 text-white py-3 rounded-lg font-semibold mb-3 disabled:opacity-50"
          >
            {busy === "pay" ? "Building tx…" : `Pay ${amount} USDG with Phantom`}
          </button>
        </>
      )}

      {debugMode && (
        <button
          onClick={handleSkip}
          disabled={busy !== null}
          data-testid="skip-payment"
          className="w-full bg-transparent border border-dashed border-slate-300 text-slate-600 py-2 rounded-lg text-sm hover:border-slate-400 disabled:opacity-50"
        >
          {busy === "skip" ? "Starting…" : "Skip payment (debug only)"}
        </button>
      )}

      {error && <div className="mt-4 text-sm text-red-600 font-mono">{error}</div>}
    </div>
  );
}
