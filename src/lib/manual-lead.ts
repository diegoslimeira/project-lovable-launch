import { createServerFn } from "@tanstack/react-start";
import { formatCnpj, isValidCnpj, normalizeCnpj } from "./cnpj";
import { companyNameSimilarity, normalizeForComparison, normalizeStateToUf } from "./cnpj-match";
import { normalizeDomain, normalizePhone } from "./discovery-dedup";
import { campaignRepositoryDirect } from "./repositories/campaigns";
import { leadRepositoryDirect } from "./repositories/leads";
import {
  MANUAL_LEADS_CAMPAIGN_ID,
  type Campaign,
  type Lead,
  type ManualLeadInput,
} from "./prospecting";

// Fase F — Cadastro Manual de Lead. Discovery é só UMA porta de entrada para
// o mesmo pipeline/domínio (ver Lead em prospecting.ts) — este módulo cria
// leads pelo caminho manual sem duplicar o tipo Lead nem sua lógica de
// negócio. O processamento (Salvar e analisar) vive em prospecting-service.ts
// (analyzeManualLead), não aqui — este arquivo só cria/valida/deduplica.

// --- campanha-sistema (lazy, id determinístico) ---

// Valores neutros: esta campanha nunca passa por Discovery real (não tem
// segmento/localização/raio próprios) e é excluída de listCampaignsDirect —
// ver repositories/campaigns.ts. `quantity`/`decisionMakers`/`offer`/
// `objective`/`channels` só existem porque Campaign os exige; nenhum deles é
// lido para leads manuais (enrichLead/diagnoseLead/generateCopy usam
// campaign.offer/objective — strings vazias são um valor razoável até um
// lead manual realmente rodar Diagnosis/Copy, o que ainda não é o foco desta
// fase, mas não impede a etapa de rodar se chegar até lá).
async function ensureManualLeadsCampaign(): Promise<Campaign> {
  const existing = await campaignRepositoryDirect.get(MANUAL_LEADS_CAMPAIGN_ID);
  if (existing) return existing;

  const campaign: Campaign = {
    id: MANUAL_LEADS_CAMPAIGN_ID,
    name: "Leads manuais",
    segment: "",
    location: "",
    radius: 0,
    quantity: 0,
    decisionMakers: [],
    offer: "",
    objective: "",
    channels: [],
    createdAt: new Date().toISOString(),
    progress: 0,
  };

  try {
    await campaignRepositoryDirect.create(campaign);
    return campaign;
  } catch {
    // Corrida rara: outra requisição criou a campanha-sistema entre o get()
    // e o create() acima (dois cliques quase simultâneos em "Salvar lead").
    // Sem onConflictDoNothing no repository de campanhas (não queremos
    // silenciar conflitos de id para campanhas normais) — aqui só refazemos
    // o get(), já que o id é determinístico e sempre o mesmo.
    const createdByAnotherRequest = await campaignRepositoryDirect.get(MANUAL_LEADS_CAMPAIGN_ID);
    if (createdByAnotherRequest) return createdByAnotherRequest;
    throw new Error("Falha ao garantir a campanha-sistema de leads manuais.");
  }
}

// --- dedup ---

export type DuplicateSignal = "cnpj" | "domain" | "phone" | "name_location";
export type DuplicateWarning = {
  leadId: string;
  company: string;
  signals: DuplicateSignal[];
  strength: "alta" | "media" | "baixa";
};

const NAME_LOCATION_SIMILARITY_THRESHOLD = 0.7; // mesmo limiar de cnpj-match.ts

function existingLeadCnpj(lead: Lead): string | undefined {
  if (lead.manualCnpj) return normalizeCnpj(lead.manualCnpj);
  if (lead.registryProfile?.cnpj) return normalizeCnpj(lead.registryProfile.cnpj);
  return undefined;
}

function strengthRank(strength: DuplicateWarning["strength"]): number {
  return strength === "alta" ? 2 : strength === "media" ? 1 : 0;
}

// Nunca bloqueia sozinho — só sinaliza. CNPJ exato é o sinal mais forte
// (mesma empresa, sem ambiguidade possível); domínio/telefone são sinais
// médios (podem ser compartilhados por coincidência, mas raramente);
// nome+cidade/UF é o sinal mais fraco (mesmo padrão documentado em
// discovery-dedup.ts), só conta combinado com cidade E UF batendo.
export function findPossibleDuplicates(
  input: ManualLeadInput,
  existingLeads: Lead[],
): DuplicateWarning[] {
  const inputCnpj = input.cnpj?.trim() ? normalizeCnpj(input.cnpj.trim()) : undefined;
  const inputDomain = normalizeDomain(input.website);
  const inputPhone = normalizePhone(input.phone);
  const inputCity = normalizeForComparison(input.city);
  const inputUf = normalizeStateToUf(input.state);

  const warnings: DuplicateWarning[] = [];
  for (const lead of existingLeads) {
    const signals: DuplicateSignal[] = [];

    const cnpj = existingLeadCnpj(lead);
    if (inputCnpj && cnpj && inputCnpj === cnpj) signals.push("cnpj");

    const domain = normalizeDomain(lead.website);
    if (inputDomain && domain && inputDomain === domain) signals.push("domain");

    const phone = normalizePhone(lead.phone);
    if (inputPhone && phone && inputPhone === phone) signals.push("phone");

    const nameScore = companyNameSimilarity(input.company, lead.company);
    const cityMatches = inputCity === normalizeForComparison(lead.city);
    const ufMatches = inputUf === normalizeStateToUf(lead.state);
    if (nameScore >= NAME_LOCATION_SIMILARITY_THRESHOLD && cityMatches && ufMatches) {
      signals.push("name_location");
    }

    if (signals.length === 0) continue;
    const strength: DuplicateWarning["strength"] = signals.includes("cnpj")
      ? "alta"
      : signals.includes("domain") || signals.includes("phone")
        ? "media"
        : "baixa";
    warnings.push({ leadId: lead.id, company: lead.company, signals, strength });
  }

  return warnings.sort((a, b) => strengthRank(b.strength) - strengthRank(a.strength)).slice(0, 5);
}

async function checkDuplicateLeadsDirect(input: ManualLeadInput): Promise<DuplicateWarning[]> {
  const existingLeads = await leadRepositoryDirect.list();
  return findPossibleDuplicates(input, existingLeads);
}

// --- criação ---

function leadIdForManual(): string {
  return `manual-lead-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export async function createManualLeadDirect(input: ManualLeadInput): Promise<Lead> {
  const company = input.company.trim();
  const city = input.city.trim();
  const state = input.state.trim();
  if (!company || !city || !state) {
    throw new Error("Nome da empresa, cidade e estado são obrigatórios.");
  }

  let manualCnpj: string | undefined;
  if (input.cnpj?.trim()) {
    const normalized = normalizeCnpj(input.cnpj.trim());
    if (!isValidCnpj(normalized)) {
      throw new Error(
        `CNPJ informado (${formatCnpj(normalized)}) é inválido — dígitos verificadores não conferem.`,
      );
    }
    manualCnpj = normalized;
  }

  const campaign = await ensureManualLeadsCampaign();

  const lead: Lead = {
    id: leadIdForManual(),
    campaignId: campaign.id,
    company,
    segment: "",
    city,
    state,
    decisionMaker: "Não localizado",
    role: "Não localizado",
    website: normalizeDomain(input.website),
    phone: input.phone?.trim() || undefined,
    whatsapp: input.phone?.trim() || undefined,
    instagram: input.instagram?.trim() || undefined,
    manualCnpj,
    address: input.address?.trim() || undefined,
    notes: input.notes?.trim() || undefined,
    ads: false,
    score: 0,
    confidence: 0,
    opportunity: "Lead adicionado manualmente — aguardando análise.",
    status: "Encontrado",
    evidence: [
      {
        label: "Descoberta",
        value: "Lead adicionado manualmente",
        type: "Fato verificado",
        source: "Manual",
      },
    ],
    diagnosis:
      "Ainda não há diagnóstico: lead adicionado manualmente, análise ainda não executada.",
    microInsight: "Lead cadastrado manualmente. Nenhuma inferência foi adicionada.",
    suggestedMessage:
      "Abordagem indisponível até que os dados necessários sejam enriquecidos e aprovados.",
  };

  const [created] = await leadRepositoryDirect.createMany([lead]);
  return created!;
}

export const manualLeadRepositoryDirect = {
  checkDuplicates: checkDuplicateLeadsDirect,
  create: createManualLeadDirect,
};

const checkDuplicateLeadsFn = createServerFn({ method: "POST" })
  .validator((input: ManualLeadInput) => input)
  .handler(async ({ data: input }) => checkDuplicateLeadsDirect(input));

const createManualLeadFn = createServerFn({ method: "POST" })
  .validator((input: ManualLeadInput) => input)
  .handler(async ({ data: input }) => createManualLeadDirect(input));

export function checkDuplicateLeads(input: ManualLeadInput): Promise<DuplicateWarning[]> {
  return checkDuplicateLeadsFn({ data: input });
}

export function createManualLead(input: ManualLeadInput): Promise<Lead> {
  return createManualLeadFn({ data: input });
}
