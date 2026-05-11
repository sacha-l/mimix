import Anthropic from "@anthropic-ai/sdk";
import type { LivePersona } from "@mimix/persona-types";

const MODEL = "claude-sonnet-4-5-20250929";
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

  constructor(persona: LivePersona, public targetUrl: string, apiKey?: string) {
    this.client = new Anthropic({ apiKey: apiKey || process.env.ANTHROPIC_API_KEY });
    this.system = buildSystemPrompt(persona, targetUrl);
  }

  async nextAction(input: LlmTurnInput): Promise<LlmAction> {
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

function buildSystemPrompt(persona: LivePersona, targetUrl: string): string {
  return [
    `You are ${persona.display_name}, a Solana user testing a dApp at ${targetUrl}.`,
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
    `  Max spend per tx (USD): ${persona.policy.max_spend_per_tx_usd}`,
    `  Max total spend (USD): ${persona.policy.max_total_spend_usd}`,
    `  Session limit: ${persona.policy.session_duration_min} minutes`,
    ``,
    `JOURNEY GOAL:`,
    persona.journey_goal,
    ``,
    `INSTRUCTIONS:`,
    `- Stay in character. Reason in the persona's first-person voice.`,
    `- Choose ONE action per turn using the 'act' tool.`,
    `- Prefer [data-testid=...] selectors for click/type.`,
    `- For 'send' actions, supply send_amount_sol and send_to. The runtime will execute the SOL transfer through the forked Zerion CLI; you do not need to click a Confirm button afterwards.`,
    `- Abandon if your persona would genuinely give up (use abandon_reason from your abandonment_triggers list when possible).`,
    `- Mark 'complete' when the journey goal is achieved.`,
  ].join("\n");
}

export { MODEL };
