import type {
  AgentAction,
  PersonaPolicy,
  PolicyCheckContext,
  PolicyCheckResult,
} from "@mimix/persona-types";

const SESSION_OVERSHOOT_REASON = "session_duration_exceeded";

export function checkAction(
  policy: PersonaPolicy,
  action: AgentAction,
  context: PolicyCheckContext,
): PolicyCheckResult {
  if (context.sessionElapsedMs > policy.session_duration_min * 60_000) {
    return { allowed: false, reason: SESSION_OVERSHOOT_REASON };
  }

  if (!policy.allowed_chains.includes(context.chain)) {
    return { allowed: false, reason: `chain_not_allowed:${context.chain}` };
  }

  if (policy.forbidden_actions.includes(action.type)) {
    return { allowed: false, reason: `forbidden_action:${action.type}` };
  }

  if (!policy.allowed_actions.includes(action.type)) {
    return { allowed: false, reason: `action_not_in_allowlist:${action.type}` };
  }

  if (action.type === "send") {
    if (action.estimated_usd > policy.max_spend_per_tx_usd) {
      return {
        allowed: false,
        reason: `spend_per_tx_exceeded:${action.estimated_usd}>${policy.max_spend_per_tx_usd}`,
      };
    }
    if (context.spentSoFar + action.estimated_usd > policy.max_total_spend_usd) {
      return {
        allowed: false,
        reason: `total_spend_exceeded:${context.spentSoFar + action.estimated_usd}>${policy.max_total_spend_usd}`,
      };
    }
  }

  return { allowed: true };
}

export type { AgentAction, PersonaPolicy, PolicyCheckContext, PolicyCheckResult };
