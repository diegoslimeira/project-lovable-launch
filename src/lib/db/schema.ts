import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core";
import type {
  ClientClosing,
  EvidenceType,
  LostDeal,
  Qualification,
  MeetingOutcome,
} from "../prospecting";
import type { AuditResult, Copy, ValidationResult } from "../providers";

// Fase A — fundação mínima de schema. Modela as entidades pedidas naquela
// fase (User/Workspace/WorkspaceMember/Campaign/Lead/ProcessingTask/
// Diagnosis+DiagnosisSection/AuditFinding/ServiceOpportunity/ContactAttempt/
// LeadResponse/Meeting/Negotiation).
//
// Fase B — migration 0001 acrescenta Qualification/ClientClosing/LostDeal
// (JSON no próprio lead, mesmo tratamento de evidence/copy: são objetos
// únicos opcionais por lead, não coleções) e o campo evidence em
// diagnosis_sections (faltava para espelhar DiagnosisSection.evidence,
// que é AuditResult["findings"], não os achados normalizados de
// audit_findings). Repositories agora leem/escrevem D1 de verdade — ver
// src/lib/repositories/*.ts.

export const users = sqliteTable("users", {
  id: text("id").primaryKey(),
  email: text("email").notNull().unique(),
  name: text("name"),
  createdAt: text("created_at").notNull(),
});

export const workspaces = sqliteTable("workspaces", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  createdAt: text("created_at").notNull(),
});

// Isolamento real entre workspaces: toda tabela abaixo que guarda dado
// comercial carrega workspaceId diretamente (não só via join por campanha/
// lead), para autorização em uma query sem N+1 joins.
export const workspaceMembers = sqliteTable("workspace_members", {
  id: text("id").primaryKey(),
  workspaceId: text("workspace_id")
    .notNull()
    .references(() => workspaces.id),
  userId: text("user_id")
    .notNull()
    .references(() => users.id),
  role: text("role").notNull(),
  createdAt: text("created_at").notNull(),
});

export const campaigns = sqliteTable("campaigns", {
  id: text("id").primaryKey(),
  workspaceId: text("workspace_id")
    .notNull()
    .references(() => workspaces.id),
  name: text("name").notNull(),
  segment: text("segment").notNull(),
  location: text("location").notNull(),
  radius: integer("radius").notNull(),
  quantity: integer("quantity").notNull(),
  decisionMakers: text("decision_makers", { mode: "json" }).$type<string[]>().notNull(),
  offer: text("offer").notNull(),
  objective: text("objective").notNull(),
  channels: text("channels", { mode: "json" }).$type<string[]>().notNull(),
  progress: integer("progress").notNull().default(0),
  createdAt: text("created_at").notNull(),
});

export const leads = sqliteTable("leads", {
  id: text("id").primaryKey(),
  workspaceId: text("workspace_id")
    .notNull()
    .references(() => workspaces.id),
  campaignId: text("campaign_id")
    .notNull()
    .references(() => campaigns.id),
  sourceJobId: text("source_job_id"),
  // Fase E.1 — id do lead na fonte real de discovery que o criou (ex.:
  // Google Place ID). Necessário para reutilizar a mesma fonte em
  // Enrichment (Place Details) sem repetir uma busca por texto. Genérico
  // (não "google_place_id") porque uma fonte futura (CNPJ etc.) também
  // poderia popular este campo com seu próprio identificador externo.
  externalId: text("external_id"),
  company: text("company").notNull(),
  segment: text("segment").notNull(),
  city: text("city").notNull(),
  state: text("state").notNull(),
  decisionMaker: text("decision_maker").notNull(),
  role: text("role").notNull(),
  phone: text("phone"),
  whatsapp: text("whatsapp"),
  email: text("email"),
  instagram: text("instagram"),
  website: text("website"),
  linkedin: text("linkedin"),
  ads: integer("ads", { mode: "boolean" }).notNull().default(false),
  score: integer("score").notNull().default(0),
  confidence: integer("confidence").notNull().default(0),
  opportunity: text("opportunity").notNull(),
  status: text("status").notNull(),
  // Espelha Lead.evidence[]/Lead.copy do domínio mock atual — não foram
  // pedidos como entidade própria nesta fase, ficam como JSON no próprio lead.
  evidence: text("evidence", { mode: "json" }).$type<
    { label: string; value: string; type: EvidenceType; source: string }[]
  >(),
  copy: text("copy", { mode: "json" }).$type<Copy>(),
  // Fase B: objetos únicos opcionais por lead — mesmo tratamento de
  // evidence/copy acima, não são coleções e não foram pedidos como
  // entidade própria.
  qualification: text("qualification", { mode: "json" }).$type<Qualification>(),
  validation: text("validation", { mode: "json" }).$type<ValidationResult>(),
  clientClosing: text("client_closing", { mode: "json" }).$type<ClientClosing>(),
  lostDeal: text("lost_deal", { mode: "json" }).$type<LostDeal>(),
  diagnosis: text("diagnosis").notNull(),
  microInsight: text("micro_insight").notNull(),
  suggestedMessage: text("suggested_message").notNull(),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

// Mapeia ProspectingJob (src/lib/pipeline.ts) — stage é uma das 8 etapas
// técnicas do pipeline (discovery..copy), state é o JobState atual.
export const processingTasks = sqliteTable("processing_tasks", {
  id: text("id").primaryKey(),
  workspaceId: text("workspace_id")
    .notNull()
    .references(() => workspaces.id),
  campaignId: text("campaign_id")
    .notNull()
    .references(() => campaigns.id),
  stage: text("stage").notNull(),
  state: text("state").notNull(),
  processed: integer("processed").notNull().default(0),
  total: integer("total").notNull().default(0),
  attempts: integer("attempts").notNull().default(0),
  error: text("error"),
});

export const diagnoses = sqliteTable("diagnoses", {
  id: text("id").primaryKey(),
  workspaceId: text("workspace_id")
    .notNull()
    .references(() => workspaces.id),
  leadId: text("lead_id")
    .notNull()
    .references(() => leads.id),
  generatedAt: text("generated_at").notNull(),
  narrative: text("narrative").notNull(),
  confidence: integer("confidence").notNull(),
});

export const diagnosisSections = sqliteTable("diagnosis_sections", {
  id: text("id").primaryKey(),
  diagnosisId: text("diagnosis_id")
    .notNull()
    .references(() => diagnoses.id),
  dimension: text("dimension").notNull(),
  summary: text("summary").notNull(),
  impact: text("impact").notNull(),
  confidence: integer("confidence").notNull(),
  keyFindings: text("key_findings", { mode: "json" }).$type<string[]>(),
  opportunities: text("opportunities", { mode: "json" }).$type<string[]>(),
  // Fase B: faltava para espelhar DiagnosisSection.evidence completo
  // (AuditResult["findings"][]) — distinto dos achados normalizados em
  // audit_findings, que representam Lead.auditFindings, não este campo.
  evidence: text("evidence", { mode: "json" }).$type<AuditResult["findings"]>(),
});

// Uma linha por achado (não por AuditResult inteiro) — granularidade que
// permite filtrar/agregar achados no futuro sem parsear JSON.
export const auditFindings = sqliteTable("audit_findings", {
  id: text("id").primaryKey(),
  workspaceId: text("workspace_id")
    .notNull()
    .references(() => workspaces.id),
  leadId: text("lead_id")
    .notNull()
    .references(() => leads.id),
  dimension: text("dimension").notNull(),
  subject: text("subject").notNull(),
  label: text("label").notNull(),
  value: text("value").notNull(),
  type: text("type").notNull(),
  evidence: text("evidence"),
  confidence: integer("confidence").notNull(),
});

export const serviceOpportunities = sqliteTable("service_opportunities", {
  id: text("id").primaryKey(),
  workspaceId: text("workspace_id")
    .notNull()
    .references(() => workspaces.id),
  leadId: text("lead_id")
    .notNull()
    .references(() => leads.id),
  service: text("service").notNull(),
  category: text("category").notNull(),
  rationale: text("rationale").notNull(),
  priority: text("priority").notNull(),
  evidenceRefs: text("evidence_refs", { mode: "json" }).$type<string[]>(),
  createdAt: text("created_at").notNull(),
});

export const contactAttempts = sqliteTable("contact_attempts", {
  id: text("id").primaryKey(),
  workspaceId: text("workspace_id")
    .notNull()
    .references(() => workspaces.id),
  leadId: text("lead_id")
    .notNull()
    .references(() => leads.id),
  channel: text("channel").notNull(),
  createdAt: text("created_at").notNull(),
  status: text("status").notNull(),
  message: text("message").notNull(),
  subject: text("subject"),
});

export const leadResponses = sqliteTable("lead_responses", {
  id: text("id").primaryKey(),
  workspaceId: text("workspace_id")
    .notNull()
    .references(() => workspaces.id),
  leadId: text("lead_id")
    .notNull()
    .references(() => leads.id),
  createdAt: text("created_at").notNull(),
  channel: text("channel").notNull(),
  content: text("content").notNull(),
  note: text("note"),
  classification: text("classification"),
  classifiedAt: text("classified_at"),
});

export const meetings = sqliteTable("meetings", {
  id: text("id").primaryKey(),
  workspaceId: text("workspace_id")
    .notNull()
    .references(() => workspaces.id),
  leadId: text("lead_id")
    .notNull()
    .references(() => leads.id),
  campaignId: text("campaign_id")
    .notNull()
    .references(() => campaigns.id),
  scheduledAt: text("scheduled_at").notNull(),
  durationMinutes: integer("duration_minutes").notNull(),
  responsibleName: text("responsible_name"),
  title: text("title").notNull(),
  notes: text("notes"),
  status: text("status").notNull(),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
  completedAt: text("completed_at"),
  // Espelha MeetingOutcome (incl. proposal aninhada) do domínio mock atual —
  // continua JSON aqui: é um bloco rico já estruturado no próprio tipo, não
  // foi pedido como entidade própria nesta fase.
  outcome: text("outcome", { mode: "json" }).$type<MeetingOutcome>(),
  resultNotes: text("result_notes"),
  provider: text("provider").notNull().default("internal"),
  externalCalendarEventId: text("external_calendar_event_id"),
  meetingUrl: text("meeting_url"),
  syncStatus: text("sync_status"),
});

// Fase E.2 — perfil cadastral oficial (CNPJ) do lead, quando resolvido com
// segurança (ver CnpjResolver/CompanyRegistryProvider em src/lib/providers.ts
// e src/lib/prospecting-service.ts). Tabela própria em vez de colunas em
// `leads`: mantém `leads` enxuta, guarda os metadados de auditoria do match
// (matchConfidence/matchSource/matchEvidence/registrySource/
// registryFetchedAt) ao lado dos dados oficiais em vez de espalhá-los, e deixa
// espaço para histórico/reconsulta futura sem precisar migrar de coluna solta
// para tabela depois. Uma linha por lead nesta fase (upsert por leadId,
// mesmo padrão de `negotiations` abaixo — sem unique constraint ainda).
export const companyRegistryProfiles = sqliteTable("company_registry_profiles", {
  id: text("id").primaryKey(),
  workspaceId: text("workspace_id")
    .notNull()
    .references(() => workspaces.id),
  leadId: text("lead_id")
    .notNull()
    .references(() => leads.id),
  cnpj: text("cnpj").notNull(),
  legalName: text("legal_name").notNull(),
  tradeName: text("trade_name"),
  registrationStatus: text("registration_status").notNull(),
  primaryCnae: text("primary_cnae"),
  secondaryCnaes: text("secondary_cnaes", { mode: "json" }).$type<string[]>(),
  openedAt: text("opened_at"),
  size: text("size"),
  legalNature: text("legal_nature"),
  address: text("address"),
  city: text("city"),
  state: text("state"),
  postalCode: text("postal_code"),
  // Metadados de AUDITORIA do match em si — nunca dado cadastral.
  // matchEvidence guarda só os candidatos considerados (CNPJ + URL onde
  // apareceu + trecho curto de contexto + sinais), nunca HTML bruto nem texto
  // integral de página (ver CnpjCandidate em providers.ts).
  matchConfidence: integer("match_confidence").notNull(),
  matchSource: text("match_source").notNull(),
  matchEvidence: text("match_evidence", { mode: "json" }).$type<
    {
      cnpj: string;
      foundOnUrl: string;
      context: string;
      signals: { label: string; positive: boolean }[];
    }[]
  >(),
  registrySource: text("registry_source").notNull(),
  registryFetchedAt: text("registry_fetched_at").notNull(),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

// Um registro de negociação ativa por lead nesta fase (sem unique constraint
// ainda) — modelado como tabela própria, não JSON no lead, porque é a
// entidade com maior chance de precisar de histórico de rodadas no futuro;
// migrar de JSON para tabela depois seria caro, fazer certo agora é barato.
export const negotiations = sqliteTable("negotiations", {
  id: text("id").primaryKey(),
  workspaceId: text("workspace_id")
    .notNull()
    .references(() => workspaces.id),
  leadId: text("lead_id")
    .notNull()
    .references(() => leads.id),
  status: text("status").notNull().default("active"),
  startedAt: text("started_at").notNull(),
  updatedAt: text("updated_at").notNull(),
  value: integer("value"),
  commercialTerms: text("commercial_terms"),
  mainObjection: text("main_objection"),
  nextStep: text("next_step"),
  nextFollowUpAt: text("next_follow_up_at"),
  notes: text("notes"),
});
