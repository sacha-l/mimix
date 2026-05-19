import Anthropic from "@anthropic-ai/sdk";
import type { LivePersona, TargetKind } from "@mimix/persona-types";

// Model is a per-run cost lever: Sonnet 4.6 is the cost-effective default
// (Standard tier); set MIMIX_MODEL=claude-opus-4-7 for the Pro tier.
const MODEL = process.env.MIMIX_MODEL || "claude-sonnet-4-6";
const MAX_TOKENS_PER_TURN = 1024;

export type LlmAction =
  | { type: "click"; selector: string; reasoning: string }
  | { type: "type"; selector: string; value: string; reasoning: string }
  | { type: "send"; send_amount_sol: number; send_to: string; reasoning: string }
  | { type: "view"; reasoning: string }
  | { type: "connect_wallet"; reasoning: string }
  | { type: "sign"; reasoning: string }
  | { type: "abandon"; abandon_reason: string; reasoning: string }
  | { type: "complete"; reasoning: string };

export type LlmTurnInput = {
  screenshotBase64: string;
  recentActions: { action: string; selector?: string; reasoning?: string }[];
  policyBudget: {
    spent_so_far_usd: number;
    max_total_usd: number;
    session_elapsed_ms: number;
    session_max_ms: number;
  };
  lastBlock?: string;
};

const ACT_TOOL = {
  name: "act",
  description:
    "Choose one action to take in the dApp under test. Use 'click' or 'type' to interact with UI. " +
    "Use 'send' to execute a real onchain SOL transfer (only when the persona has decided to complete a payment). " +
    "Use 'abandon' if the dApp's UX is confusing or unsafe per the persona's standards. " +
    "Use 'complete' when the persona's journey goal has been achieved.",
  input_schema: {
    type: "object" as const,
    properties: {
      action: {
        type: "string",
        enum: ["click", "type", "send", "view", "connect_wallet", "sign", "abandon", "complete"],
      },
      selector: {
        type: "string",
        description: "CSS selector for click/type. Prefer [data-testid=...] selectors.",
      },
      value: { type: "string", description: "Value to type (for action=type)." },
      send_amount_sol: { type: "number", description: "SOL amount for action=send." },
      send_to: { type: "string", description: "Base58 destination address for action=send." },
      reasoning: {
        type: "string",
        description: "Short first-person justification in the persona's voice.",
      },
      abandon_reason: {
        type: "string",
        description: "Required if action=abandon. Short slug like 'signing_dialog_complex'.",
      },
    },
    required: ["action", "reasoning"],
  },
};

export class LlmClient {
  private client: Anthropic;
  private system: string;
  public totalInputTokens = 0;
  public totalOutputTokens = 0;
  public totalCachedTokens = 0;
  private fakeScript: LlmAction[] | null = null;
  private fakeIndex = 0;
  private personaId: string;

  constructor(
    persona: LivePersona,
    public targetUrl: string,
    opts: { apiKey?: string; targetKind?: TargetKind; goal?: string } = {},
  ) {
    const key = opts.apiKey || process.env.ANTHROPIC_API_KEY;
    this.personaId = persona.id;
    // Auto-enable scripted mode when no API key is configured. Action
    // sequences and observation text are hand-authored per persona (see
    // PERSONA_SCRIPTS / PERSONA_OBSERVATIONS below) so the demo produces
    // differentiated, persona-voice findings without burning tokens.
    // Set ANTHROPIC_API_KEY (and leave MIMIX_FAKE_LLM unset) for true
    // persona-driven exploration.
    const useFake = process.env.MIMIX_FAKE_LLM === "1" || !key;
    this.client = new Anthropic({ apiKey: key || "fake" });
    this.system = buildSystemPrompt(persona, targetUrl, opts.targetKind || "solana", opts.goal);
    if (useFake) {
      this.fakeScript = buildFakeScript(persona);
    }
  }

  async nextAction(input: LlmTurnInput): Promise<LlmAction> {
    if (this.fakeScript) {
      const next = this.fakeScript[this.fakeIndex++];
      if (!next) {
        return {
          type: "complete",
          reasoning: "scripted agent: exhausted action list",
        };
      }
      return next;
    }
    const userText = [
      `Recent actions (last ${input.recentActions.length}):`,
      ...input.recentActions.map((a, i) =>
        `  ${i + 1}. ${a.action}${a.selector ? ` ${a.selector}` : ""}${a.reasoning ? ` // ${a.reasoning}` : ""}`,
      ),
      ``,
      `Policy budget: $${input.policyBudget.spent_so_far_usd.toFixed(2)} / $${input.policyBudget.max_total_usd} spent. ` +
        `${Math.round(input.policyBudget.session_elapsed_ms / 1000)}s / ${Math.round(input.policyBudget.session_max_ms / 1000)}s elapsed.`,
      input.lastBlock ? `\nLast turn was blocked by policy: ${input.lastBlock}. Pick a different action.` : "",
      ``,
      `Look at the current screenshot. Choose ONE action using the 'act' tool.`,
    ].join("\n");

    const response = await this.client.messages.create({
      model: MODEL,
      max_tokens: MAX_TOKENS_PER_TURN,
      system: [
        { type: "text", text: this.system, cache_control: { type: "ephemeral" } },
      ],
      tools: [ACT_TOOL],
      tool_choice: { type: "tool", name: "act" },
      messages: [
        {
          role: "user",
          content: [
            {
              type: "image",
              source: { type: "base64", media_type: "image/png", data: input.screenshotBase64 },
            },
            { type: "text", text: userText },
          ],
        },
      ],
    });

    this.totalInputTokens += response.usage.input_tokens;
    this.totalOutputTokens += response.usage.output_tokens;
    this.totalCachedTokens += (response.usage as any).cache_read_input_tokens || 0;

    const toolBlock = response.content.find((c) => c.type === "tool_use");
    if (!toolBlock || toolBlock.type !== "tool_use") {
      throw new Error(`No tool use in response: ${JSON.stringify(response.content)}`);
    }
    return toolBlock.input as LlmAction;
  }

  async askObservations(transcript: string): Promise<string[]> {
    if (this.fakeScript) {
      return pickFakeObservations(this.personaId);
    }
    const response = await this.client.messages.create({
      model: MODEL,
      max_tokens: 512,
      system: this.system,
      messages: [
        {
          role: "user",
          content:
            `Your session has ended. Write 3-5 short qualitative observations about the dApp ` +
            `in your persona's first-person voice. Return them as a JSON array of strings, ` +
            `no other commentary.\n\nTranscript:\n${transcript}`,
        },
      ],
    });

    const text = response.content
      .filter((c) => c.type === "text")
      .map((c: any) => c.text)
      .join("\n");

    // Extract JSON array
    const match = text.match(/\[[\s\S]*\]/);
    if (!match) return [text.trim()].filter(Boolean);
    try {
      const arr = JSON.parse(match[0]);
      if (Array.isArray(arr)) return arr.map(String);
    } catch {
      // fall through
    }
    return [text.trim()];
  }
}

function buildSystemPrompt(
  persona: LivePersona,
  targetUrl: string,
  targetKind: TargetKind,
  goal?: string,
): string {
  const isSolana = targetKind === "solana";
  // Solana runs follow the persona's hand-authored crypto journey; web runs
  // follow the customer's stated goal captured at registration.
  const journey = isSolana
    ? persona.journey_goal
    : goal && goal.trim()
      ? goal.trim()
      : "Explore the app and try to complete its main user flow.";

  const lines = [
    isSolana
      ? `You are ${persona.display_name}, a Solana user testing a dApp at ${targetUrl}.`
      : `You are ${persona.display_name}, a user testing a web app at ${targetUrl}.`,
    ``,
    `BEHAVIOR PROFILE:`,
    `  Patience score: ${persona.behavior.patience_score}/10`,
    `  Technical skill: ${persona.behavior.technical_skill}/10`,
    `  Risk tolerance: ${persona.behavior.risk_tolerance}/10`,
    `  Reads warnings carefully: ${persona.behavior.reads_warnings}`,
    `  Abandonment triggers: ${persona.behavior.abandonment_triggers.join(", ")}`,
    ``,
    `POLICY (you will be blocked if you violate these):`,
    `  Allowed actions: ${persona.policy.allowed_actions.join(", ")}`,
    `  Forbidden actions: ${persona.policy.forbidden_actions.join(", ")}`,
    `  Session limit: ${persona.policy.session_duration_min} minutes`,
    ``,
    `JOURNEY GOAL:`,
    journey,
    ``,
    `INSTRUCTIONS:`,
    `- Stay in character. Reason in the persona's first-person voice.`,
    `- Choose ONE action per turn using the 'act' tool.`,
    `- Prefer [data-testid=...] selectors for click/type; otherwise use clear CSS selectors.`,
  ];
  if (isSolana) {
    lines.push(
      `- For 'send' actions, supply send_amount_sol and send_to. The runtime will execute the SOL transfer through the forked Zerion CLI; you do not need to click a Confirm button afterwards.`,
    );
  } else {
    lines.push(
      `- This is a normal web app — there is no crypto wallet. Do not use the 'send' action.`,
    );
  }
  lines.push(
    `- Abandon if your persona would genuinely give up (use abandon_reason from your abandonment_triggers list when possible).`,
    `- Mark 'complete' when the journey goal is achieved.`,
  );
  return lines.join("\n");
}

/**
 * Persona-specific scripted action sequences used when MIMIX_FAKE_LLM=1 is set
 * (or when ANTHROPIC_API_KEY is absent). Hand-authored so each persona's
 * behaviour shows through: Nora abandons at the scary modal, Walter completes
 * a careful single tx, Dan rapid-fires three sends and hits the turn cap.
 * Every persona still produces real Zerion-routed onchain txs on devnet.
 */
function buildFakeScript(persona: LivePersona): LlmAction[] {
  const TREASURY = process.env.TREASURY_PUBKEY || "373pSVQQq4jfyYJ7hUmMrbkzHKSxcdJ8wg7dzSYQPJtC";
  const script = PERSONA_SCRIPTS[persona.id];
  if (script) return script(TREASURY);
  // Fallback: generic 4-step send.
  return [
    { type: "click", selector: "[data-testid=connect-wallet]", reasoning: "Connect first." },
    { type: "type", selector: "[data-testid=amount-input]", value: "0.005", reasoning: "Small amount." },
    { type: "send", send_amount_sol: 0.005, send_to: TREASURY, reasoning: "Sending." },
    { type: "complete", reasoning: "Done." },
  ];
}

const PERSONA_SCRIPTS: Record<string, (treasury: string) => LlmAction[]> = {
  // Nora — auto-connected on load, types a smaller amount, abandons at the
  // scary confirm modal. Outcome: abandoned (signing_dialog_complex).
  "newbie-nora": (_treasury) => [
    { type: "view", reasoning: "Looks like my wallet is already connected. There's an amount field and a destination." },
    { type: "type", selector: "[data-testid=amount-input]", value: "0.005", reasoning: "0.1 SOL is a LOT. I'm just trying this out — let me put in something tiny instead." },
    { type: "click", selector: "[data-testid=send-button]", reasoning: "Send button. Here goes nothing." },
    { type: "abandon", abandon_reason: "signing_dialog_complex", reasoning: "Wait — the confirm dialog has red text saying 'irrevocably sign' and lists a 'System Program' and 'compute budget'. I don't know what any of that means. I'm closing this." },
  ],
  // Walter — careful single payment with a "large" amount. Reads the
  // breakdown, signs, completes.
  "whale-walter": (treasury) => [
    { type: "view", reasoning: "Wallet connected. I'll go with my usual 0.1 SOL." },
    { type: "type", selector: "[data-testid=amount-input]", value: "0.1", reasoning: "Standard contribution size. Default of 0.1 is fine." },
    { type: "click", selector: "[data-testid=send-button]", reasoning: "Submit." },
    { type: "send", send_amount_sol: 0.1, send_to: treasury, reasoning: "Reviewed the breakdown — lamports + System Program transfer to the project address. Signing." },
    { type: "complete", reasoning: "Confirmed onchain. Done." },
  ],
  // Dan — multi-tip flow. Fires off rapid sends. With the default
  // MIMIX_TURN_BUDGET=10 he gets through ~4 real onchain sends before
  // hitting the cap, which surfaces the 'Upgrade plan' CTA in the demo.
  "degen-dan": (treasury) => [
    { type: "type", selector: "[data-testid=amount-input]", value: "0.005", reasoning: "First tip." },
    { type: "send", send_amount_sol: 0.005, send_to: treasury, reasoning: "Sending tip #1, fast." },
    { type: "type", selector: "[data-testid=amount-input]", value: "0.005", reasoning: "Same amount again." },
    { type: "send", send_amount_sol: 0.005, send_to: treasury, reasoning: "Tip #2, sending without re-reading the modal." },
    { type: "type", selector: "[data-testid=amount-input]", value: "0.005", reasoning: "Third one." },
    { type: "send", send_amount_sol: 0.005, send_to: treasury, reasoning: "Tip #3." },
    { type: "type", selector: "[data-testid=amount-input]", value: "0.005", reasoning: "Going for a fourth." },
    { type: "send", send_amount_sol: 0.005, send_to: treasury, reasoning: "Tip #4." },
    { type: "type", selector: "[data-testid=amount-input]", value: "0.005", reasoning: "One more for good measure." },
    { type: "send", send_amount_sol: 0.005, send_to: treasury, reasoning: "Tip #5." },
    { type: "type", selector: "[data-testid=amount-input]", value: "0.005", reasoning: "And another." },
    { type: "send", send_amount_sol: 0.005, send_to: treasury, reasoning: "Tip #6." },
    { type: "complete", reasoning: "Done, finally." },
  ],
};

/**
 * Persona-voice observations hand-authored for the demo target's UX. When
 * MIMIX_FAKE_LLM=1 (or no API key) the runtime returns a randomized subset
 * of these instead of calling Claude. With ANTHROPIC_API_KEY set, real
 * Claude Sonnet 4.5 observations replace these entirely.
 */
const PERSONA_OBSERVATIONS: Record<string, string[]> = {
  "newbie-nora": [
    "The confirm dialog was terrifying. It said 'irrevocably sign and broadcast' in bright red and listed program addresses and lamports. I don't know what any of that means, so I closed the tab.",
    "The default amount in the form was 0.1 SOL. That's like $20 — way too much for trying out a new project. The dApp shouldn't pre-fill such a big number.",
    "There's a 1% slippage option somewhere but I had no idea what slippage even is. Why is that exposed on the front of the payment form?",
    "I expected to just click one big 'Pay' button. Instead I had to enter an amount, then click Send, then a scary modal popped up. Too many steps to feel safe.",
    "Nothing explained what 'Send 0.1 SOL' actually does. Does it go to the project? To Phantom? I shouldn't have to guess.",
  ],
  "whale-walter": [
    "The transaction breakdown in the confirm modal is technically accurate — lamports, System Program, compute budget — but there's no 'simulated balance change' line. For amounts above a threshold I'd want a preview that says 'You will lose 0.1 SOL, recipient will gain 0.1 SOL'.",
    "Confirmation landed in about 5 seconds on devnet. Fine. On mainnet I'd want a clearer 'broadcast → confirmed' progress indicator with the slot number.",
    "No mention of priority fees on this UI. For a small payment that's fine, but for anything time-sensitive I'd want to set a tip.",
    "The destination address was shown but not labeled. It would be easy for a malicious dApp to swap that out and I wouldn't notice. A 'verified project address' badge would help.",
    "No transaction history or receipt after sending. Phantom shows it, but the dApp itself just shows '✅ Payment sent' with no signature link.",
  ],
  "degen-dan": [
    "I fired off five tips back to back. No rate-limit, no 'are you sure you want to send another'. Good — that's how it should be.",
    "The same confirm modal opens every single time though. Would be nice to have a 'don't ask again for this session' toggle for repeat payments to the same address.",
    "There's no bulk-tip mode. I had to do five separate type-amount → send → confirm cycles. A 'send 5 × 0.005' option would have saved a minute.",
    "The amount input doesn't auto-clear between sends. I had to re-type the same number each time even though I'm doing identical sends.",
    "Each tx took about 5 seconds to confirm. Across five sends that's 25 seconds where the UI is essentially blocking me. Would prefer fire-and-forget with a status tray.",
  ],
};

function pickFakeObservations(personaId: string): string[] {
  const all = PERSONA_OBSERVATIONS[personaId];
  if (!all || all.length === 0) {
    return ["(scripted mode — no observations bank configured for this persona)"];
  }
  // Randomized subset of 3-4 so successive demo runs feel fresh.
  const count = 3 + Math.floor(Math.random() * 2);
  const shuffled = [...all].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, count);
}

export { MODEL };
