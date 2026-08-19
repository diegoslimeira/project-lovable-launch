import {
  calculateOpportunityScore,
  type Campaign,
  type Lead,
  type LeadStatus,
} from "./prospecting";
import type {
  AuditDimension,
  Diagnosis,
  JobState,
  ServiceCategory,
  ServiceOpportunity,
} from "./providers";

export type ProspectingJob = {
  id: string;
  campaignId: Campaign["id"];
  stage:
    | "discovery"
    | "enrichment"
    | "validation"
    | "audit"
    | "diagnosis"
    | "scoring"
    | "opportunities"
    | "copy";
  state: JobState;
  processed: number;
  total: number;
  attempts: number;
  error?: string;
};

// Ordem canônica das etapas técnicas do pipeline. Única fonte de verdade usada
// tanto para criar os jobs quanto para calcular "N etapas concluídas / total" na UI.
export const PIPELINE_STAGES: ProspectingJob["stage"][] = [
  "discovery",
  "enrichment",
  "validation",
  "audit",
  "diagnosis",
  "scoring",
  "opportunities",
  "copy",
];

// Fase C.2 — tamanho do lote de leads processado por mensagem de fila, em
// cada etapa (incluindo discovery). Único ponto de configuração: todo o
// resto do pipeline importa esta constante em vez de repetir o número.
export const PIPELINE_BATCH_SIZE = 5;

export const defaultJobs = (campaign: Campaign): ProspectingJob[] =>
  PIPELINE_STAGES.map((stage) => ({
    id: `${campaign.id}-${stage}`,
    campaignId: campaign.id,
    stage,
    state: "pending" as JobState,
    processed: 0,
    total: campaign.quantity,
    attempts: 0,
  }));

// Mapeamento formal entre o estágio técnico do pipeline e o status comercial do lead.
// Scoring e opportunities não têm status próprio: são processamento interno que não
// move o lead no funil comercial. Copy leva o lead para "Aguardando aprovação",
// reaproveitando o gate de aprovação humana já existente no domínio.
export const STAGE_TO_STATUS: Partial<Record<ProspectingJob["stage"], LeadStatus>> = {
  discovery: "Encontrado",
  enrichment: "Enriquecendo",
  validation: "Validando",
  audit: "Analisando",
  diagnosis: "Diagnóstico concluído",
  copy: "Aguardando aprovação",
};

export function scoreLead(parts: {
  fit: number;
  digital: number;
  intent: number;
  contact: number;
  activity: number;
}) {
  return calculateOpportunityScore(parts);
}

// Deriva os 5 componentes do Opportunity Score (0-20 cada) a partir de dados já
// persistidos do lead e do diagnóstico. Não usa Math.random(): o mesmo conjunto de
// dados de entrada sempre produz o mesmo score.
const DIGITAL_DIMENSIONS: AuditDimension[] = ["social_media", "website", "visual_identity"];
const ACTIVITY_DIMENSIONS: AuditDimension[] = ["gmb", "reviews"];

export function deriveScoreParts(lead: Lead, diagnosis?: Diagnosis) {
  const sections = diagnosis?.sections ?? [];

  const fit = lead.decisionMaker !== "Não localizado" ? 20 : 8;

  const contact = lead.validation
    ? Math.round(((lead.validation.valid ? 100 : lead.validation.confidence) / 100) * 20)
    : 5;

  const digitalSections = sections.filter((section) =>
    DIGITAL_DIMENSIONS.includes(section.dimension),
  );
  const digital = digitalSections.length
    ? Math.round(
        (digitalSections.reduce((sum, section) => sum + section.confidence, 0) /
          digitalSections.length /
          100) *
          20,
      )
    : 10;

  const intent = Math.min(
    20,
    sections.filter((section) => section.opportunities.length > 0).length * 5,
  );

  const activitySections = sections.filter((section) =>
    ACTIVITY_DIMENSIONS.includes(section.dimension),
  );
  const activity = activitySections.length
    ? Math.round(
        (activitySections.reduce((sum, section) => sum + section.confidence, 0) /
          activitySections.length /
          100) *
          20,
      )
    : 10;

  return { fit, digital, intent, contact, activity };
}

export function priorityLabel(score: number): "baixa" | "média" | "alta" {
  if (score >= 75) return "alta";
  if (score >= 50) return "média";
  return "baixa";
}

type CatalogEntry = {
  category: ServiceCategory;
  service: string;
  matchesDimensions: AuditDimension[];
};

// Catálogo mock de serviços — pequeno, só para validar a arquitetura. Será
// substituído pelo catálogo real de serviços da empresa em uma fase futura.
const SERVICE_CATALOG: CatalogEntry[] = [
  { category: "trafego_pago", service: "Gestão de tráfego pago", matchesDimensions: ["ads"] },
  {
    category: "redes_sociais",
    service: "Gestão de redes sociais",
    matchesDimensions: ["social_media"],
  },
  {
    category: "identidade_visual",
    service: "Consultoria de identidade visual",
    matchesDimensions: ["visual_identity"],
  },
  { category: "gmb", service: "Otimização de Google Meu Negócio", matchesDimensions: ["gmb"] },
  {
    category: "site",
    service: "Desenvolvimento/otimização de site",
    matchesDimensions: ["website"],
  },
  {
    category: "reputacao",
    service: "Gestão de reputação e avaliações",
    matchesDimensions: ["reviews", "reclame_aqui"],
  },
];

// Transforma as oportunidades apontadas por seção do diagnóstico em recomendações
// comerciais concretas (ServiceOpportunity), casando dimensão -> catálogo. Um lead
// pode gerar zero, uma ou várias oportunidades, conforme a evidência disponível.
export function identifyOpportunities(diagnosis: Diagnosis): ServiceOpportunity[] {
  const opportunities: ServiceOpportunity[] = [];
  for (const section of diagnosis.sections) {
    if (section.impact === "baixo" && section.opportunities.length === 0) continue;
    const matches = SERVICE_CATALOG.filter((entry) =>
      entry.matchesDimensions.includes(section.dimension),
    );
    for (const entry of matches) {
      opportunities.push({
        id: `${section.dimension}-${entry.category}`,
        service: entry.service,
        category: entry.category,
        rationale: section.summary,
        priority:
          section.impact === "alto" ? "alta" : section.impact === "médio" ? "média" : "baixa",
        evidenceRefs: section.keyFindings,
      });
    }
  }
  return opportunities;
}

export function prioritizeLeads(leads: Lead[]) {
  return [...leads].sort((a, b) => b.score - a.score || b.confidence - a.confidence);
}

export function isContactAllowed(lead: Lead, blockedIds: Set<string>) {
  return !blockedIds.has(lead.id) && lead.status !== "Desqualificado";
}
