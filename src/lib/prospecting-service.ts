import { defaultJobs, type ProspectingJob } from "./pipeline";
import { mockLeadDiscoveryProvider } from "./providers/mock-discovery";
import { campaignRepository } from "./repositories/campaigns";
import { jobRepository } from "./repositories/jobs";
import { leadRepository } from "./repositories/leads";
import type { Campaign, Lead } from "./prospecting";
import type {
  CompanyCandidate,
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
    diagnosis:
      "Ainda não há diagnóstico: enrichment e auditoria não foram executados nesta fase.",
    microInsight:
      "Lead criado a partir da descoberta. Nenhuma inferência de decisor ou contato foi adicionada.",
    suggestedMessage:
      "Abordagem indisponível até que os dados necessários sejam enriquecidos e aprovados.",
  };
}

function setJobState(
  job: ProspectingJob,
  state: JobState,
  patch: Partial<ProspectingJob> = {},
) {
  return jobRepository.update(job.id, { ...patch, state });
}

export class ProspectingService {
  constructor(
    private readonly discovery: LeadDiscoveryProvider = mockLeadDiscoveryProvider,
  ) {}

  async createAndRun(
    input: Campaign,
  ): Promise<{ campaign: Campaign; jobs: ProspectingJob[]; leads: Lead[] }> {
    const campaign: Campaign = { ...input, progress: 0 };
    campaignRepository.create(campaign);

    const jobs = defaultJobs(campaign);
    jobRepository.createMany(jobs);

    const discoveryJob = jobs[0];
    setJobState(discoveryJob, "running", { attempts: 1 });

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
      leadRepository.createMany(leads);
      setJobState(discoveryJob, "completed", {
        processed: candidates.length,
        total: campaign.quantity,
        attempts: 1,
      });
      const progress = jobs.length ? Math.round((1 / jobs.length) * 100) : 0;
      const updatedCampaign =
        campaignRepository.update(campaign.id, { progress }) || campaign;
      return {
        campaign: updatedCampaign,
        jobs: jobRepository.listByCampaign(campaign.id),
        leads,
      };
    } catch (error) {
      setJobState(discoveryJob, "failed", {
        error: error instanceof Error ? error.message : "Falha no discovery",
        attempts: 1,
      });
      const updatedCampaign =
        campaignRepository.update(campaign.id, { progress: 0 }) || campaign;
      throw Object.assign(new Error("Não foi possível executar o discovery."), {
        cause: error,
        campaign: updatedCampaign,
      });
    }
  }
}

export const prospectingService = new ProspectingService();

export function getCampaignProgress(campaignId: string) {
  const jobs = jobRepository.listByCampaign(campaignId);
  if (!jobs.length) return 0;
  const completed = jobs.filter((job) => job.state === "completed").length;
  const running = jobs.filter((job) => job.state === "running").length;
  return Math.min(
    100,
    Math.round(((completed + running * 0.5) / jobs.length) * 100),
  );
}
