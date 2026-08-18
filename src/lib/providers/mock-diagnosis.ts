import type {
  AIProvider,
  AuditDimension,
  AuditResult,
  CompanyCandidate,
  Diagnosis,
  DiagnosisSection,
  ValidationResult,
} from "../providers";

const DIMENSION_LABELS: Record<AuditDimension, string> = {
  social_media: "Redes sociais",
  gmb: "Google Meu Negócio",
  website: "Website",
  reviews: "Avaliações públicas",
  visual_identity: "Identidade visual",
  ads: "Anúncios públicos",
  reclame_aqui: "Reclame Aqui",
  other: "Outros sinais",
};

const OPPORTUNITY_HINTS: Record<AuditDimension, string> = {
  social_media: "Gestão de redes sociais",
  gmb: "Otimização de Google Meu Negócio",
  website: "Desenvolvimento/otimização de site",
  reviews: "Gestão de reputação e avaliações",
  visual_identity: "Consultoria de identidade visual",
  ads: "Gestão de tráfego pago",
  reclame_aqui: "Gestão de reputação e avaliações",
  other: "Análise complementar",
};

function sectionImpact(audit: AuditResult): DiagnosisSection["impact"] {
  const hasUnconfirmed = audit.findings.some((finding) => finding.type === "Não confirmado");
  if (audit.confidence < 60 || hasUnconfirmed) return "alto";
  if (audit.confidence < 80) return "médio";
  return "baixo";
}

function buildSection(audit: AuditResult): DiagnosisSection {
  const impact = sectionImpact(audit);
  const label = DIMENSION_LABELS[audit.dimension];
  const headline = audit.findings[0]?.value ?? "sem achados relevantes nesta dimensão";
  return {
    dimension: audit.dimension,
    summary: `${label}: ${headline}.`,
    keyFindings: audit.findings.map((finding) => `${finding.label}: ${finding.value}`),
    evidence: audit.findings,
    impact,
    opportunities: impact === "baixo" ? [] : [OPPORTUNITY_HINTS[audit.dimension]],
    confidence: audit.confidence,
  };
}

function buildNarrative(
  company: CompanyCandidate,
  contact: { name?: string; role?: string } | undefined,
  sections: DiagnosisSection[],
): string {
  const contactPart = contact?.name
    ? `O decisor identificado é ${contact.name}${contact.role ? ` (${contact.role})` : ""}.`
    : "O decisor ainda não foi localizado nesta fase.";
  const gaps = sections
    .filter((section) => section.impact === "alto")
    .map((section) => DIMENSION_LABELS[section.dimension]);
  const strengths = sections
    .filter((section) => section.impact === "baixo")
    .map((section) => DIMENSION_LABELS[section.dimension]);
  const gapsPart = gaps.length
    ? `Os principais pontos de atenção estão em ${gaps.join(", ")}.`
    : "Não foram identificados pontos críticos na auditoria realizada.";
  const strengthsPart = strengths.length
    ? ` Os pontos fortes observados incluem ${strengths.join(", ")}.`
    : "";
  return `Diagnóstico consolidado para ${company.name}: ${contactPart} ${gapsPart}${strengthsPart}`.trim();
}

/**
 * Provider mock de diagnóstico. Consolida os achados de auditoria (já estruturados
 * por dimensão) em seções de diagnóstico com resumo, achados, evidência, impacto e
 * oportunidades — sem chamar nenhuma IA real. A estrutura de saída (Diagnosis) é a
 * mesma que uma implementação real de IA deverá produzir no futuro.
 */
export class MockAIProvider implements AIProvider {
  async diagnose(input: {
    company: CompanyCandidate;
    contact?: { name?: string; role?: string };
    auditFindings: AuditResult[];
    validation?: ValidationResult;
    offer: string;
  }): Promise<Diagnosis> {
    const sections = input.auditFindings.map(buildSection);
    const narrative = buildNarrative(input.company, input.contact, sections);
    const confidence = sections.length
      ? Math.round(sections.reduce((sum, section) => sum + section.confidence, 0) / sections.length)
      : 50;

    return {
      generatedAt: new Date().toISOString(),
      sections,
      narrative,
      confidence,
    };
  }
}

export const mockAIProvider = new MockAIProvider();
