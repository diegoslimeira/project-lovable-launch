export type JobState = "pending" | "running" | "completed" | "failed" | "retrying";

export type SourceRecord = {
  source: string;
  // Fase D — id do registro na própria fonte (ex.: Google Place ID). Chave
  // externa principal para deduplicação e auditoria; opcional porque fontes
  // futuras podem não ter um id estável, e o mock nunca tem.
  externalId?: string;
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
  // Fase D — coordenadas da fonte real, quando disponíveis. Não persistidas
  // em Lead nesta fase (só usadas por providers/dedup); guardadas aqui para
  // não precisar mudar a interface de novo quando forem úteis.
  latitude?: number;
  longitude?: number;
  phone?: string;
  website?: string;
  category?: string;
  // Fase D — status operacional da fonte (ex.: "OPERATIONAL",
  // "CLOSED_PERMANENTLY"), quando disponível. Informativo nesta fase.
  businessStatus?: string;
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
  "trafego_pago" | "redes_sociais" | "identidade_visual" | "gmb" | "site" | "reputacao";

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
    // Fase C.2 — quantos candidatos gerar nesta chamada (o tamanho do lote
    // atual, não o total da campanha) e a partir de qual posição, para que o
    // orquestrador consiga pedir discovery em fatias pequenas em vez de gerar
    // a campanha inteira em uma única invocação.
    limit: number;
    offset?: number;
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
