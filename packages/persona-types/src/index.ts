export type PersonaStatus = "live" | "beta";

/** A run either tests a generic web app or a Solana dApp (wallet + onchain leg). */
export type TargetKind = "web" | "solana";

export type PersonaCard = {
  id: string;
  display_name: string;
  avatar_emoji: string;
  tagline: string;
  tests: string;
  status: PersonaStatus;
  price_usdg: number;
};

export type PersonaWallet = {
  chain: "solana";
  network: "devnet" | "mainnet-beta";
  starting_balance_sol: number;
  starting_balance_usdg: number;
};

export type PersonaPolicy = {
  max_spend_per_tx_usd: number;
  max_total_spend_usd: number;
  max_slippage_bps?: number;
  allowed_actions: string[];
  forbidden_actions: string[];
  allowed_chains: string[];
  session_duration_min: number;
};

export type PersonaBehavior = {
  patience_score: number;
  technical_skill: number;
  risk_tolerance: number;
  reads_warnings: boolean;
  abandonment_triggers: string[];
};

export type LivePersona = PersonaCard & {
  status: "live";
  wallet: PersonaWallet;
  policy: PersonaPolicy;
  behavior: PersonaBehavior;
  journey_goal: string;
};

export type BetaPersona = PersonaCard & {
  status: "beta";
};

export type Persona = LivePersona | BetaPersona;

export type AgentAction =
  | { type: "view" }
  | { type: "click"; selector: string; reasoning?: string }
  | { type: "type"; selector: string; value: string; reasoning?: string }
  | { type: "connect_wallet"; reasoning?: string }
  | { type: "sign"; reasoning?: string }
  | { type: "send"; amount_sol: number; to: string; estimated_usd: number; reasoning?: string }
  | { type: "abandon"; reason: string }
  | { type: "complete"; reasoning?: string };

export type AgentActionType = AgentAction["type"];

export type PolicyCheckContext = {
  spentSoFar: number;
  sessionElapsedMs: number;
  chain: string;
};

export type PolicyCheckResult =
  | { allowed: true }
  | { allowed: false; reason: string };

export type EventBase = {
  ts: string;
  persona: string;
};

export type RunEvent =
  | (EventBase & { type: "action"; action: AgentActionType; selector?: string; reasoning?: string })
  | (EventBase & { type: "screenshot"; path: string })
  | (EventBase & { type: "tx"; chain: string; signature: string; via: "zerion-cli"; result: "success" | "failure" })
  | (EventBase & { type: "policy_block"; attempted: string; reason: string })
  | (EventBase & { type: "observation"; text: string })
  | (EventBase & { type: "abandon"; reason: string; step?: string })
  | (EventBase & { type: "complete" })
  | (EventBase & { type: "budget_exceeded"; turns_used: number; suggested_tier: string })
  | (EventBase & { type: "error"; message: string });

export type AgentStatus = "pending" | "running" | "complete" | "abandoned" | "capped" | "failed";

export type RunState = {
  id: string;
  created_at: string;
  target_dapp: {
    url: string;
    name: string;
    description: string;
  };
  target_kind?: TargetKind;
  /**
   * Random per-run token. Reads of run.json / SSE events require this
   * token (query `?token=` or `Authorization: Bearer`). Returned to the
   * client once by POST /api/runs and stored in the run URL.
   */
  access_token?: string;
  personas: string[];
  payment: {
    amount_usdg: number;
    tx_signature: string;
    verified: boolean;
  };
  status: "pending" | "running" | "complete" | "failed";
  agents: Record<string, { status: AgentStatus; events_count: number }>;
  requester?: {
    email: string;
    goal?: string;
  };
};

export type ReportFragment = {
  persona: string;
  outcome: "completed" | "abandoned" | "failed";
  abandon_reason?: string;
  completed_steps: string[];
  failed_step?: string;
  observations: string[];
  /** If askObservations failed, the error message lands here so empty
   *  observations aren't silently mistaken for "the agent had nothing to say". */
  wrap_up_error?: string;
  tx_signatures: string[];
  capped?: boolean;
  turns_used?: number;
  turn_budget?: number;
  llm_usage?: { input_tokens: number; output_tokens: number; cached_tokens: number };
};

export type RunReport = {
  run_id: string;
  summary: {
    personas_run: number;
    journeys_completed: number;
    journeys_abandoned: number;
    total_real_txs: number;
    policy_violations_blocked: number;
    user_ready_score: number;
  };
  per_persona: ReportFragment[];
};
