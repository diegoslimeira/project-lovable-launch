import type {
  AuditDimension,
  ChannelCopy,
  CompanyCandidate,
  Copy,
  CopyProvider,
  Diagnosis,
  DiagnosisSection,
  ServiceOpportunity,
} from "../providers";

function pickVariant<T>(options: T[], seed: string): T {
  let hash = 0;
  for (let index = 0; index < seed.length; index += 1) {
    hash = (hash * 31 + seed.charCodeAt(index)) % 9973;
  }
  return options[hash % options.length];
}

function firstName(name?: string): string | undefined {
  return name?.split(" ")[0];
}

// Palavras-chave por dimensão, usadas só para checar se a oferta da campanha já
// menciona aquele tema (aumenta a pontuação do gancho quando há relação direta).
const DIMENSION_KEYWORDS: Record<AuditDimension, string[]> = {
  social_media: ["rede social", "redes sociais", "instagram", "social media"],
  gmb: ["google meu negócio", "gmb", "google"],
  website: ["site", "website", "landing page"],
  reviews: ["avaliaç", "reputação"],
  visual_identity: ["identidade visual", "design", "branding", "visual"],
  ads: ["tráfego pago", "anúncio", "ads", "mídia paga", "campanha"],
  reclame_aqui: ["reclame aqui", "reputação"],
  other: [],
};

function offerMentionsDimension(offer: string, dimension: AuditDimension): boolean {
  const lower = offer.toLowerCase();
  return DIMENSION_KEYWORDS[dimension].some((keyword) => lower.includes(keyword));
}

// Pontuação determinística do gancho: prioriza impacto comercial, confiança do
// dado, relação com a oferta da campanha, presença de oportunidade associada e
// achados concretos (não vagos). Não usa Math.random() em nenhum ponto.
function hookScore(section: DiagnosisSection, offer: string): number {
  const impactWeight = { alto: 30, médio: 20, baixo: 10 }[section.impact];
  const confidenceWeight = section.confidence / 10;
  const offerRelevance = offerMentionsDimension(offer, section.dimension) ? 20 : 0;
  const opportunitySignal = section.opportunities.length ? 10 : 0;
  const hasVerifiedFinding = section.evidence.some((finding) => finding.type === "Fato verificado");
  const concreteFindingWeight = hasVerifiedFinding ? 10 : section.evidence.length ? 5 : 0;
  return (
    impactWeight + confidenceWeight + offerRelevance + opportunitySignal + concreteFindingWeight
  );
}

function selectHookSection(diagnosis: Diagnosis, offer: string): DiagnosisSection {
  if (!diagnosis.sections.length) {
    return {
      dimension: "other",
      summary: "presença digital em geral",
      keyFindings: [],
      evidence: [],
      impact: "médio",
      opportunities: [],
      confidence: 50,
    };
  }
  return [...diagnosis.sections].sort((a, b) => hookScore(b, offer) - hookScore(a, offer))[0];
}

function hookFindingValue(section: DiagnosisSection): string {
  return section.evidence[0]?.value ?? section.summary;
}

function lowerFirst(value: string): string {
  return value.charAt(0).toLowerCase() + value.slice(1);
}

// Área de negócio associada a cada dimensão — usada só quando o decisor não foi
// localizado, para pedir encaminhamento à pessoa responsável em vez de presumir
// com quem estamos falando.
const DIMENSION_AREA: Record<AuditDimension, string> = {
  social_media: "marketing",
  gmb: "marketing ou atendimento",
  website: "marketing ou comercial",
  reviews: "atendimento ao cliente",
  visual_identity: "marketing",
  ads: "marketing",
  reclame_aqui: "atendimento ao cliente",
  other: "marketing ou comercial",
};

const OPENING_NAMED = [
  (name: string) => `Olá, ${name}! Tudo bem? Desculpe a abordagem repentina.`,
  (name: string) =>
    `Olá, ${name}, tudo bem? Peço desculpas por entrar em contato assim, de forma direta.`,
  (name: string) => `${name}, olá! Tudo bem? Peço desculpas pela abordagem sem aviso prévio.`,
];

const OPENING_GENERIC = ["Olá, tudo bem?", "Olá! Tudo bem por aí?", "Olá, tudo certo?"];

const CONTEXT_SENTENCES = [
  (company: string) =>
    `Recentemente realizamos uma análise da presença digital da ${company} e identificamos alguns pontos que acredito que possam ser relevantes para vocês.`,
  (company: string) =>
    `Fizemos uma análise da presença digital da ${company} e encontramos alguns pontos que considero relevantes compartilhar.`,
  (company: string) =>
    `Conduzimos recentemente uma análise da presença digital da ${company}, e alguns pontos identificados podem ser úteis para vocês.`,
];

const HOOK_LEAD_INS = [
  (area: string) => `Um dos pontos que identificamos na análise de ${area} foi`,
  (area: string) => `Entre os pontos que observamos em ${area}, um achado relevante foi`,
  (area: string) => `Durante a análise de ${area}, identificamos`,
];

function buildHookSentence(section: DiagnosisSection, seed: string): string {
  const area = DIMENSION_AREA[section.dimension];
  const leadIn = pickVariant(HOOK_LEAD_INS, seed)(area);
  return `${leadIn}: ${hookFindingValue(section)}.`;
}

const CTA_WHATSAPP_NAMED = [
  "Você teria 10 minutos hoje ou amanhã para uma ligação rápida? Posso te apresentar melhor o que identificamos e dar mais contexto sobre a análise.",
  "Se fizer sentido, você teria 10 minutos hoje ou amanhã para uma ligação rápida? Gostaria de te mostrar alguns dos pontos que identificamos.",
  "Faria sentido conversarmos por 10 minutos hoje ou amanhã? Posso te dar mais contexto sobre o que encontramos na análise.",
];

const CTA_EMAIL_NAMED = [
  "Você teria 10 minutos hoje ou amanhã para uma ligação rápida? Posso apresentar melhor o que identificamos e dar mais contexto sobre a análise.",
  "Se fizer sentido, teria 10 minutos hoje ou amanhã para uma conversa rápida? Gostaria de mostrar alguns dos pontos identificados.",
  "Faria sentido conversarmos por 10 minutos hoje ou amanhã? Posso dar mais contexto sobre o que encontramos na análise.",
];

const CTA_LINKEDIN_NAMED = [
  "Faz sentido trocarmos uma mensagem e, se fizer sentido, agendarmos 10 minutos para uma conversa rápida?",
  "Se fizer sentido, teria 10 minutos hoje ou amanhã para eu apresentar melhor os pontos identificados?",
  "Teria disponibilidade para uma conversa rápida de 10 minutos? Posso compartilhar mais detalhes da análise.",
];

const CTA_WHATSAPP_NO_CONTACT = [
  (area: string) =>
    `Vocês poderiam me direcionar para o responsável pela área de ${area}? Gostaria de compartilhar o contexto completo da análise e, se fizer sentido, alinhar 10 minutos para uma conversa rápida.`,
  (area: string) =>
    `Seria possível me colocar em contato com quem cuida da área de ${area}? Posso compartilhar mais detalhes da análise e, se fizer sentido, conversamos por 10 minutos.`,
  (area: string) =>
    `Poderiam me indicar o responsável pela área de ${area}? Gostaria de apresentar a análise com mais contexto, em uma conversa rápida de uns 10 minutos, se for do interesse de vocês.`,
];

const CTA_EMAIL_NO_CONTACT = [
  (area: string) =>
    `Vocês poderiam me indicar o responsável pela área de ${area}? Ficarei à disposição para compartilhar o contexto completo da análise, inclusive em uma ligação rápida de 10 minutos, se fizer sentido.`,
  (area: string) =>
    `Seria possível me colocar em contato com quem cuida da área de ${area}? Posso apresentar mais detalhes da análise, se fizer sentido em uma conversa rápida.`,
];

const CTA_LINKEDIN_NO_CONTACT = [
  (area: string) =>
    `Você saberia me indicar quem cuida da área de ${area} por aí? Posso compartilhar mais contexto sobre a análise.`,
  (area: string) =>
    `Poderia me indicar o responsável pela área de ${area}? Tenho mais detalhes da análise para compartilhar.`,
];

function buildWhatsapp(
  company: string,
  contact: { name?: string; role?: string } | undefined,
  section: DiagnosisSection,
  seed: string,
): ChannelCopy {
  const name = firstName(contact?.name);
  const area = DIMENSION_AREA[section.dimension];
  const opening = name
    ? pickVariant(OPENING_NAMED, seed)(name)
    : pickVariant(OPENING_GENERIC, seed);
  const context = pickVariant(CONTEXT_SENTENCES, `${seed}-context`)(company);
  const hookSentence = buildHookSentence(section, `${seed}-hook`);
  const cta = name
    ? pickVariant(CTA_WHATSAPP_NAMED, `${seed}-cta`)
    : pickVariant(CTA_WHATSAPP_NO_CONTACT, `${seed}-cta`)(area);
  const body = `${opening} ${context}\n\n${hookSentence}\n\n${cta}`;
  return { channel: "whatsapp", body, cta };
}

function buildEmail(
  company: string,
  contact: { name?: string; role?: string } | undefined,
  section: DiagnosisSection,
  seed: string,
): ChannelCopy {
  const name = firstName(contact?.name);
  const area = DIMENSION_AREA[section.dimension];
  const greeting = name ? `Olá, ${name},` : "Olá,";
  const context = pickVariant(CONTEXT_SENTENCES, `${seed}-email-context`)(company);
  const hookSentence = buildHookSentence(section, `${seed}-email-hook`);
  const secondFinding = section.evidence[1]?.value;
  const extra = secondFinding ? ` Também observamos que ${lowerFirst(secondFinding)}.` : "";
  const cta = name
    ? pickVariant(CTA_EMAIL_NAMED, `${seed}-email-cta`)
    : pickVariant(CTA_EMAIL_NO_CONTACT, `${seed}-email-cta`)(area);
  const subject = `Análise da presença digital da ${company}`;
  const body = `${greeting}\n\n${context}\n\n${hookSentence}${extra}\n\n${cta}`;
  return { channel: "email", subject, body, cta };
}

function buildLinkedin(
  company: string,
  contact: { name?: string; role?: string } | undefined,
  section: DiagnosisSection,
  seed: string,
): ChannelCopy {
  const name = firstName(contact?.name);
  const area = DIMENSION_AREA[section.dimension];
  const greeting = name ? `${name}, tudo bem?` : "Olá, tudo bem?";
  const context = `Realizamos uma análise da presença digital da ${company} e, em ${area}, identificamos: ${hookFindingValue(section)}.`;
  const cta = name
    ? pickVariant(CTA_LINKEDIN_NAMED, `${seed}-linkedin-cta`)
    : pickVariant(CTA_LINKEDIN_NO_CONTACT, `${seed}-linkedin-cta`)(area);
  const body = `${greeting} ${context}\n\n${cta}`;
  return { channel: "linkedin", body, cta };
}

/**
 * Provider mock de copy. Seleciona deterministicamente o melhor gancho do
 * diagnóstico (impacto, confiança, relação com a oferta, presença de
 * oportunidade e concretude do achado) e gera WhatsApp/E-mail/LinkedIn a partir
 * dele. Nunca usa Math.random(): a variação de frase vem de um hash estável do
 * id/nome do lead, então a mesma entrada sempre produz a mesma saída. Não cita
 * o serviço/oportunidade comercial diretamente — a primeira abordagem usa só o
 * achado como gancho de curiosidade, não como pitch de venda.
 */
export class MockCopyProvider implements CopyProvider {
  async generate(input: {
    company: CompanyCandidate;
    contact?: { name?: string; role?: string };
    diagnosis: Diagnosis;
    opportunities: ServiceOpportunity[];
    score: number;
    priority: "baixa" | "média" | "alta";
    offer: string;
    objective: string;
  }): Promise<Copy> {
    const section = selectHookSection(input.diagnosis, input.offer);
    const seed = `${input.company.name}-${section.dimension}`;

    const whatsapp = buildWhatsapp(input.company.name, input.contact, section, seed);
    const email = buildEmail(input.company.name, input.contact, section, seed);
    const linkedin = buildLinkedin(input.company.name, input.contact, section, seed);

    return {
      generatedAt: new Date().toISOString(),
      hook: {
        dimension: section.dimension,
        summary: section.summary,
        reason: `Maior pontuação de gancho (impacto ${section.impact}, confiança ${section.confidence}%${
          offerMentionsDimension(input.offer, section.dimension)
            ? ", alinhado à oferta da campanha"
            : ""
        }).`,
      },
      whatsapp,
      email,
      linkedin,
    };
  }
}

export const mockCopyProvider = new MockCopyProvider();
