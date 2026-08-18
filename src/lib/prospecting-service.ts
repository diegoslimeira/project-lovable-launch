import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import {
  defaultJobs,
  deriveScoreParts,
  identifyOpportunities,
  priorityLabel,
  scoreLead,
  STAGE_TO_STATUS,
  type ProspectingJob,
} from "./pipeline";
import { mockLeadDiscoveryProvider } from "./providers/mock-discovery";
import { guessCompanyWebsite, mockContactEnrichmentProvider } from "./providers/mock-enrichment";
import { mockContactValidationProvider } from "./providers/mock-validation";
import { mockAdsProvider, mockDigitalAuditProvider } from "./providers/mock-audit";
import { mockAIProvider } from "./providers/mock-diagnosis";
import { mockCopyProvider } from "./providers/mock-copy";
import { campaignRepository } from "./repositories/campaigns";
import { jobRepository } from "./repositories/jobs";
import { leadRepository } from "./repositories/leads";
import type { Campaign, Lead } from "./prospecting";
import type {
  AdsProvider,
  AIProvider,
  CompanyCandidate,
  ContactEnrichmentProvider,
  ContactValidationProvider,
  CopyProvider,
  Diagnosis,
  DigitalAuditProvider,
  JobState,
  LeadDiscoveryProvider,
} from "./providers";

const createId = (prefix: string) => {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return `${prefix}-${crypto.randomUUID()}`;
  }
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
};

function candidateToLead(
  candidate: CompanyCandidate,
  campaign: Campaign,
  sourceJobId: string,
): Lead {
  return {
    id: createId("lead"),
    campaignId: campaign.id,
    sourceJobId,
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
        value: "Empresa encontrada pelo Mock Discovery Provider",
        type: "Fato verificado",
        source: candidate.sources[0]?.source || "Mock Discovery Provider",
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
  return jobRepository.update(job.id, { ...patch, state });
}

function leadToCompanyCandidate(lead: Lead): CompanyCandidate {
  return {
    name: lead.company,
    city: lead.city,
    state: lead.state,
    category: lead.segment,
    website: lead.website,
    phone: lead.phone,
    sources: [],
  };
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

  private async enrichLead(lead: Lead, campaign: Campaign) {
    if (lead.evidence.some((item) => item.label === "Enriquecimento")) return;
    const candidates = await this.enrichment.enrich(
      leadToCompanyCandidate(lead),
      campaign.decisionMakers,
    );
    const contact = candidates[0];
    await leadRepository.update(lead.id, {
      decisionMaker: contact?.name ?? lead.decisionMaker,
      role: contact?.role ?? lead.role,
      phone: contact?.phone ?? lead.phone,
      whatsapp: contact?.phone ?? lead.whatsapp,
      email: contact?.email ?? lead.email,
      instagram: contact?.instagram ?? lead.instagram,
      website: lead.website ?? guessCompanyWebsite(lead.company),
      confidence: contact?.confidence ?? lead.confidence,
      status: STAGE_TO_STATUS.enrichment ?? lead.status,
      evidence: [
        ...lead.evidence,
        {
          label: "Enriquecimento",
          value: contact
            ? `Decisor identificado: ${contact.name} (${contact.role ?? "cargo não informado"})`
            : "Nenhum decisor localizado nesta etapa",
          type: contact ? "Fato verificado" : "Não confirmado",
          source: "Mock Enrichment Provider",
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
    await leadRepository.update(lead.id, {
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
    await leadRepository.update(lead.id, {
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
    await leadRepository.update(lead.id, {
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
    await leadRepository.update(lead.id, { score });
  }

  private async applyOpportunities(lead: Lead) {
    if (lead.evidence.some((item) => item.label === "Oportunidades")) return;
    const opportunities = lead.diagnosisReport ? identifyOpportunities(lead.diagnosisReport) : [];
    await leadRepository.update(lead.id, {
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
    await leadRepository.update(lead.id, {
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

  private async runStage(
    job: ProspectingJob,
    total: number,
    run: () => Promise<number>,
  ): Promise<boolean> {
    await setJobState(job, "running", { attempts: 1 });
    try {
      const processed = await run();
      await setJobState(job, "completed", { processed, total });
      return true;
    } catch (error) {
      await setJobState(job, "failed", {
        error: error instanceof Error ? error.message : "Falha na etapa",
        attempts: 1,
      });
      return false;
    }
  }

  private async finalizeCampaign(
    campaign: Campaign,
    totalJobs: number,
  ): Promise<{ campaign: Campaign; jobs: ProspectingJob[]; leads: Lead[] }> {
    const finishedJobs = await jobRepository.listByCampaign(campaign.id);
    const completed = finishedJobs.filter((job) => job.state === "completed").length;
    const progress = totalJobs ? Math.round((completed / totalJobs) * 100) : 0;
    const updatedCampaign =
      (await campaignRepository.update(campaign.id, { progress })) || campaign;
    return {
      campaign: updatedCampaign,
      jobs: finishedJobs,
      leads: await leadRepository.listByCampaign(campaign.id),
    };
  }

  // Executa as etapas enrichment -> copy (jobs[1..7]) em sequência, pulando
  // qualquer job já "completed". Usado tanto por runPipeline (jobs sempre
  // "pending", nada é pulado) quanto por resumePipeline (retoma a partir da
  // primeira etapa incompleta). Cada etapa individual já é idempotente por
  // lead (guards nos métodos enrichLead/validateLead/auditLead/diagnoseLead/
  // applyOpportunities/generateCopy), então reexecutar uma etapa presa em
  // "running" não duplica dados de leads já processados nela.
  private async runRemainingStages(campaign: Campaign, jobs: ProspectingJob[]): Promise<void> {
    const stages: { job: ProspectingJob; run: (leads: Lead[]) => Promise<void> }[] = [
      {
        job: jobs[1],
        run: async (leads) => {
          await Promise.all(leads.map((lead) => this.enrichLead(lead, campaign)));
        },
      },
      {
        job: jobs[2],
        run: async (leads) => {
          await Promise.all(leads.map((lead) => this.validateLead(lead)));
        },
      },
      {
        job: jobs[3],
        run: async (leads) => {
          await Promise.all(leads.map((lead) => this.auditLead(lead)));
        },
      },
      {
        job: jobs[4],
        run: async (leads) => {
          await Promise.all(leads.map((lead) => this.diagnoseLead(lead, campaign)));
        },
      },
      {
        job: jobs[5],
        run: async (leads) => {
          await Promise.all(leads.map((lead) => this.applyScoring(lead)));
        },
      },
      {
        job: jobs[6],
        run: async (leads) => {
          await Promise.all(leads.map((lead) => this.applyOpportunities(lead)));
        },
      },
      {
        job: jobs[7],
        run: async (leads) => {
          await Promise.all(leads.map((lead) => this.generateCopy(lead, campaign)));
        },
      },
    ];

    for (const { job, run } of stages) {
      if (job.state === "completed") continue;
      const current = await leadRepository.listByCampaign(campaign.id);
      const ok = await this.runStage(job, current.length, async () => {
        await run(current);
        return current.length;
      });
      if (!ok) return;
    }
  }

  // Fase C — parte rápida de início de campanha: só cria as linhas de
  // campaign/jobs (poucas escritas, sub-segundo). Chamada de dentro de
  // startCampaignFn, que retorna ao browser assim que isso termina; o
  // processamento pesado (discovery em diante) roda depois, em background,
  // via runPipeline.
  async createCampaignAndJobs(
    input: Campaign,
  ): Promise<{ campaign: Campaign; jobs: ProspectingJob[] }> {
    const campaign: Campaign = { ...input, progress: 0 };
    await campaignRepository.create(campaign);

    const jobs = defaultJobs(campaign);
    await jobRepository.createMany(jobs);

    return { campaign, jobs };
  }

  // Fase C — parte longa de início de campanha (discovery + runRemainingStages
  // + finalize). Roda inteiramente no servidor, disparada via
  // request.waitUntil() em startCampaignFn — não é mais aguardada pelo
  // browser, então não lança: qualquer erro fica registrado no estado do job
  // (setJobState "failed") e no console do servidor; a UI reflete a falha
  // lendo o ProcessingTask via polling, e "Retomar processamento" continua
  // disponível para tentar de novo.
  async runPipeline(campaign: Campaign, jobs: ProspectingJob[]): Promise<void> {
    const discoveryJob = jobs[0]!;
    await setJobState(discoveryJob, "running", { attempts: 1 });

    try {
      const candidates = await this.discovery.discover({
        segment: campaign.segment,
        location: campaign.location,
        radiusKm: campaign.radius,
        limit: campaign.quantity,
      });
      const leads = candidates.map((candidate) =>
        candidateToLead(candidate, campaign, discoveryJob.id),
      );
      await leadRepository.createMany(leads);
      await setJobState(discoveryJob, "completed", {
        processed: candidates.length,
        total: campaign.quantity,
        attempts: 1,
      });
    } catch (error) {
      await setJobState(discoveryJob, "failed", {
        error: error instanceof Error ? error.message : "Falha no discovery",
        attempts: 1,
      });
      await campaignRepository.update(campaign.id, { progress: 0 });
      console.error(`Discovery da campanha ${campaign.id} falhou:`, error);
      return;
    }

    await this.runRemainingStages(campaign, jobs);
    await this.finalizeCampaign(campaign, jobs.length);
  }

  // Fase C — parte rápida de retomada: só valida que a campanha/jobs existem
  // e devolve o estado atual. Chamada de dentro de resumeCampaignFn, que
  // retorna ao browser assim que essa validação termina; o processamento
  // (discovery se necessário + runRemainingStages) roda depois, em
  // background, via resumePipeline.
  async validateForResume(
    campaignId: string,
  ): Promise<{ campaign: Campaign; jobs: ProspectingJob[] }> {
    const campaign = await campaignRepository.get(campaignId);
    if (!campaign) {
      throw new Error("Campanha não encontrada para retomar o processamento.");
    }

    const jobs = await jobRepository.listByCampaign(campaignId);
    if (jobs.length < 8) {
      throw new Error("Jobs da campanha não encontrados ou incompletos para retomar.");
    }

    return { campaign, jobs };
  }

  // Fase C — parte longa de retomada. Mesma lógica de sempre (discovery só
  // reexecuta se não existir nenhum lead persistido; senão só normaliza o job
  // de discovery e segue para runRemainingStages), agora rodando em
  // background via request.waitUntil() em resumeCampaignFn — não lança, pelo
  // mesmo motivo de runPipeline acima.
  async resumePipeline(campaign: Campaign, jobs: ProspectingJob[]): Promise<void> {
    const discoveryJob = jobs[0]!;
    const existingLeads = await leadRepository.listByCampaign(campaign.id);

    if (existingLeads.length === 0) {
      await setJobState(discoveryJob, "running", { attempts: 1 });
      try {
        const candidates = await this.discovery.discover({
          segment: campaign.segment,
          location: campaign.location,
          radiusKm: campaign.radius,
          limit: campaign.quantity,
        });
        const leads = candidates.map((candidate) =>
          candidateToLead(candidate, campaign, discoveryJob.id),
        );
        await leadRepository.createMany(leads);
        await setJobState(discoveryJob, "completed", {
          processed: candidates.length,
          total: campaign.quantity,
          attempts: 1,
        });
      } catch (error) {
        await setJobState(discoveryJob, "failed", {
          error: error instanceof Error ? error.message : "Falha no discovery",
          attempts: 1,
        });
        console.error(`Discovery (retomada) da campanha ${campaign.id} falhou:`, error);
        return;
      }
    } else if (discoveryJob.state !== "completed") {
      await setJobState(discoveryJob, "completed", {
        processed: existingLeads.length,
        total: campaign.quantity,
      });
    }

    await this.runRemainingStages(campaign, jobs);
    await this.finalizeCampaign(campaign, jobs.length);
  }
}

export const prospectingService = new ProspectingService();

// waitUntil não faz parte do tipo padrão de Request (lib.dom) — é uma
// extensão que o preset cloudflare-module do Nitro anexa em runtime (ver
// augmentReq em node_modules/nitro/dist/presets/cloudflare/runtime/
// _module-handler.mjs), repassada por H3Event.waitUntil(). Presente em dev
// (wrangler dev) e produção; ausente apenas fora do runtime Cloudflare (ex.:
// bun run dev), caso em que o processamento em background já não teria D1
// de qualquer forma — fallback é só não deixar o TypeError explodir.
function runInBackground(task: Promise<void>) {
  const request = getRequest() as Request & { waitUntil?: (promise: Promise<unknown>) => void };
  request.waitUntil?.(task);
}

// Fase C — pontos de entrada chamados pelo browser. Cada um faz a parte
// rápida de forma síncrona (retorna assim que ela termina) e agenda a parte
// longa via request.waitUntil(), que mantém o Worker vivo depois da resposta
// já ter sido enviada — o processamento continua no servidor mesmo que a aba
// seja fechada/recarregada. Ver relatório da Fase C para a análise completa
// de por que isso é seguro no runtime atual (sem Queues/Durable Objects).
const startCampaignFn = createServerFn({ method: "POST" })
  .validator((campaign: Campaign) => campaign)
  .handler(async ({ data }) => {
    const { campaign, jobs } = await prospectingService.createCampaignAndJobs(data);
    runInBackground(
      prospectingService.runPipeline(campaign, jobs).catch((error) => {
        console.error(`Pipeline em background da campanha ${campaign.id} falhou:`, error);
      }),
    );
    return campaign;
  });

export function startCampaign(campaign: Campaign): Promise<Campaign> {
  return startCampaignFn({ data: campaign });
}

const resumeCampaignFn = createServerFn({ method: "POST" })
  .validator((campaignId: string) => campaignId)
  .handler(async ({ data: campaignId }) => {
    const { campaign, jobs } = await prospectingService.validateForResume(campaignId);
    runInBackground(
      prospectingService.resumePipeline(campaign, jobs).catch((error) => {
        console.error(`Retomada em background da campanha ${campaign.id} falhou:`, error);
      }),
    );
    return campaign;
  });

export function resumeCampaignProcessing(campaignId: string): Promise<Campaign> {
  return resumeCampaignFn({ data: campaignId });
}

export async function getCampaignProgress(campaignId: string) {
  const jobs = await jobRepository.listByCampaign(campaignId);
  if (!jobs.length) return 0;
  const completed = jobs.filter((job) => job.state === "completed").length;
  const running = jobs.filter((job) => job.state === "running").length;
  return Math.min(100, Math.round(((completed + running * 0.5) / jobs.length) * 100));
}
