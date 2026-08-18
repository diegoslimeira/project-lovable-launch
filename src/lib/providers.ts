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

export type AuditDimension =
  | "social_media"
  | "gmb"
  | "website"
  | "reviews"
  | "visual_identity"
  | "ads"
  | "reclame_aqui"
  | "other";

export type AuditResult = {
  dimension: AuditDimension;
  subject: string;
  findings: {
    label: string;
    value: string;
    type: "Fato verificado" | "Inferência" | "Oportunidade" | "Hipótese" | "Não confirmado";
    evidence?: string;
  }[];
  confidence: number;
};

export type ValidationCheck = {
  field: string;
  valid: boolean;
  reason?: string;
};

export type ValidationResult = {
  checks: ValidationCheck[];
  valid: boolean;
  confidence: number;
};

export type DiagnosisSection = {
  dimension: AuditDimension;
  summary: string;
  keyFindings: string[];
  evidence: AuditResult["findings"];
  impact: "alto" | "médio" | "baixo";
  opportunities: string[];
  confidence: number;
};

export type Diagnosis = {
  generatedAt: string;
  sections: DiagnosisSection[];
  narrative: string;
  confidence: number;
};

export type ServiceCategory =
  | "trafego_pago"
  | "redes_sociais"
  | "identidade_visual"
  | "gmb"
  | "site"
  | "reputacao";

export type ServiceOpportunity = {
  id: string;
  service: string;
  category: ServiceCategory;
  rationale: string;
  priority: "baixa" | "média" | "alta";
  evidenceRefs: string[];
};

export type CopyChannel = "whatsapp" | "email" | "linkedin";

export type CopyHook = {
  dimension: AuditDimension;
  summary: string;
  reason: string;
};

export type ChannelCopy = {
  channel: CopyChannel;
  subject?: string;
  body: string;
  cta: string;
};

export type Copy = {
  generatedAt: string;
  hook: CopyHook;
  whatsapp: ChannelCopy;
  email: ChannelCopy;
  linkedin: ChannelCopy;
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

export interface ContactValidationProvider {
  validate(input: {
    contact?: {
      name?: string;
      role?: string;
      email?: string;
      phone?: string;
      instagram?: string;
      website?: string;
    };
    company: CompanyCandidate;
  }): Promise<ValidationResult>;
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
    contact?: { name?: string; role?: string };
    auditFindings: AuditResult[];
    validation?: ValidationResult;
    offer: string;
  }): Promise<Diagnosis>;
}

export interface CopyProvider {
  generate(input: {
    company: CompanyCandidate;
    contact?: { name?: string; role?: string };
    diagnosis: Diagnosis;
    opportunities: ServiceOpportunity[];
    score: number;
    priority: "baixa" | "média" | "alta";
    offer: string;
    objective: string;
  }): Promise<Copy>;
}

export type ProspectingProviders = {
  discovery?: LeadDiscoveryProvider;
  enrichment?: ContactEnrichmentProvider;
  validation?: ContactValidationProvider;
  audit?: DigitalAuditProvider;
  ads?: AdsProvider;
  ai?: AIProvider;
  copy?: CopyProvider;
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
