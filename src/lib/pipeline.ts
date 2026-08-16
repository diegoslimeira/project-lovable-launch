import { calculateOpportunityScore, type Campaign, type Lead } from "./prospecting";
import type { JobState } from "./providers";

export type ProspectingJob = {
  id: string;
  campaignId: Campaign["id"];
  stage: "discovery" | "enrichment" | "validation" | "audit" | "diagnosis" | "scoring" | "copy";
  state: JobState;
  processed: number;
  total: number;
  attempts: number;
  error?: string;
};

export const defaultJobs = (campaign: Campaign): ProspectingJob[] =>
  ["discovery", "enrichment", "validation", "audit", "diagnosis", "scoring", "copy"].map((stage, index) => ({
    id: `${campaign.id}-${stage}`,
    campaignId: campaign.id,
    stage: stage as ProspectingJob["stage"],
    state: index === 0 ? "pending" : "pending",
    processed: 0,
    total: campaign.quantity,
    attempts: 0,
  }));

export function scoreLead(parts: { fit: number; digital: number; intent: number; contact: number; activity: number }) {
  return calculateOpportunityScore(parts);
}

export function prioritizeLeads(leads: Lead[]) {
  return [...leads].sort((a, b) => b.score - a.score || b.confidence - a.confidence);
}

export function isContactAllowed(lead: Lead, blockedIds: Set<string>) {
  return !blockedIds.has(lead.id) && lead.status !== "Desqualificado";
}
