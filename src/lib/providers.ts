export type JobState = "pending" | "running" | "completed" | "failed" | "retrying";

export type SourceRecord = {
  source: string;
  url?: string;
  collectedAt: string;
  method: string;
  confidence: number;
};

export type CompanyCandidate = {
  name: string;
  legalName?: string;
  address?: string;
  city?: string;
  state?: string;
  postalCode?: string;
  phone?: string;
  website?: string;
  category?: string;
  sources: SourceRecord[];
};

export type ContactCandidate = {
  name?: string;
  role?: string;
  email?: string;
  phone?: string;
  linkedin?: string;
  instagram?: string;
  confidence: number;
  source: SourceRecord;
};

export type AuditResult = {
  subject: string;
  findings: {
    label: string;
    value: string;
    type: "Fato verificado" | "Inferência" | "Oportunidade" | "Hipótese" | "Não confirmado";
    evidence?: string;
  }[];
  confidence: number;
};

export interface LeadDiscoveryProvider {
  discover(input: {
    segment: string;
    location: string;
    radiusKm: number;
    limit: number;
  }): Promise<CompanyCandidate[]>;
}

export interface ContactEnrichmentProvider {
  enrich(company: CompanyCandidate, decisionMakerRoles: string[]): Promise<ContactCandidate[]>;
}

export interface DigitalAuditProvider {
  audit(company: CompanyCandidate): Promise<AuditResult[]>;
}

export interface AdsProvider {
  findPublicAds(company: CompanyCandidate): Promise<AuditResult[]>;
}

export interface AIProvider {
  diagnose(input: {
    company: CompanyCandidate;
    contacts: ContactCandidate[];
    audits: AuditResult[];
    ads: AuditResult[];
    offer: string;
  }): Promise<{
    diagnosis: string;
    microInsight: string;
    message: string;
  }>;
}

export type ProspectingProviders = {
  discovery?: LeadDiscoveryProvider;
  enrichment?: ContactEnrichmentProvider;
  audit?: DigitalAuditProvider;
  ads?: AdsProvider;
  ai?: AIProvider;
};

export const providerNames = [
  "google",
  "maps",
  "meta",
  "linkedin",
  "email",
  "whatsapp",
  "enrichment",
  "ai",
] as const;
