import type { AgentManifest } from "@sisera/domain";

const PROMOTIONS: Readonly<Record<AgentManifest["stage"], readonly AgentManifest["stage"][]>> = {
  draft: ["backtest", "paused"],
  backtest: ["stress", "paused"],
  stress: ["paper", "paused"],
  paper: ["shadow", "paused"],
  shadow: ["limited_live", "paused"],
  limited_live: ["live", "paper", "paused"],
  live: ["limited_live", "paper", "paused"],
  paused: ["draft", "paper"],
};

export type AgentProposal = {
  proposalId: string;
  agentId: string;
  manifestVersion: string;
  createdAt: string;
  payload: Readonly<Record<string, unknown>>;
  status: "proposed";
};

export function canTransitionAgent(
  from: AgentManifest["stage"],
  to: AgentManifest["stage"],
): boolean {
  return PROMOTIONS[from].includes(to);
}

export function createAgentProposal(
  manifest: AgentManifest,
  payload: Readonly<Record<string, unknown>>,
  proposalId: string,
  now = new Date(),
): AgentProposal {
  if (!["paper", "shadow", "limited_live", "live"].includes(manifest.stage))
    throw new Error("Agent has not passed the required evaluation stages");
  if (manifest.autonomy === "research") throw new Error("Research agents cannot propose trades");
  return {
    proposalId,
    agentId: manifest.id,
    manifestVersion: manifest.version,
    createdAt: now.toISOString(),
    payload,
    status: "proposed",
  };
}
export * from "./strategy.js";
