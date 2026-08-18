import { createServerFn } from "@tanstack/react-start";
import { and, eq, inArray } from "drizzle-orm";
import type { ContactChannel, Lead, LeadStatus, ResponseClassification } from "../prospecting";
import type { AuditDimension, AuditResult, Diagnosis, ServiceCategory } from "../providers";
import { getCurrentWorkspaceId, getDb } from "../db/client";
import {
  auditFindings,
  contactAttempts,
  diagnoses,
  diagnosisSections,
  leadResponses,
  leads,
  negotiations,
  serviceOpportunities,
} from "../db/schema";

// Fase B — leadRepository é o mais complexo dos quatro porque Lead carrega
// vários campos "ricos" que, no D1 (Fase A), foram modelados de duas formas
// diferentes:
//   - coleções normalizadas em tabela própria (audit_findings,
//     service_opportunities, contact_attempts, lead_responses,
//     diagnoses+diagnosis_sections) — a UI sempre substitui o array inteiro
//     de uma vez (nunca faz append incremental no patch), então
//     escrever = apagar tudo daquele lead + inserir o novo conjunto;
//   - objetos únicos opcionais como coluna JSON direta em leads (evidence,
//     copy, qualification, validation, clientClosing, lostDeal).
// negotiation é a exceção: tabela própria, mas 1 registro ativo por lead
// nesta fase (sem histórico ainda) — ver src/lib/db/schema.ts.
//
// Nenhum desses tipos-satélite (AuditResult, DiagnosisSection, Negotiation…)
// tem campo `id` no domínio; os ids de linha em audit_findings/
// diagnosis_sections/diagnoses/negotiations são só de armazenamento, gerados
// aqui, nunca expostos de volta pela API (o domínio continua sem esses ids).
//
// Nota sobre `as Lead` nos mappers abaixo: o tsconfig usa
// exactOptionalPropertyTypes, que distingue `campo?: T` de `campo: T |
// undefined` — construir os objetos com `?? undefined` (equivalente em
// runtime a omitir a chave) é seguro, mas o TS não aceita isso
// estruturalmente sem verbosidade grande (spread condicional por campo).
// Preferimos o assert explícito aqui a inflar este arquivo já grande.

type LeadRow = typeof leads.$inferSelect;
type Db = ReturnType<typeof getDb>;

function createRowId(prefix: string): string {
  return `${prefix}-${crypto.randomUUID()}`;
}

// D1 rejeita statements com muitos parâmetros vinculados (limite bem mais
// baixo que o default do SQLite). Campanhas reais chegam a centenas de leads
// num único createMany, então todo insert em lote precisa ser fatiado por
// número de colunas da linha, não só por quantidade de linhas.
function chunk<T>(items: T[], size: number): T[][] {
  const batches: T[][] = [];
  for (let i = 0; i < items.length; i += size) batches.push(items.slice(i, i + size));
  return batches;
}

function batchSizeFor(row: Record<string, unknown>, maxParams = 90): number {
  return Math.max(1, Math.floor(maxParams / Object.keys(row).length));
}

async function insertBatched<T extends Record<string, unknown>>(
  insertOne: (batch: T[]) => Promise<unknown>,
  rows: T[],
) {
  if (!rows.length) return;
  const batchSize = batchSizeFor(rows[0]!);
  for (const batch of chunk(rows, batchSize)) {
    await insertOne(batch);
  }
}

// --- AuditResult <-> audit_findings (1 linha por finding, agrupado por
// dimension+subject na leitura para reconstituir o AuditResult) ---

function flattenAuditResults(auditResults: AuditResult[]) {
  return auditResults.flatMap((result) =>
    result.findings.map((finding) => ({
      dimension: result.dimension,
      subject: result.subject,
      label: finding.label,
      value: finding.value,
      type: finding.type,
      evidence: finding.evidence,
      confidence: result.confidence,
    })),
  );
}

function groupAuditFindingRows(rows: (typeof auditFindings.$inferSelect)[]): AuditResult[] {
  const groups = new Map<string, AuditResult>();
  for (const row of rows) {
    const key = `${row.dimension}|${row.subject}`;
    let group = groups.get(key);
    if (!group) {
      group = {
        dimension: row.dimension as AuditDimension,
        subject: row.subject,
        confidence: row.confidence,
        findings: [],
      };
      groups.set(key, group);
    }
    group.findings.push({
      label: row.label,
      value: row.value,
      type: row.type as AuditResult["findings"][number]["type"],
      evidence: row.evidence ?? undefined,
    } as AuditResult["findings"][number]);
  }
  return [...groups.values()];
}

async function assembleLead(db: Db, row: LeadRow): Promise<Lead> {
  const leadId = row.id;
  const [auditRows, oppRows, contactRows, responseRows, diagnosisRows, negotiationRows] =
    await Promise.all([
      db.select().from(auditFindings).where(eq(auditFindings.leadId, leadId)),
      db.select().from(serviceOpportunities).where(eq(serviceOpportunities.leadId, leadId)),
      db.select().from(contactAttempts).where(eq(contactAttempts.leadId, leadId)),
      db.select().from(leadResponses).where(eq(leadResponses.leadId, leadId)),
      db.select().from(diagnoses).where(eq(diagnoses.leadId, leadId)),
      db.select().from(negotiations).where(eq(negotiations.leadId, leadId)),
    ]);

  let diagnosisReport: Diagnosis | undefined;
  if (diagnosisRows.length > 0) {
    const latest = [...diagnosisRows].sort((a, b) =>
      b.generatedAt.localeCompare(a.generatedAt),
    )[0]!;
    const sectionRows = await db
      .select()
      .from(diagnosisSections)
      .where(eq(diagnosisSections.diagnosisId, latest.id));
    diagnosisReport = {
      generatedAt: latest.generatedAt,
      narrative: latest.narrative,
      confidence: latest.confidence,
      sections: sectionRows.map((section) => ({
        dimension: section.dimension as AuditDimension,
        summary: section.summary,
        keyFindings: section.keyFindings ?? [],
        evidence: section.evidence ?? [],
        impact: section.impact as "alto" | "médio" | "baixo",
        opportunities: section.opportunities ?? [],
        confidence: section.confidence,
      })),
    };
  }

  const negotiationRow = negotiationRows[0];

  return {
    id: row.id,
    campaignId: row.campaignId,
    sourceJobId: row.sourceJobId ?? undefined,
    company: row.company,
    segment: row.segment,
    city: row.city,
    state: row.state,
    decisionMaker: row.decisionMaker,
    role: row.role,
    phone: row.phone ?? undefined,
    whatsapp: row.whatsapp ?? undefined,
    email: row.email ?? undefined,
    instagram: row.instagram ?? undefined,
    website: row.website ?? undefined,
    linkedin: row.linkedin ?? undefined,
    ads: row.ads,
    score: row.score,
    confidence: row.confidence,
    opportunity: row.opportunity,
    status: row.status as LeadStatus,
    evidence: row.evidence ?? [],
    validation: row.validation ?? undefined,
    auditFindings: auditRows.length > 0 ? groupAuditFindingRows(auditRows) : undefined,
    diagnosisReport,
    opportunities:
      oppRows.length > 0
        ? oppRows.map((opp) => ({
            id: opp.id,
            service: opp.service,
            category: opp.category as ServiceCategory,
            rationale: opp.rationale,
            priority: opp.priority as "baixa" | "média" | "alta",
            evidenceRefs: opp.evidenceRefs ?? [],
          }))
        : undefined,
    copy: row.copy ?? undefined,
    contactAttempts:
      contactRows.length > 0
        ? contactRows.map((attempt) => ({
            id: attempt.id,
            channel: attempt.channel as ContactChannel,
            createdAt: attempt.createdAt,
            status: attempt.status as "aberto" | "confirmado",
            message: attempt.message,
            subject: attempt.subject ?? undefined,
          }))
        : undefined,
    responses:
      responseRows.length > 0
        ? responseRows.map((response) => ({
            id: response.id,
            createdAt: response.createdAt,
            channel: response.channel as ContactChannel,
            content: response.content,
            note: response.note ?? undefined,
            classification: (response.classification as ResponseClassification | null) ?? undefined,
            classifiedAt: response.classifiedAt ?? undefined,
          }))
        : undefined,
    qualification: row.qualification ?? undefined,
    negotiation: negotiationRow
      ? {
          startedAt: negotiationRow.startedAt,
          updatedAt: negotiationRow.updatedAt,
          value: negotiationRow.value ?? undefined,
          commercialTerms: negotiationRow.commercialTerms ?? undefined,
          mainObjection: negotiationRow.mainObjection ?? undefined,
          nextStep: negotiationRow.nextStep ?? undefined,
          nextFollowUpAt: negotiationRow.nextFollowUpAt ?? undefined,
          notes: negotiationRow.notes ?? undefined,
        }
      : undefined,
    clientClosing: row.clientClosing ?? undefined,
    lostDeal: row.lostDeal ?? undefined,
    diagnosis: row.diagnosis,
    microInsight: row.microInsight,
    suggestedMessage: row.suggestedMessage,
  } as Lead;
}

// Campos "ricos" de Lead que não são colunas escalares/JSON diretas de
// `leads` — cada um exige sua própria estratégia de escrita abaixo.
const RICH_FIELDS = [
  "auditFindings",
  "opportunities",
  "contactAttempts",
  "responses",
  "diagnosisReport",
  "negotiation",
] as const;
type RichField = (typeof RICH_FIELDS)[number];

// Genérica em T para preservar, no retorno, se o campo era obrigatório no
// argumento de entrada (createManyLeadsFn passa um Lead completo; updateLeadFn
// passa um Partial<Lead>) — um retorno fixo em Partial<...> perderia essa
// distinção e quebraria o insert (que exige os campos obrigatórios de Lead).
function scalarPatch<T extends Partial<Lead>>(patch: T): Omit<T, RichField> {
  const clone = { ...patch };
  for (const field of RICH_FIELDS) delete clone[field as keyof T];
  return clone;
}

async function writeLeadChildren(
  db: Db,
  workspaceId: string,
  leadId: string,
  patch: Partial<Lead>,
) {
  if (patch.auditFindings !== undefined) {
    await db.delete(auditFindings).where(eq(auditFindings.leadId, leadId));
    const flattened = flattenAuditResults(patch.auditFindings);
    if (flattened.length > 0) {
      await insertBatched(
        (batch) => db.insert(auditFindings).values(batch),
        flattened.map((finding) => ({ id: createRowId("audit"), workspaceId, leadId, ...finding })),
      );
    }
  }

  if (patch.opportunities !== undefined) {
    await db.delete(serviceOpportunities).where(eq(serviceOpportunities.leadId, leadId));
    if (patch.opportunities.length > 0) {
      await insertBatched(
        (batch) => db.insert(serviceOpportunities).values(batch),
        patch.opportunities.map((opp) => ({
          // opp.id vem do domínio como `${dimension}-${category}` (ver
          // pipeline.ts) — não é globalmente único entre leads, só serve de
          // key local dentro do array de um lead. Como chave primária da
          // linha precisamos de algo único no banco; geramos um id de
          // armazenamento novo aqui e devolvemos ele como `id` na leitura
          // (assembleLead), o que é seguro porque nada depende do valor
          // original além de key de lista na UI.
          id: createRowId("opportunity"),
          workspaceId,
          leadId,
          service: opp.service,
          category: opp.category,
          rationale: opp.rationale,
          priority: opp.priority,
          evidenceRefs: opp.evidenceRefs,
          createdAt: new Date().toISOString(),
        })),
      );
    }
  }

  if (patch.contactAttempts !== undefined) {
    await db.delete(contactAttempts).where(eq(contactAttempts.leadId, leadId));
    if (patch.contactAttempts.length > 0) {
      await insertBatched(
        (batch) => db.insert(contactAttempts).values(batch),
        patch.contactAttempts.map((attempt) => ({
          id: attempt.id,
          workspaceId,
          leadId,
          channel: attempt.channel,
          createdAt: attempt.createdAt,
          status: attempt.status,
          message: attempt.message,
          subject: attempt.subject,
        })),
      );
    }
  }

  if (patch.responses !== undefined) {
    await db.delete(leadResponses).where(eq(leadResponses.leadId, leadId));
    if (patch.responses.length > 0) {
      await insertBatched(
        (batch) => db.insert(leadResponses).values(batch),
        patch.responses.map((response) => ({
          id: response.id,
          workspaceId,
          leadId,
          createdAt: response.createdAt,
          channel: response.channel,
          content: response.content,
          note: response.note,
          classification: response.classification,
          classifiedAt: response.classifiedAt,
        })),
      );
    }
  }

  if (patch.diagnosisReport !== undefined) {
    const existing = await db
      .select({ id: diagnoses.id })
      .from(diagnoses)
      .where(eq(diagnoses.leadId, leadId));
    if (existing.length > 0) {
      await db.delete(diagnosisSections).where(
        inArray(
          diagnosisSections.diagnosisId,
          existing.map((row) => row.id),
        ),
      );
      await db.delete(diagnoses).where(eq(diagnoses.leadId, leadId));
    }
    const diagnosisId = createRowId("diagnosis");
    await db.insert(diagnoses).values({
      id: diagnosisId,
      workspaceId,
      leadId,
      generatedAt: patch.diagnosisReport.generatedAt,
      narrative: patch.diagnosisReport.narrative,
      confidence: patch.diagnosisReport.confidence,
    });
    if (patch.diagnosisReport.sections.length > 0) {
      await insertBatched(
        (batch) => db.insert(diagnosisSections).values(batch),
        patch.diagnosisReport.sections.map((section) => ({
          id: createRowId("section"),
          diagnosisId,
          dimension: section.dimension,
          summary: section.summary,
          impact: section.impact,
          confidence: section.confidence,
          keyFindings: section.keyFindings,
          opportunities: section.opportunities,
          evidence: section.evidence,
        })),
      );
    }
  }

  if (patch.negotiation !== undefined) {
    const existing = await db
      .select({ id: negotiations.id })
      .from(negotiations)
      .where(eq(negotiations.leadId, leadId));
    const negotiation = patch.negotiation;
    if (existing.length > 0) {
      await db
        .update(negotiations)
        .set({
          updatedAt: negotiation.updatedAt,
          value: negotiation.value,
          commercialTerms: negotiation.commercialTerms,
          mainObjection: negotiation.mainObjection,
          nextStep: negotiation.nextStep,
          nextFollowUpAt: negotiation.nextFollowUpAt,
          notes: negotiation.notes,
        })
        .where(eq(negotiations.leadId, leadId));
    } else {
      await db.insert(negotiations).values({
        id: createRowId("negotiation"),
        workspaceId,
        leadId,
        startedAt: negotiation.startedAt,
        updatedAt: negotiation.updatedAt,
        value: negotiation.value,
        commercialTerms: negotiation.commercialTerms,
        mainObjection: negotiation.mainObjection,
        nextStep: negotiation.nextStep,
        nextFollowUpAt: negotiation.nextFollowUpAt,
        notes: negotiation.notes,
      });
    }
  }
}

const createManyLeadsFn = createServerFn({ method: "POST" })
  .validator((leadsToCreate: Lead[]) => leadsToCreate)
  .handler(async ({ data: leadsToCreate }) => {
    if (!leadsToCreate.length) return leadsToCreate;
    const db = getDb();
    const workspaceId = getCurrentWorkspaceId();
    const now = new Date().toISOString();
    await insertBatched(
      (batch) => db.insert(leads).values(batch),
      leadsToCreate.map((lead) => ({
        ...scalarPatch(lead),
        id: lead.id,
        workspaceId,
        campaignId: lead.campaignId ?? "",
        evidence: lead.evidence,
        createdAt: now,
        updatedAt: now,
      })),
    );
    await Promise.all(
      leadsToCreate.map((lead) => writeLeadChildren(db, workspaceId, lead.id, lead)),
    );
    return leadsToCreate;
  });

const listLeadsFn = createServerFn({ method: "GET" }).handler(async () => {
  const db = getDb();
  const workspaceId = getCurrentWorkspaceId();
  const rows = await db.select().from(leads).where(eq(leads.workspaceId, workspaceId));
  return Promise.all(rows.map((row) => assembleLead(db, row)));
});

const listLeadsByCampaignFn = createServerFn({ method: "GET" })
  .validator((campaignId: string) => campaignId)
  .handler(async ({ data: campaignId }) => {
    const db = getDb();
    const workspaceId = getCurrentWorkspaceId();
    const rows = await db
      .select()
      .from(leads)
      .where(and(eq(leads.campaignId, campaignId), eq(leads.workspaceId, workspaceId)));
    return Promise.all(rows.map((row) => assembleLead(db, row)));
  });

const getLeadFn = createServerFn({ method: "GET" })
  .validator((id: string) => id)
  .handler(async ({ data: id }) => {
    const db = getDb();
    const workspaceId = getCurrentWorkspaceId();
    const rows = await db
      .select()
      .from(leads)
      .where(and(eq(leads.id, id), eq(leads.workspaceId, workspaceId)));
    return rows[0] ? assembleLead(db, rows[0]) : undefined;
  });

const updateLeadFn = createServerFn({ method: "POST" })
  .validator((input: { id: string; patch: Partial<Lead> }) => input)
  .handler(async ({ data: { id, patch } }) => {
    const db = getDb();
    const workspaceId = getCurrentWorkspaceId();
    const scalars = scalarPatch(patch);
    // writeLeadChildren roda antes do update escalar de propósito: vários
    // estágios do pipeline (ex. applyOpportunities) usam um campo escalar
    // (evidence) como guarda de "já processado" para não duplicar trabalho
    // em retomadas. Se o update escalar committasse primeiro e a escrita dos
    // filhos falhasse depois, a guarda ficaria marcada sem os dados
    // correspondentes existirem — uma retomada então pularia o lead
    // silenciosamente para sempre. Escrevendo os filhos primeiro, uma falha
    // aí não deixa nenhum rastro escalar e o lead é reprocessado
    // corretamente na próxima tentativa.
    await writeLeadChildren(db, workspaceId, id, patch);
    await db
      .update(leads)
      .set({ ...scalars, updatedAt: new Date().toISOString() })
      .where(eq(leads.id, id));
    const rows = await db.select().from(leads).where(eq(leads.id, id));
    return rows[0] ? assembleLead(db, rows[0]) : undefined;
  });

export const leadRepository = {
  createMany: (leadsToCreate: Lead[]): Promise<Lead[]> =>
    createManyLeadsFn({ data: leadsToCreate }),
  list: (): Promise<Lead[]> => listLeadsFn(),
  listByCampaign: (campaignId: string): Promise<Lead[]> =>
    listLeadsByCampaignFn({ data: campaignId }),
  get: (id: string): Promise<Lead | undefined> => getLeadFn({ data: id }),
  update: (id: string, patch: Partial<Lead>): Promise<Lead | undefined> =>
    updateLeadFn({ data: { id, patch } }),
};
