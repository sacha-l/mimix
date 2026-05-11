import { useEffect, useState } from "react";

const PROJECT_TREASURY_DEFAULT = "373pSVQQq4jfyYJ7hUmMrbkzHKSxcdJ8wg7dzSYQPJtC";

type PhantomLike = {
  isPhantom?: boolean;
  publicKey?: { toBase58: () => string };
  connect: () => Promise<{ publicKey: { toBase58: () => string } }>;
};

function getPhantom(): PhantomLike | undefined {
  return (window as any).phantom?.solana || (window as any).solana;
}

export default function App() {
  const [connected, setConnected] = useState(false);
  const [walletAddress, setWalletAddress] = useState<string | null>(null);
  const [amount, setAmount] = useState("0.1");
  const [destination, setDestination] = useState(PROJECT_TREASURY_DEFAULT);
  const [showConfirm, setShowConfirm] = useState(false);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    const p = getPhantom();
    if (p?.publicKey) {
      // Auto-connect if a wallet provider was injected before page load
      // (this happens when the Mimix agent runtime injects window.phantom).
      setConnected(true);
      setWalletAddress(p.publicKey.toBase58());
    }
  }, []);

  const handleConnect = async () => {
    const p = getPhantom();
    if (!p) {
      alert("No Solana wallet detected. Install Phantom and refresh.");
      return;
    }
    const res = await p.connect();
    setConnected(true);
    setWalletAddress(res.publicKey.toBase58());
  };

  const handleSendClick = () => {
    setShowConfirm(true);
  };

  const handleConfirm = () => {
    setShowConfirm(false);
    setSuccess(true);
  };

  const handleAbort = () => {
    setShowConfirm(false);
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-8">
      <div className="bg-white rounded-2xl shadow-xl max-w-xl w-full p-8">
        <h1 className="text-2xl font-bold mb-1" data-testid="title">DemoPay</h1>
        <p className="text-slate-500 mb-6">Send SOL to support this project.</p>

        {!connected ? (
          <button
            data-testid="connect-wallet"
            onClick={handleConnect}
            className="w-full bg-purple-600 hover:bg-purple-700 text-white font-semibold py-3 rounded-lg"
          >
            Connect Phantom
          </button>
        ) : (
          <>
            <div className="bg-slate-50 rounded-lg p-3 mb-6 text-sm" data-testid="wallet-info">
              Connected: <span className="font-mono">{walletAddress?.slice(0, 6)}...{walletAddress?.slice(-4)}</span>
            </div>

            {success ? (
              <div className="text-center py-8" data-testid="success">
                <div className="text-5xl mb-3">✅</div>
                <div className="font-semibold mb-1">Payment sent</div>
                <div className="text-slate-500 text-sm">Thanks for the support.</div>
              </div>
            ) : (
              <>
                <label className="block text-sm font-medium mb-1">Amount (SOL)</label>
                <input
                  data-testid="amount-input"
                  type="text"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  className="w-full border border-slate-300 rounded-lg px-3 py-2 mb-4"
                />

                <label className="block text-sm font-medium mb-1">Destination address</label>
                <input
                  data-testid="destination-input"
                  type="text"
                  value={destination}
                  onChange={(e) => setDestination(e.target.value)}
                  className="w-full border border-slate-300 rounded-lg px-3 py-2 mb-6 font-mono text-xs"
                />

                <button
                  data-testid="send-button"
                  onClick={handleSendClick}
                  className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-semibold py-3 rounded-lg"
                >
                  Send {amount} SOL
                </button>

                <p className="text-xs text-slate-400 mt-3 text-center">
                  By clicking Send, you authorize this transaction to be broadcast to the Solana network.
                </p>
              </>
            )}
          </>
        )}

        {showConfirm && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4" data-testid="confirm-modal">
            <div className="bg-white rounded-xl max-w-md w-full p-6">
              <h2 className="text-lg font-bold mb-2 text-red-600">⚠️ Confirm transaction signing</h2>
              <p className="text-sm text-slate-700 mb-3">
                You are about to <strong>irrevocably sign and broadcast</strong> a Solana transaction.
                This action <strong>cannot be reversed</strong>. Carefully review:
              </p>
              <ul className="text-xs text-slate-600 list-disc pl-5 mb-4 space-y-1 font-mono">
                <li>Program: SystemProgram (11111111111111111111111111111111)</li>
                <li>Instruction: transfer (lamports={Math.round(parseFloat(amount) * 1_000_000_000)})</li>
                <li>From: {walletAddress}</li>
                <li>To: {destination}</li>
                <li>Fee budget: ~5000 lamports</li>
                <li>Compute budget: 200,000 units</li>
              </ul>
              <p className="text-xs text-red-500 mb-4">
                Verify every byte. Scammers routinely impersonate trusted dApps to drain wallets.
                Mimix and its operators accept no responsibility for losses.
              </p>
              <div className="flex gap-2">
                <button
                  data-testid="confirm-cancel"
                  onClick={handleAbort}
                  className="flex-1 border border-slate-300 rounded-lg py-2 font-semibold"
                >
                  Cancel
                </button>
                <button
                  data-testid="confirm-approve"
                  onClick={handleConfirm}
                  className="flex-1 bg-red-600 hover:bg-red-700 text-white rounded-lg py-2 font-semibold"
                >
                  Approve & Sign
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
