export type LeadStatus =
  | "Encontrado"
  | "Enriquecendo"
  | "Validando"
  | "Analisando"
  | "Diagnóstico concluído"
  | "Aguardando aprovação"
  | "Pronto para contato"
  | "Contato realizado"
  | "Respondeu"
  | "Interessado"
  | "Reunião agendada"
  | "Follow-up"
  | "Sem resposta"
  | "Sem interesse"
  | "Desqualificado"
  | "Cliente";

export type EvidenceType =
  "Fato verificado" | "Inferência" | "Oportunidade" | "Hipótese" | "Não confirmado";

export type Campaign = {
  id: string;
  name: string;
  segment: string;
  location: string;
  radius: number;
  quantity: number;
  decisionMakers: string[];
  offer: string;
  objective: string;
  channels: string[];
  createdAt: string;
  progress: number;
};

export type Lead = {
  id: string;
  campaignId: string;
  sourceJobId?: string;
  company: string;
  segment: string;
  city: string;
  state: string;
  decisionMaker: string;
  role: string;
  phone?: string;
  whatsapp?: string;
  email?: string;
  instagram?: string;
  website?: string;
  ads: boolean;
  score: number;
  confidence: number;
  opportunity: string;
  status: LeadStatus;
  evidence: {
    label: string;
    value: string;
    type: EvidenceType;
    source: string;
  }[];
  diagnosis: string;
  microInsight: string;
  suggestedMessage: string;
};

export const statusOrder: LeadStatus[] = [
  "Encontrado", "Enriquecendo", "Validando", "Analisando", "Diagnóstico concluído", "Aguardando aprovação",
  "Pronto para contato", "Contato realizado", "Respondeu", "Interessado", "Reunião agendada", "Follow-up",
  "Sem resposta", "Sem interesse", "Desqualificado", "Cliente",
];

export const scoreLabel = (score: number) =>
  score >= 90 ? "Excelente oportunidade" : score >= 80 ? "Alta prioridade" : score >= 70 ? "Boa oportunidade" : score >= 60 ? "Média prioridade" : score >= 40 ? "Baixa prioridade" : "Não priorizar";

export function calculateOpportunityScore(input: { fit: number; digital: number; intent: number; contact: number; activity: number }) {
  return Math.min(100, Math.max(0, input.fit + input.digital + input.intent + input.contact + input.activity));
}

export const demoLeads: Lead[] = [
  {
    id: "lead-001", campaignId: "camp-demo", company: "Clínica Sorriso Prime", segment: "Clínica odontológica", city: "Curitiba", state: "PR",
    decisionMaker: "Mariana Costa", role: "Sócia", phone: "+55 41 3333-1200", whatsapp: "+55 41 99999-1200", email: "contato@sorrisoprime.example", instagram: "@sorrisoprime", website: "sorrisoprime.example", ads: true, score: 94, confidence: 92,
    opportunity: "Anúncios ativos direcionam para uma página institucional sem oferta específica.", status: "Aguardando aprovação",
    evidence: [{ label: "Anúncios", value: "Ativos na Meta Ad Library", type: "Fato verificado", source: "Meta Ad Library" }],
    diagnosis: "Dados demonstrativos preservados para referência visual. Não fazem parte do novo fluxo persistente.", microInsight: "Lead demonstrativo legado.", suggestedMessage: "Lead demonstrativo legado.",
  },
  {
    id: "lead-002", campaignId: "camp-demo", company: "Odonto Batel", segment: "Clínica odontológica", city: "Curitiba", state: "PR",
    decisionMaker: "Rafael Mendes", role: "Proprietário", phone: "+55 41 3222-4567", whatsapp: "+55 41 98888-4567", email: "comercial@odontobatel.example", instagram: "@odontobatel", website: "odontobatel.example", ads: false, score: 82, confidence: 86,
    opportunity: "Boa presença local e atividade recente, com oportunidade de aquisição estruturada.", status: "Diagnóstico concluído",
    evidence: [{ label: "Google", value: "4,8 estrelas / 286 avaliações", type: "Fato verificado", source: "Perfil da Empresa no Google" }],
    diagnosis: "Dados demonstrativos preservados para referência visual. Não fazem parte do novo fluxo persistente.", microInsight: "Lead demonstrativo legado.", suggestedMessage: "Lead demonstrativo legado.",
  },
  {
    id: "lead-003", campaignId: "camp-demo", company: "Clínica Vida Oral", segment: "Clínica odontológica", city: "São José dos Pinhais", state: "PR",
    decisionMaker: "Não localizado", role: "Canal comercial da empresa", phone: "+55 41 3330-7788", whatsapp: "+55 41 99910-7788", instagram: "@vidaoral", website: "vidaoral.example", ads: true, score: 76, confidence: 74,
    opportunity: "Atividade de aquisição observada, mas contato do decisor ainda não confirmado.", status: "Aguardando aprovação",
    evidence: [{ label: "Decisor", value: "Não localizado — utilizando canal comercial", type: "Não confirmado", source: "Fontes públicas" }],
    diagnosis: "Dados demonstrativos preservados para referência visual. Não fazem parte do novo fluxo persistente.", microInsight: "Lead demonstrativo legado.", suggestedMessage: "Lead demonstrativo legado.",
  },
  {
    id: "lead-004", campaignId: "camp-demo", company: "Dental House Água Verde", segment: "Clínica odontológica", city: "Curitiba", state: "PR",
    decisionMaker: "Lucas Ferreira", role: "Diretor Comercial", phone: "+55 41 3011-8822", email: "lucas@dentalhouse.example", instagram: "@dentalhouseav", website: "dentalhouse.example", ads: true, score: 88, confidence: 95,
    opportunity: "Oferta comercial clara, mas baixa conexão entre criativos e página de destino.", status: "Pronto para contato",
    evidence: [{ label: "Decisor", value: "Lucas Ferreira — Diretor Comercial", type: "Fato verificado", source: "Site institucional" }],
    diagnosis: "Dados demonstrativos preservados para referência visual. Não fazem parte do novo fluxo persistente.", microInsight: "Lead demonstrativo legado.", suggestedMessage: "Lead demonstrativo legado.",
  },
];
