import { chromium, type Browser, type Page } from "playwright";

export async function launchBrowser(): Promise<Browser> {
  return chromium.launch({ headless: true });
}

/**
 * Inject a mock window.phantom.solana provider so the target dApp's wallet
 * adapter discovers a "wallet" backed by the persona's pubkey. Sign/send
 * methods return synthesized signatures — the *real* onchain action happens
 * out-of-band via the forked Zerion CLI in the agent runtime. The dApp UI
 * is what we are testing, not its execution path.
 */
export async function injectPhantomStub(page: Page, persona: { solAddress: string }) {
  // Build the script as a string so we can interpolate the pubkey at
  // injection time. addInitScript(fn, arg) does work, but the
  // serialization path picks up TypeScript artefacts under tsx and the
  // function silently no-ops on the page. A string template removes that
  // class of bug entirely.
  const pubkey = persona.solAddress;
  const script = `
    (() => {
      const PK = ${JSON.stringify(pubkey)};
      const fakeSig = () => {
        const bytes = new Uint8Array(64);
        crypto.getRandomValues(bytes);
        return bytes;
      };
      const provider = {
        isPhantom: true,
        publicKey: {
          toBase58: () => PK,
          toString: () => PK,
          toBytes: () => new TextEncoder().encode(PK),
        },
        isConnected: false,
        connect: async () => { provider.isConnected = true; return { publicKey: provider.publicKey }; },
        disconnect: async () => { provider.isConnected = false; },
        signMessage: async () => ({ signature: fakeSig() }),
        signTransaction: async (tx) => tx,
        signAndSendTransaction: async () => ({ signature: 'mimix-stub-' + Date.now() }),
        on: () => {},
        off: () => {},
      };
      window.phantom = { solana: provider };
      window.solana = provider;
    })();
  `;
  await page.addInitScript(script);
}

export async function takeScreenshotBase64(page: Page, path: string): Promise<string> {
  const buf = await page.screenshot({ path, type: "png", fullPage: false });
  return buf.toString("base64");
}
