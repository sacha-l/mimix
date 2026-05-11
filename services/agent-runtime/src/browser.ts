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
  await page.addInitScript(({ pubkey }) => {
    const fakeSig = () => {
      const bytes = new Uint8Array(64);
      crypto.getRandomValues(bytes);
      return bytes;
    };
    const provider = {
      isPhantom: true,
      publicKey: {
        toBase58: () => pubkey,
        toString: () => pubkey,
        toBytes: () => new TextEncoder().encode(pubkey),
      },
      isConnected: false,
      connect: async () => {
        provider.isConnected = true;
        return { publicKey: provider.publicKey };
      },
      disconnect: async () => {
        provider.isConnected = false;
      },
      signMessage: async (_msg: Uint8Array) => ({ signature: fakeSig() }),
      signTransaction: async (tx: any) => tx,
      signAndSendTransaction: async (_tx: any) => ({ signature: "mimix-stub-" + Date.now() }),
      on: (_evt: string, _cb: any) => {},
      off: (_evt: string, _cb: any) => {},
    };
    (window as any).phantom = { solana: provider };
    (window as any).solana = provider;
  }, { pubkey: persona.solAddress });
}

export async function takeScreenshotBase64(page: Page, path: string): Promise<string> {
  const buf = await page.screenshot({ path, type: "png", fullPage: false });
  return buf.toString("base64");
}
