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
  // Fase E.1 — site normalizado (domínio, sem protocolo/www/path) da
  // EMPRESA, não do contato. Fica aqui em vez de um tipo novo porque
  // ContactEnrichmentProvider já é o slot único de Enrichment no pipeline
  // (mesmo padrão de troca mock/real usado no Discovery); um provider real
  // como o Google Places pode preencher só phone/website e deixar
  // name/role/email/linkedin/instagram ausentes, sem inventar decisor.
  website?: string;
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

// Fase E.2 — sinal individual observado perto de um candidato a CNPJ (ex.:
// "rótulo CNPJ próximo", "contexto de terceiro: desenvolvido por"). `positive`
// indica se o sinal reforça (true) ou enfraquece (false) a hipótese de que o
// CNPJ pertence à própria empresa do lead, não a uma agência/plataforma/
// fornecedor. Existe para tornar o scoring do CnpjResolver auditável — nunca
// um número "mágico" sem explicação (ver relatório da Fase E.2).
export type CnpjSignal = {
  label: string;
  positive: boolean;
};

// Um candidato a CNPJ encontrado durante a resolução. `context` é um trecho
// CURTO e limitado ao redor da ocorrência (nunca a página inteira) — é o que
// fica persistido para auditoria quando o match é aceito; nunca HTML bruto.
export type CnpjCandidate = {
  cnpj: string;
  foundOnUrl: string;
  context: string;
  signals: CnpjSignal[];
};

export type CnpjResolutionOutcome = "high_confidence" | "ambiguous" | "not_found";

// Resultado de CnpjResolver.resolve() — um candidato (quando houver) com
// confiança CALCULADA SÓ A PARTIR DOS SINAIS DO PRÓPRIO SCAN (não sabe nada
// sobre dados cadastrais oficiais; ver CompanyRegistryProvider). `cnpj` só é
// preenchido quando outcome === "high_confidence". `candidates` sempre lista
// TODOS os candidatos considerados (mesmo em ambiguous/not_found), para
// auditoria.
export type CnpjResolution = {
  outcome: CnpjResolutionOutcome;
  cnpj?: string;
  confidence: number;
  candidates: CnpjCandidate[];
  reason: string;
  source: string;
};

// Fase E.2 — responsabilidade única: descobrir QUAL CNPJ pertence a um lead.
// Deliberadamente separado de CompanyRegistryProvider (que só busca dados
// dado um CNPJ já resolvido) — ver relatório da Fase E.2 para a justificativa
// completa da separação. Primeira implementação: WebsiteCnpjResolver.
export interface CnpjResolver {
  resolve(company: CompanyCandidate): Promise<CnpjResolution>;
}

// Fase E.2 — dado cadastral oficial de uma empresa, tal como devolvido pela
// fonte de registro (ex.: OpenCNPJ). Contrato do provider: recebe um CNPJ JÁ
// RESOLVIDO e só devolve dados oficiais — nunca decide qual CNPJ usar (isso é
// responsabilidade do CnpjResolver, não deste tipo/provider). Campos
// alinhados à lista explicitamente pedida (sem QSA/CPF/faturamento/dados
// pessoais de sócio).
export type RegistryCompanyData = {
  cnpj: string;
  legalName: string;
  tradeName?: string;
  registrationStatus: string;
  primaryCnae?: string;
  secondaryCnaes?: string[];
  openedAt?: string;
  size?: string;
  legalNature?: string;
  address?: string;
  city?: string;
  state?: string;
  postalCode?: string;
};

export interface CompanyRegistryProvider {
  // Retorna null quando o CNPJ é válido mas não foi encontrado na base da
  // fonte consultada — nunca inventa dado. Lança erro em falha técnica real
  // (rede, formato de resposta inesperado) para que o caller trate
  // explicitamente, sem confundir "não encontrado" com "erro".
  lookup(cnpj: string): Promise<RegistryCompanyData | null>;
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
