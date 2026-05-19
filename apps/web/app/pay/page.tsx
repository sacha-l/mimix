"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Connection,
  PublicKey,
  Transaction,
} from "@solana/web3.js";
import {
  createTransferInstruction,
  getAssociatedTokenAddress,
  getAccount,
  TokenAccountNotFoundError,
} from "@solana/spl-token";

type PhantomProvider = {
  isPhantom: boolean;
  publicKey: { toString(): string } | null;
  connect: () => Promise<{ publicKey: { toString(): string } }>;
  disconnect: () => Promise<void>;
  signTransaction: (tx: Transaction) => Promise<Transaction>;
  signAndSendTransaction: (tx: Transaction) => Promise<{ signature: string }>;
};

function getPhantom(): PhantomProvider | null {
  const w = window as any;
  // Strict: only accept window.phantom.solana. window.solana is a shared
  // surface that other wallets (Backpack, Glow, etc.) fake-implement to
  // appear drop-in compatible — calling .connect() on those returns
  // "Unexpected error" because the call signature is subtly different.
  const p = w.phantom?.solana;
  if (p?.isPhantom) return p;
  return null;
}

function describeWalletEnv(): string {
  const w = window as any;
  const parts: string[] = [];
  if (w.phantom?.solana?.isPhantom) parts.push("window.phantom.solana=Phantom");
  else if (w.phantom) parts.push("window.phantom=present-but-no-solana");
  if (w.solana) parts.push(`window.solana(isPhantom=${!!w.solana.isPhantom})`);
  if (w.solflare) parts.push("Solflare");
  if (w.backpack) parts.push("Backpack");
  if (w.glow) parts.push("Glow");
  return parts.length ? parts.join(" · ") : "no Solana wallet detected";
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
        target_kind: pending.targetKind,
        personas: pending.personas,
        payment_signature: signature,
        payment_verified: verified,
        requester_email: pending.email,
        goal: pending.goal,
      }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "create_run_failed");
    localStorage.removeItem("mimix.pending_run");
    router.push(`/run/${data.run_id}`);
  };

  const handleConnect = async (opts: { reset?: boolean } = {}) => {
    setError(null);
    setBusy("connect");
    try {
      const p = getPhantom();
      if (!p) {
        throw new Error(`Phantom not detected. Wallet env: ${describeWalletEnv()}`);
      }
      // Clear any stale connection from a previous session — Phantom's
      // "Unexpected error" on connect is often caused by a stuck pending
      // request from an earlier failed connect.
      if (opts.reset || (p as any).isConnected) {
        try { await p.disconnect(); } catch {}
      }
      const res = await p.connect();
      setUserPubkey(res.publicKey.toString());
    } catch (e: any) {
      const code = e?.code ?? e?.error?.code;
      const msg = e?.message || "";
      if (code === 4001 || /user rejected/i.test(msg)) {
        setError("Connection cancelled in Phantom.");
      } else if (/unexpected error/i.test(msg)) {
        const origin = typeof window !== "undefined" ? window.location.origin : "";
        const usingIp = origin.includes("127.0.0.1");
        setError(
          `Phantom returned "Unexpected error" on connect. Try these in order:\n` +
          (usingIp
            ? `1. You are on ${origin} — switch to http://localhost:3000 (link above).\n`
            : "") +
          `1. Click the Phantom extension icon — if you see a password screen, unlock it.\n` +
          `2. Check the Chrome address bar for a 🚫 popup-blocked icon — allow popups for this site.\n` +
          `3. Click "Reset & retry connect" below (force-disconnects any stuck session).\n` +
          `4. Open the Phantom extension and look for a pending request — approve or dismiss it.\n` +
          `5. Reload the page (⌘R / Ctrl+R) and try again.\n` +
          `6. Paste this in DevTools console and report the output:\n` +
          `   await window.phantom.solana.connect().catch(e => JSON.stringify(e, Object.getOwnPropertyNames(e)))\n` +
          `Wallet env: ${describeWalletEnv()}.`,
        );
      } else {
        setError(`connect_failed: ${msg || JSON.stringify(e)} (env: ${describeWalletEnv()})`);
      }
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

      // Preflight 1: confirm sender has a USDG account on devnet with enough
      // balance. If not, auto-call the faucet and continue.
      let senderBalance = 0;
      try {
        const acct = await getAccount(conn, senderAta);
        senderBalance = Number(acct.amount) / 10 ** USDG_DECIMALS;
      } catch (err) {
        if (!(err instanceof TokenAccountNotFoundError)) throw err;
      }

      if (senderBalance < amount) {
        setBusy("faucet_auto");
        const fr = await fetch("/api/faucet", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ pubkey: userPubkey }),
        });
        const fd = await fr.json();
        if (!fr.ok) throw new Error(`faucet_auto_failed:${fd.error || "unknown"}`);
        setFaucetResult({ sol: fd.sol?.signature, usdg: fd.usdg?.signature });
        // Wait a beat for the new USDG balance to settle on RPC.
        await new Promise((r) => setTimeout(r, 2000));
        setBusy("pay");
      }

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

      // Sign only via Phantom, then broadcast via our own devnet connection.
      // signTransaction bypasses Phantom's "network mismatch" check, so the
      // user can pay even if Phantom is set to mainnet — the tx still
      // lands on devnet because we control the broadcast RPC.
      let signedTx: Transaction;
      try {
        signedTx = await p.signTransaction(tx);
      } catch (e: any) {
        const code = e?.code ?? e?.error?.code;
        if (code === 4001 || /user rejected/i.test(e?.message || "")) {
          throw new Error("user_rejected_in_phantom");
        }
        throw new Error(`phantom_sign_failed: ${e?.message || JSON.stringify(e)}`);
      }

      let signature: string;
      try {
        signature = await conn.sendRawTransaction(signedTx.serialize(), {
          skipPreflight: false,
          preflightCommitment: "confirmed",
        });
      } catch (e: any) {
        // Surface preflight errors verbatim — they're the most useful.
        const logs = e?.logs?.join("\n") || "";
        throw new Error(`broadcast_failed: ${e?.message || e}${logs ? "\nlogs:\n" + logs : ""}`);
      }

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

      {typeof window !== "undefined" && window.location.hostname === "127.0.0.1" && (
        <div className="bg-red-50 border border-red-300 rounded-xl p-4 mb-4 text-sm text-red-900">
          <strong>Phantom won't connect from 127.0.0.1.</strong>{" "}
          Open this URL instead:{" "}
          <a
            className="underline font-mono font-semibold"
            href={`http://localhost:3000${typeof window !== "undefined" ? window.location.pathname : ""}`}
          >
            http://localhost:3000{typeof window !== "undefined" ? window.location.pathname : ""}
          </a>
          . You'll need to redo /register → /personas → /pay because localStorage doesn't carry across origins.
        </div>
      )}

      {phantomDetected === false && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 mb-4 text-sm text-amber-900">
          <strong>No Phantom detected.</strong> Install{" "}
          <a className="underline" href="https://phantom.app" target="_blank" rel="noreferrer">phantom.app</a>{" "}
          and switch the network to <strong>Devnet</strong> in Settings → Developer Mode.
        </div>
      )}

      {phantomDetected && !userPubkey && (
        <>
          <button
            onClick={() => handleConnect()}
            disabled={busy !== null}
            data-testid="connect-phantom"
            className="w-full bg-purple-600 hover:bg-purple-700 text-white py-3 rounded-lg font-semibold mb-2 disabled:opacity-50"
          >
            {busy === "connect" ? "Connecting…" : "Connect Phantom (Devnet)"}
          </button>
          {error && /unexpected error/i.test(error) && (
            <button
              onClick={() => handleConnect({ reset: true })}
              disabled={busy !== null}
              className="w-full text-xs underline text-slate-500 mb-4"
            >
              Reset & retry connect (force-disconnect any stuck session)
            </button>
          )}
        </>
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

      {error && <div className="mt-4 text-sm text-red-600 font-mono whitespace-pre-line">{error}</div>}
    </div>
  );
}
