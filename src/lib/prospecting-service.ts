import { createServerFn } from "@tanstack/react-start";
import {
  defaultJobs,
  deriveScoreParts,
  identifyOpportunities,
  PIPELINE_BATCH_SIZE,
  PIPELINE_STAGES,
  priorityLabel,
  scoreLead,
  STAGE_TO_STATUS,
  type ProspectingJob,
} from "./pipeline";
import { mockLeadDiscoveryProvider } from "./providers/mock-discovery";
import { googlePlacesDiscoveryProvider } from "./providers/google-places-discovery";
import { mockContactEnrichmentProvider } from "./providers/mock-enrichment";
import { googlePlacesEnrichmentProvider } from "./providers/google-places-enrichment";
import { mockContactValidationProvider } from "./providers/mock-validation";
import { mockAdsProvider, mockDigitalAuditProvider } from "./providers/mock-audit";
import { mockAIProvider } from "./providers/mock-diagnosis";
import { mockCopyProvider } from "./providers/mock-copy";
import { dedupeCandidates } from "./discovery-dedup";
import { campaignRepositoryDirect } from "./repositories/campaigns";
import { jobRepository, jobRepositoryDirect } from "./repositories/jobs";
import { leadRepositoryDirect } from "./repositories/leads";
import {
  getDiscoveryProviderSelector,
  getEnrichmentProviderSelector,
  getProspectingQueue,
  type ProspectingQueueMessage,
} from "./db/client";
import type { Campaign, Lead } from "./prospecting";
import type {
  AdsProvider,
  AIProvider,
  CompanyCandidate,
  ContactCandidate,
  ContactEnrichmentProvider,
  ContactValidationProvider,
  CopyProvider,
  Diagnosis,
  DigitalAuditProvider,
  JobState,
  LeadDiscoveryProvider,
} from "./providers";

type PipelineStage = ProspectingJob["stage"];

// Fase C.2 — id determinístico por campanha+posição (em vez de UUID
// aleatório). Uma mensagem de fila reentregue pela Cloudflare Queue (retry
// nativo ou reentrega genuína) tenta recriar exatamente os mesmos leads do
// mesmo lote; como o id é sempre o mesmo, o insert (onConflictDoNothing, ver
// repositories/leads.ts) simplesmente não faz nada na segunda tentativa, em
// vez de criar um lead duplicado com um id novo.
function leadIdForIndex(campaignId: string, index: number): string {
  return `${campaignId}-lead-${index}`;
}

function candidateToLead(
  candidate: CompanyCandidate,
  campaign: Campaign,
  sourceJobId: string,
  index: number,
): Lead {
  return {
    id: leadIdForIndex(campaign.id, index),
    campaignId: campaign.id,
    sourceJobId,
    // Fase E.1 — persiste o id externo da fonte (ex.: Google placeId) de
    // forma estruturada, para que etapas futuras (Enrichment via Place
    // Details) consigam reutilizá-lo sem repetir uma busca por texto.
    externalId: candidate.sources[0]?.externalId,
    company: candidate.name,
    segment: campaign.segment,
    city: candidate.city || campaign.location.split("/")[0]?.trim() || campaign.location,
    state: candidate.state || campaign.location.split("/")[1]?.trim() || "",
    decisionMaker: "Não localizado",
    role: "Não localizado",
    ads: false,
    score: 0,
    confidence: candidate.sources[0]?.confidence ?? 0,
    opportunity: "Aguardando enriquecimento e auditoria.",
    status: "Encontrado",
    evidence: [
      {
        label: "Descoberta",
        // Fase D — antes fixo em "Mock Discovery Provider" independente da
        // fonte real; agora reflete o provider que efetivamente encontrou a
        // empresa (Google Places, mock, ou futuras fontes).
        value: candidate.sources[0]
          ? `Empresa encontrada via ${candidate.sources[0].source}`
          : "Empresa encontrada (fonte não registrada)",
        type: "Fato verificado",
        source: candidate.sources[0]?.source ?? "Fonte não registrada",
      },
    ],
    diagnosis: "Ainda não há diagnóstico: enrichment e auditoria não foram executados nesta fase.",
    microInsight:
      "Lead criado a partir da descoberta. Nenhuma inferência de decisor ou contato foi adicionada.",
    suggestedMessage:
      "Abordagem indisponível até que os dados necessários sejam enriquecidos e aprovados.",
  };
}

async function setJobState(
  job: ProspectingJob,
  state: JobState,
  patch: Partial<ProspectingJob> = {},
) {
  return jobRepositoryDirect.update(job.id, { ...patch, state });
}

// Fase E.1 — reconstrói sources[] a partir do externalId persistido no lead
// (quando existir), para que etapas seguintes (Enrichment via Place Details)
// consigam recuperar o placeId sem repetir uma Text Search. Assume "Google
// Places" como a fonte porque, nesta fase, é a única fonte real que popula
// externalId — quando uma segunda fonte real existir, isso precisa também
// persistir/ler QUAL fonte originou o id, não só o id em si.
function leadToCompanyCandidate(lead: Lead): CompanyCandidate {
  return {
    name: lead.company,
    city: lead.city,
    state: lead.state,
    category: lead.segment,
    website: lead.website,
    phone: lead.phone,
    sources: lead.externalId
      ? [
          {
            source: "Google Places",
            externalId: lead.externalId,
            collectedAt: new Date().toISOString(),
            method: "lead-record",
            confidence: 100,
          },
        ]
      : [],
  };
}

// Fase E.1 — descreve genericamente o que foi encontrado no Enrichment, sem
// assumir que o único resultado possível é um decisor: um provider real
// (Google Places) pode preencher só telefone/site, o mock pode preencher
// decisor+telefone+e-mail+instagram, e uma fonte futura pode preencher
// qualquer subconjunto. Lista só os campos efetivamente presentes.
function buildEnrichmentEvidenceValue(contact: ContactCandidate | undefined): string {
  if (!contact) return "Nenhum dado adicional encontrado nesta etapa";
  const parts: string[] = [];
  if (contact.name)
    parts.push(`decisor ${contact.name}${contact.role ? ` (${contact.role})` : ""}`);
  if (contact.phone) parts.push("telefone");
  if (contact.website) parts.push("site");
  if (contact.email) parts.push("e-mail");
  if (contact.instagram) parts.push("instagram");
  return parts.length
    ? `Dados encontrados: ${parts.join(", ")}`
    : "Nenhum dado adicional encontrado nesta etapa";
}

function pickMicroInsight(diagnosis: Diagnosis): string {
  if (!diagnosis.sections.length) {
    return "Diagnóstico gerado sem achados suficientes para destaque.";
  }
  const impactRank: Record<"alto" | "médio" | "baixo", number> = { alto: 2, médio: 1, baixo: 0 };
  const top = [...diagnosis.sections].sort(
    (a, b) => impactRank[b.impact] - impactRank[a.impact] || a.confidence - b.confidence,
  )[0];
  return top.summary;
}

// Fase C.2 — próxima etapa na ordem canônica (PIPELINE_STAGES), ou null se
// `stage` já é a última (copy). Única fonte de verdade para "o que roda
// depois de X", tanto para encadear mensagens quanto para calcular retomada.
function nextStageAfter(stage: PipelineStage): PipelineStage | null {
  const index = PIPELINE_STAGES.indexOf(stage);
  return index >= 0 && index < PIPELINE_STAGES.length - 1 ? PIPELINE_STAGES[index + 1]! : null;
}

async function sendPipelineMessage(message: ProspectingQueueMessage): Promise<void> {
  await getProspectingQueue().send(message);
}

export class ProspectingService {
  constructor(
    private readonly discovery: LeadDiscoveryProvider = mockLeadDiscoveryProvider,
    private readonly enrichment: ContactEnrichmentProvider = mockContactEnrichmentProvider,
    private readonly validation: ContactValidationProvider = mockContactValidationProvider,
    private readonly audit: DigitalAuditProvider = mockDigitalAuditProvider,
    private readonly ads: AdsProvider = mockAdsProvider,
    private readonly ai: AIProvider = mockAIProvider,
    private readonly copy: CopyProvider = mockCopyProvider,
  ) {}

  // Fase D — o discovery injetado no construtor continua sendo o padrão
  // (mock, seguro para qualquer ambiente sem configuração extra). Só troca
  // para Google Places se DISCOVERY_PROVIDER estiver explicitamente definido
  // como "google_places" (variável de deploy, nunca commitada) — nunca por
  // fallback silencioso, e nunca lido em tempo de import do módulo (os
  // bindings do Worker só existem dentro do ciclo de request/queue).
  private resolveDiscoveryProvider(): LeadDiscoveryProvider {
    const selector = getDiscoveryProviderSelector()?.trim().toLowerCase();
    if (selector === "google_places") return googlePlacesDiscoveryProvider;
    return this.discovery;
  }

  // Fase E.1 — mesmo padrão do resolveDiscoveryProvider: mock por padrão,
  // só troca para Google Places (Place Details) se ENRICHMENT_PROVIDER
  // estiver explicitamente "google_places".
  private resolveEnrichmentProvider(): ContactEnrichmentProvider {
    const selector = getEnrichmentProviderSelector()?.trim().toLowerCase();
    if (selector === "google_places") return googlePlacesEnrichmentProvider;
    return this.enrichment;
  }

  private async enrichLead(lead: Lead, campaign: Campaign) {
    if (lead.evidence.some((item) => item.label === "Enriquecimento")) return;
    const candidates = await this.resolveEnrichmentProvider().enrich(
      leadToCompanyCandidate(lead),
      campaign.decisionMakers,
    );
    const contact = candidates[0];
    // Fase E.1 — antes havia um fallback incondicional de site
    // (guessCompanyWebsite) aqui, que rodaria mesmo com um provider real —
    // isso foi movido para dentro do MockContactEnrichmentProvider (é
    // comportamento de mock, não de orquestração). Agora: sem candidato ou
    // sem o campo, o valor existente do lead é preservado como está — nunca
    // inventado nesta camada.
    await leadRepositoryDirect.update(lead.id, {
      decisionMaker: contact?.name ?? lead.decisionMaker,
      role: contact?.role ?? lead.role,
      phone: contact?.phone ?? lead.phone,
      whatsapp: contact?.phone ?? lead.whatsapp,
      email: contact?.email ?? lead.email,
      instagram: contact?.instagram ?? lead.instagram,
      website: contact?.website ?? lead.website,
      confidence: contact?.confidence ?? lead.confidence,
      status: STAGE_TO_STATUS.enrichment ?? lead.status,
      evidence: [
        ...lead.evidence,
        {
          label: "Enriquecimento",
          // Fase E.1 — antes assumia que o único dado possível era um
          // decisor ("Decisor identificado..."); um provider real (Google
          // Places) pode preencher só telefone/site, sem decisor nenhum.
          // Descreve genericamente o que foi de fato encontrado.
          value: buildEnrichmentEvidenceValue(contact),
          type: contact ? "Fato verificado" : "Não confirmado",
          source: contact?.source.source ?? "Fonte não registrada",
        },
      ],
    });
  }

  private async validateLead(lead: Lead) {
    if (lead.evidence.some((item) => item.label === "Validação")) return;
    const contactInput =
      lead.decisionMaker !== "Não localizado"
        ? {
            name: lead.decisionMaker,
            role: lead.role,
            email: lead.email,
            phone: lead.phone,
            instagram: lead.instagram,
            website: lead.website,
          }
        : undefined;
    const result = await this.validation.validate({
      contact: contactInput,
      company: leadToCompanyCandidate(lead),
    });
    await leadRepositoryDirect.update(lead.id, {
      validation: result,
      status: STAGE_TO_STATUS.validation ?? lead.status,
      evidence: [
        ...lead.evidence,
        {
          label: "Validação",
          value: result.valid
            ? "Dados enriquecidos passaram na verificação de coerência"
            : "Inconsistências encontradas nos dados enriquecidos",
          type: result.valid ? "Fato verificado" : "Não confirmado",
          source: "Mock Validation Provider",
        },
      ],
    });
  }

  private async auditLead(lead: Lead) {
    if (lead.evidence.some((item) => item.label === "Auditoria")) return;
    const company = leadToCompanyCandidate(lead);
    const [digitalFindings, adsFindings] = await Promise.all([
      this.audit.audit(company),
      this.ads.findPublicAds(company),
    ]);
    const auditFindings = [...digitalFindings, ...adsFindings];
    await leadRepositoryDirect.update(lead.id, {
      auditFindings,
      ads: adsFindings.length > 0,
      status: STAGE_TO_STATUS.audit ?? lead.status,
      opportunity:
        "Enrichment, validation e audit concluídos. Diagnóstico detalhado ainda não foi gerado.",
      diagnosis:
        "Achados de auditoria coletados e estruturados por dimensão. A consolidação em diagnóstico será implementada em uma fase futura.",
      microInsight:
        "Dados suficientes para diagnóstico já foram coletados; a síntese comercial ainda não foi gerada.",
      evidence: [
        ...lead.evidence,
        {
          label: "Auditoria",
          value: `${auditFindings.length} achados coletados em ${new Set(auditFindings.map((finding) => finding.dimension)).size} dimensões`,
          type: "Fato verificado",
          source: "Mock Audit Provider",
        },
      ],
    });
  }

  private async diagnoseLead(lead: Lead, campaign: Campaign) {
    if (lead.evidence.some((item) => item.label === "Diagnóstico")) return;
    const contact =
      lead.decisionMaker !== "Não localizado"
        ? { name: lead.decisionMaker, role: lead.role }
        : undefined;
    const diagnosis = await this.ai.diagnose({
      company: leadToCompanyCandidate(lead),
      contact,
      auditFindings: lead.auditFindings ?? [],
      validation: lead.validation,
      offer: campaign.offer,
    });
    await leadRepositoryDirect.update(lead.id, {
      diagnosisReport: diagnosis,
      diagnosis: diagnosis.narrative,
      microInsight: pickMicroInsight(diagnosis),
      status: STAGE_TO_STATUS.diagnosis ?? lead.status,
      evidence: [
        ...lead.evidence,
        {
          label: "Diagnóstico",
          value: `Diagnóstico consolidado em ${diagnosis.sections.length} dimensões`,
          type: "Fato verificado",
          source: "Mock AI Provider",
        },
      ],
    });
  }

  private async applyScoring(lead: Lead) {
    const parts = deriveScoreParts(lead, lead.diagnosisReport);
    const score = scoreLead(parts);
    await leadRepositoryDirect.update(lead.id, { score });
  }

  private async applyOpportunities(lead: Lead) {
    if (lead.evidence.some((item) => item.label === "Oportunidades")) return;
    const opportunities = lead.diagnosisReport ? identifyOpportunities(lead.diagnosisReport) : [];
    await leadRepositoryDirect.update(lead.id, {
      opportunities,
      opportunity: opportunities.length
        ? `${opportunities[0].service} — ${opportunities[0].rationale}`
        : "Nenhuma oportunidade comercial clara identificada até o momento.",
      evidence: [
        ...lead.evidence,
        {
          label: "Oportunidades",
          value: opportunities.length
            ? `${opportunities.length} oportunidade(s) comercial(is) identificada(s)`
            : "Nenhuma oportunidade clara identificada nesta etapa",
          type: opportunities.length ? "Oportunidade" : "Não confirmado",
          source: "Motor de Oportunidades",
        },
      ],
    });
  }

  private async generateCopy(lead: Lead, campaign: Campaign) {
    if (!lead.diagnosisReport) return;
    if (lead.evidence.some((item) => item.label === "Abordagem")) return;
    const contact =
      lead.decisionMaker !== "Não localizado"
        ? { name: lead.decisionMaker, role: lead.role }
        : undefined;
    const copy = await this.copy.generate({
      company: leadToCompanyCandidate(lead),
      contact,
      diagnosis: lead.diagnosisReport,
      opportunities: lead.opportunities ?? [],
      score: lead.score,
      priority: priorityLabel(lead.score),
      offer: campaign.offer,
      objective: campaign.objective,
    });
    await leadRepositoryDirect.update(lead.id, {
      copy,
      suggestedMessage: copy.whatsapp.body,
      status: STAGE_TO_STATUS.copy ?? lead.status,
      evidence: [
        ...lead.evidence,
        {
          label: "Abordagem",
          value: `Copy gerada para WhatsApp, E-mail e LinkedIn (gancho: ${copy.hook.dimension})`,
          type: "Fato verificado",
          source: "Mock Copy Provider",
        },
      ],
    });
  }

  // Mapeia cada etapa (exceto discovery) para a função de processamento de
  // 1 lead correspondente. As funções privadas acima não mudam: só a forma
  // como são invocadas (em lotes pequenos, não Promise.all sobre a campanha
  // inteira) muda nesta fase.
  private stageRunner(
    stage: Exclude<PipelineStage, "discovery">,
    campaign: Campaign,
  ): (lead: Lead) => Promise<void> {
    switch (stage) {
      case "enrichment":
        return (lead) => this.enrichLead(lead, campaign);
      case "validation":
        return (lead) => this.validateLead(lead);
      case "audit":
        return (lead) => this.auditLead(lead);
      case "diagnosis":
        return (lead) => this.diagnoseLead(lead, campaign);
      case "scoring":
        return (lead) => this.applyScoring(lead);
      case "opportunities":
        return (lead) => this.applyOpportunities(lead);
      case "copy":
        return (lead) => this.generateCopy(lead, campaign);
    }
  }

  // Fase C.2 — processa um lote de discovery: pede ao provider exatamente
  // `batchLimit` candidatos (nunca a campanha inteira de uma vez — é
  // justamente isso que evita recriar o estouro de CPU observado com o lote
  // único da Fase C.1). Ids determinísticos + onConflictDoNothing no insert
  // tornam reentrega da mesma mensagem segura contra duplicação.
  //
  // Fase D — duas mudanças para discovery real: (1) dedupeCandidates roda
  // sobre os candidatos crus antes de virarem leads (uma fonte real pode, em
  // tese, repetir a mesma empresa dentro do mesmo lote); os ids
  // determinísticos continuam avançando pela contagem CRUA (candidates.length,
  // não deduped.length) para manter a paginação do provider consistente
  // entre chamadas — só o que é efetivamente persistido é que é filtrado.
  // (2) isLastBatch agora também é true quando o provider devolve menos
  // candidatos do que o lote pedia: uma fonte real pode ter menos empresas
  // do que campaign.quantity, e isso não deve gerar um discovery "preso"
  // tentando indefinidamente completar a cota com lotes vazios.
  private async processDiscoveryBatch(
    campaign: Campaign,
    job: ProspectingJob,
    offset: number,
  ): Promise<{ nextOffset: number; isLastBatch: boolean }> {
    const remaining = Math.max(0, campaign.quantity - offset);
    const batchLimit = Math.min(PIPELINE_BATCH_SIZE, remaining);
    if (batchLimit === 0) {
      return { nextOffset: offset, isLastBatch: true };
    }

    const candidates = await this.resolveDiscoveryProvider().discover({
      segment: campaign.segment,
      location: campaign.location,
      radiusKm: campaign.radius,
      limit: batchLimit,
      offset,
    });
    const deduped = dedupeCandidates(candidates);
    const leadsToCreate = deduped.map((candidate, i) =>
      candidateToLead(candidate, campaign, job.id, offset + i),
    );
    await leadRepositoryDirect.createMany(leadsToCreate);

    const nextOffset = offset + candidates.length;
    return {
      nextOffset,
      isLastBatch: nextOffset >= campaign.quantity || candidates.length < batchLimit,
    };
  }

  // Fase C.2 — processa um lote de leads já existentes numa etapa que não é
  // discovery. Promise.allSettled (não Promise.all): a falha de um lead
  // isolado fica registrada no log e não derruba o lote nem a campanha. Os
  // guards já existentes em cada runOne (evidence.some(...)) tornam
  // reprocessar um lead já concluído nesta etapa um no-op, então redeliver da
  // mesma mensagem é seguro.
  private async processLeadStageBatch(
    campaign: Campaign,
    job: ProspectingJob,
    offset: number,
    runOne: (lead: Lead) => Promise<void>,
  ): Promise<{ nextOffset: number; isLastBatch: boolean }> {
    const batch = await leadRepositoryDirect.listByCampaignPaged(
      campaign.id,
      offset,
      PIPELINE_BATCH_SIZE,
    );
    const results = await Promise.allSettled(batch.map((lead) => runOne(lead)));
    results.forEach((result, i) => {
      if (result.status === "rejected") {
        console.error(
          `Falha ao processar o lead ${batch[i]!.id} na etapa ${job.stage} (campanha ${campaign.id}):`,
          result.reason,
        );
      }
    });

    const nextOffset = offset + batch.length;
    return { nextOffset, isLastBatch: batch.length < PIPELINE_BATCH_SIZE };
  }

  // Fase C.2 — ponto de entrada único chamado pelo consumer da fila para
  // processar UM lote de UMA etapa de UMA campanha. Ordem deliberada dentro
  // do bloco de sucesso: (1) faz o trabalho real do lote, (2) encadeia a
  // próxima mensagem (próximo lote da mesma etapa, primeiro lote da próxima
  // etapa, ou finaliza a campanha), (3) só então grava processed/state do job
  // no D1. Se o passo 3 falhar depois do 2 já ter sido feito, a reentrega
  // nativa da fila reprocessa a mensagem inteira — passos 1 e 2 são
  // idempotentes/tolerantes a duplicata (guards de evidence, ids
  // determinísticos, downstream que já checa job.state === "completed") — em
  // vez de arriscar um job marcado "completed" sem nunca ter encadeado a
  // próxima mensagem, o que travaria a campanha silenciosamente exigindo
  // "Retomar processamento" manual.
  async processStageBatch(campaign: Campaign, job: ProspectingJob, offset: number): Promise<void> {
    if (job.state === "completed") {
      // Mensagem duplicada/atrasada para uma etapa que já terminou (e já
      // encadeou o que vinha depois) — no-op para não gerar mais uma
      // mensagem redundante para a próxima etapa.
      return;
    }

    await setJobState(job, "running");

    let nextOffset: number;
    let isLastBatch: boolean;
    try {
      if (job.stage === "discovery") {
        ({ nextOffset, isLastBatch } = await this.processDiscoveryBatch(campaign, job, offset));
      } else {
        const runOne = this.stageRunner(job.stage, campaign);
        ({ nextOffset, isLastBatch } = await this.processLeadStageBatch(
          campaign,
          job,
          offset,
          runOne,
        ));
      }
    } catch (error) {
      await setJobState(job, "failed", {
        error: error instanceof Error ? error.message : `Falha na etapa ${job.stage}`,
      });
      console.error(
        `Lote (offset ${offset}) da etapa ${job.stage} da campanha ${campaign.id} falhou:`,
        error,
      );
      throw error;
    }

    if (isLastBatch) {
      // Fase D — se discovery terminou com menos leads do que a campanha
      // pedia (fonte real esgotada, ex.: 37 encontrados de 50 solicitados),
      // campaign.quantity passa a refletir o total REAL encontrado — nunca
      // "completa" a diferença com dados inventados. Isso corrige, de uma
      // vez, o "X/Y" da própria etapa de discovery e o total que TODAS as
      // etapas seguintes (enrichment em diante) vão usar como meta, já que
      // elas sempre leem campaign.quantity fresco do D1, não um valor fixo
      // decidido na criação da campanha.
      let effectiveQuantity = campaign.quantity;
      if (job.stage === "discovery" && nextOffset !== campaign.quantity) {
        effectiveQuantity = nextOffset;
        await campaignRepositoryDirect.update(campaign.id, { quantity: effectiveQuantity });
      }

      const nextStage = nextStageAfter(job.stage);
      if (nextStage) {
        await sendPipelineMessage({ campaignId: campaign.id, stage: nextStage, offset: 0 });
      } else {
        await campaignRepositoryDirect.update(campaign.id, { progress: 100 });
      }
      await jobRepositoryDirect.update(job.id, {
        state: "completed",
        processed: nextOffset,
        total: effectiveQuantity,
      });
    } else {
      await sendPipelineMessage({ campaignId: campaign.id, stage: job.stage, offset: nextOffset });
      await jobRepositoryDirect.update(job.id, { processed: nextOffset, total: campaign.quantity });
    }
  }

  // Fase C — parte rápida de início de campanha: só cria as linhas de
  // campaign/jobs (poucas escritas, sub-segundo). Chamada de dentro de
  // startCampaignFn, que retorna ao browser assim que isso termina; o
  // processamento pesado (discovery em diante) roda depois, em background,
  // via mensagens de fila (Fase C.2).
  async createCampaignAndJobs(
    input: Campaign,
  ): Promise<{ campaign: Campaign; jobs: ProspectingJob[] }> {
    const campaign: Campaign = { ...input, progress: 0 };
    await campaignRepositoryDirect.create(campaign);

    const jobs = defaultJobs(campaign);
    await jobRepositoryDirect.createMany(jobs);

    return { campaign, jobs };
  }

  // Fase C — parte rápida de retomada: só valida que a campanha/jobs existem
  // e devolve o estado atual. Chamada de dentro de resumeCampaignFn.
  async validateForResume(
    campaignId: string,
  ): Promise<{ campaign: Campaign; jobs: ProspectingJob[] }> {
    const campaign = await campaignRepositoryDirect.get(campaignId);
    if (!campaign) {
      throw new Error("Campanha não encontrada para retomar o processamento.");
    }

    const jobs = await jobRepositoryDirect.listByCampaign(campaignId);
    if (jobs.length < 8) {
      throw new Error("Jobs da campanha não encontrados ou incompletos para retomar.");
    }

    return { campaign, jobs };
  }

  // Fase C.2 — calcula de onde retomar a partir do estado real no D1: a
  // primeira etapa (na ordem canônica) que ainda não está "completed", e o
  // offset de onde continuar dentro dela. `job.processed` já é atualizado a
  // cada lote bem-sucedido (nunca antes disso), então ele reflete exatamente
  // até onde a etapa avançou de verdade — não precisa recontar leads/
  // evidence para descobrir isso. Retorna null se todas as etapas já estão
  // completas (nada para retomar).
  computeResumePoint(jobs: ProspectingJob[]): { stage: PipelineStage; offset: number } | null {
    for (const stage of PIPELINE_STAGES) {
      const job = jobs.find((candidate) => candidate.stage === stage);
      if (job && job.state !== "completed") {
        return { stage, offset: job.processed };
      }
    }
    return null;
  }
}

export const prospectingService = new ProspectingService();

// Fase C.2 — pontos de entrada chamados pelo browser. Cada um faz a parte
// rápida de forma síncrona (criar/validar campaign+jobs no D1) e enfileira só
// a PRIMEIRA mensagem do processamento (um lote de uma etapa) em vez de
// disparar o pipeline inteiro: o consumer da fila (ver
// src/lib/nitro-plugins/prospecting-queue-consumer.ts) processa um lote por
// invocação e se encadeia sozinho até a campanha terminar, com retry nativo
// da Cloudflare Queue se alguma invocação falhar de verdade.
const startCampaignFn = createServerFn({ method: "POST" })
  .validator((campaign: Campaign) => campaign)
  .handler(async ({ data }) => {
    const { campaign } = await prospectingService.createCampaignAndJobs(data);
    await sendPipelineMessage({ campaignId: campaign.id, stage: "discovery", offset: 0 });
    return campaign;
  });

export function startCampaign(campaign: Campaign): Promise<Campaign> {
  return startCampaignFn({ data: campaign });
}

const resumeCampaignFn = createServerFn({ method: "POST" })
  .validator((campaignId: string) => campaignId)
  .handler(async ({ data: campaignId }) => {
    const { campaign, jobs } = await prospectingService.validateForResume(campaignId);
    const resumePoint = prospectingService.computeResumePoint(jobs);
    if (resumePoint) {
      await sendPipelineMessage({
        campaignId: campaign.id,
        stage: resumePoint.stage,
        offset: resumePoint.offset,
      });
    }
    return campaign;
  });

export function resumeCampaignProcessing(campaignId: string): Promise<Campaign> {
  return resumeCampaignFn({ data: campaignId });
}

// Fase C.2 — chamado pelo consumer da fila (nunca pelo browser). A mensagem
// só carrega campaignId+stage+offset; campaign/jobs são sempre lidos do D1
// aqui, que continua sendo a fonte de verdade — nunca confiamos em dados
// "carregados" dentro da própria mensagem. Se a campanha, os jobs ou o job da
// etapa não existirem (não deveria acontecer: o producer sempre grava antes
// de enfileirar), a mensagem é tratada como concluída (ack) em vez de tentar
// de novo, já que reprocessar não resolveria uma pré-condição impossível.
export async function processQueueMessage(message: ProspectingQueueMessage): Promise<void> {
  const campaign = await campaignRepositoryDirect.get(message.campaignId);
  if (!campaign) {
    console.error(`Queue: campanha ${message.campaignId} não encontrada — mensagem descartada.`);
    return;
  }
  const jobs = await jobRepositoryDirect.listByCampaign(message.campaignId);
  if (jobs.length < 8) {
    console.error(
      `Queue: jobs incompletos para campanha ${message.campaignId} — mensagem descartada.`,
    );
    return;
  }
  const job = jobs.find((candidate) => candidate.stage === message.stage);
  if (!job) {
    console.error(
      `Queue: job da etapa ${message.stage} não encontrado para campanha ${message.campaignId} — mensagem descartada.`,
    );
    return;
  }
  await prospectingService.processStageBatch(campaign, job, message.offset);
}

// Fase C.2 — progresso considera não só quantas etapas já terminaram, mas
// também o quanto a etapa em andamento (ou travada em "failed", mantendo o
// último processed conhecido) já avançou dentro de si mesma, usando
// processed/total do próprio ProcessingTask — que agora é atualizado a cada
// lote, não só ao final da etapa inteira.
export async function getCampaignProgress(campaignId: string) {
  const jobs = await jobRepository.listByCampaign(campaignId);
  if (!jobs.length) return 0;
  const completed = jobs.filter((job) => job.state === "completed").length;
  const inProgress = jobs.find((job) => job.state === "running" || job.state === "failed");
  const fraction =
    inProgress && inProgress.total > 0 ? Math.min(1, inProgress.processed / inProgress.total) : 0;
  return Math.min(100, Math.round(((completed + fraction) / jobs.length) * 100));
}
