import type {
  AuditResult,
  CnpjCandidate,
  Copy,
  Diagnosis,
  RegistryCompanyData,
  ServiceOpportunity,
  ValidationResult,
} from "./providers";

export type LeadStatus =
  // Estados técnicos: refletem o processamento do pipeline (Discovery -> Copy).
  // Nunca aparecem como coluna do Kanban comercial.
  | "Encontrado"
  | "Enriquecendo"
  | "Validando"
  | "Analisando"
  | "Diagnóstico concluído"
  // Estados comerciais: fluxo principal do Kanban, pós-aprovação da abordagem.
  | "Aguardando aprovação"
  | "Pronto para contato"
  | "Contato realizado"
  | "Respondeu"
  | "Ligação de qualificação"
  | "Qualificado"
  | "Reunião agendada"
  | "Reunião realizada"
  | "Negociação"
  | "Follow-up"
  | "Cliente"
  // Estados comerciais de saída: colunas secundárias/finais do Kanban.
  | "Sem resposta"
  | "Sem interesse"
  | "Desqualificado"
  | "No-show"
  | "Cancelada"
  // Oportunidade comercial real que não se converteu em venda — diferente de
  // Sem interesse/Desqualificado/No-show/Cancelada, que ocorrem antes de haver
  // uma reunião realizada.
  | "Perdido";

// Separação mínima entre estado técnico (processamento do pipeline) e estado
// comercial (Kanban), sem quebrar o campo único `Lead.status` nem o pipeline
// técnico 8/8 já existente. O Kanban usa COMMERCIAL_PIPELINE_STATUSES e
// COMMERCIAL_EXIT_STATUSES; o restante do app pode usar isCommercialStatus.
export const TECHNICAL_STATUSES: LeadStatus[] = [
  "Encontrado",
  "Enriquecendo",
  "Validando",
  "Analisando",
  "Diagnóstico concluído",
];

export const COMMERCIAL_PIPELINE_STATUSES: LeadStatus[] = [
  "Aguardando aprovação",
  "Pronto para contato",
  "Contato realizado",
  "Respondeu",
  "Ligação de qualificação",
  "Qualificado",
  "Reunião agendada",
  "Reunião realizada",
  "Negociação",
  "Follow-up",
  "Cliente",
];

export const COMMERCIAL_EXIT_STATUSES: LeadStatus[] = [
  "Sem resposta",
  "Sem interesse",
  "Desqualificado",
  "No-show",
  "Cancelada",
  "Perdido",
];

export function isCommercialStatus(status: LeadStatus): boolean {
  return !TECHNICAL_STATUSES.includes(status);
}

export type EvidenceType =
  "Fato verificado" | "Inferência" | "Oportunidade" | "Hipótese" | "Não confirmado";

export type ContactChannel = "whatsapp" | "email" | "linkedin";

// Trilha comercial mínima: um registro por ação de contato (abertura de canal
// externo ou confirmação humana). Não é enviado nada automaticamente — isto só
// guarda o que o operador já fez, para não perder a informação de contato.
export type ContactAttempt = {
  id: string;
  channel: ContactChannel;
  createdAt: string;
  status: "aberto" | "confirmado";
  message: string;
  subject?: string;
};

// Resposta do lead: registrada manualmente (sem interpretação automática) e
// depois classificada manualmente pelo operador. Um array permite reclassificar
// e, futuramente, registrar mais de uma resposta sem perder a anterior.
export type ResponseClassification =
  "Demonstrou interesse" | "Pediu contato em outro momento" | "Sem interesse" | "Resposta neutra";

export const RESPONSE_CLASSIFICATIONS: ResponseClassification[] = [
  "Demonstrou interesse",
  "Pediu contato em outro momento",
  "Sem interesse",
  "Resposta neutra",
];

export type LeadResponse = {
  id: string;
  createdAt: string;
  channel: ContactChannel;
  content: string;
  note?: string;
  classification?: ResponseClassification;
  classifiedAt?: string;
};

// BANT da ligação de qualificação humana. Cada dimensão é só um registro
// estruturado — a decisão final (outcome) é sempre uma ação humana explícita,
// nunca derivada automaticamente do preenchimento.
export type BudgetRating =
  "Tem orçamento" | "Pode ter orçamento" | "Sem orçamento" | "Não identificado";
export type AuthorityRating =
  "É o decisor" | "Influencia a decisão" | "Precisa envolver outro decisor" | "Não identificado";
export type NeedRating =
  | "Necessidade clara"
  | "Necessidade potencial"
  | "Sem necessidade identificada"
  | "Não identificado";
export type TimingRating =
  "Imediato" | "Até 30 dias" | "31–90 dias" | "Mais de 90 dias" | "Não identificado";

export const BUDGET_RATINGS: BudgetRating[] = [
  "Tem orçamento",
  "Pode ter orçamento",
  "Sem orçamento",
  "Não identificado",
];
export const AUTHORITY_RATINGS: AuthorityRating[] = [
  "É o decisor",
  "Influencia a decisão",
  "Precisa envolver outro decisor",
  "Não identificado",
];
export const NEED_RATINGS: NeedRating[] = [
  "Necessidade clara",
  "Necessidade potencial",
  "Sem necessidade identificada",
  "Não identificado",
];
export const TIMING_RATINGS: TimingRating[] = [
  "Imediato",
  "Até 30 dias",
  "31–90 dias",
  "Mais de 90 dias",
  "Não identificado",
];

export type QualificationOutcome = "Qualificado" | "Follow-up" | "Desqualificado";

export type Qualification = {
  startedAt?: string;
  completedAt?: string;
  budget?: BudgetRating;
  budgetNote?: string;
  authority?: AuthorityRating;
  authorityNote?: string;
  need?: NeedRating;
  needNote?: string;
  timing?: TimingRating;
  timingNote?: string;
  notes?: string;
  outcome?: QualificationOutcome;
};

// Reunião comercial agendada a partir de um lead qualificado. Nesta fase é
// puramente interna (sem integração de calendário real) — os campos
// provider/externalCalendarEventId/meetingUrl/syncStatus existem só para não
// exigir uma migração de dados quando uma integração real for adicionada.
export type MeetingStatus = "scheduled" | "completed" | "cancelled" | "no_show";
export type MeetingProvider = "internal";
export type MeetingSyncStatus = "not_synced" | "synced" | "sync_failed";

// Percepção humana de interesse e próximo passo combinado ao final de uma
// reunião realizada. Preenchidos manualmente — nunca inferidos automaticamente.
export type MeetingInterestLevel = "Alto" | "Médio" | "Baixo";
export const MEETING_INTEREST_LEVELS: MeetingInterestLevel[] = ["Alto", "Médio", "Baixo"];

// "Assinatura do contrato" NÃO equivale a Cliente — ainda é processo comercial
// em andamento (Negociação). Cliente só é confirmado manualmente, via a ação
// estruturada de fechamento, quando o pagamento/venda é efetivamente confirmado.
export type MeetingNextStep =
  | "Preparar proposta"
  | "Enviar proposta"
  | "Nova conversa"
  | "Aguardar retorno"
  | "Follow-up"
  | "Assinatura do contrato"
  | "Sem próximo passo definido";
export const MEETING_NEXT_STEPS: MeetingNextStep[] = [
  "Preparar proposta",
  "Enviar proposta",
  "Nova conversa",
  "Aguardar retorno",
  "Follow-up",
  "Assinatura do contrato",
  "Sem próximo passo definido",
];

// Catálogo comercial fixo da V1 — o que a Nexus efetivamente vende. Distinto
// das oportunidades identificadas pelo diagnóstico (Lead.opportunities), que
// são problemas/contexto, não o catálogo de venda.
export const COMMERCIAL_SERVICES = [
  "Nexus Origin",
  "Gestão de Tráfego Pago",
  "Gestão de Redes Sociais (Social Media)",
  "Site/LP",
  "Outro",
] as const;
export type CommercialService = (typeof COMMERCIAL_SERVICES)[number];

// Proposta comercial apresentada durante a própria reunião realizada — não é
// uma etapa separada do pipeline, é contexto associado ao resultado da reunião.
// "opportunityIds" referencia Lead.opportunities[].id (oportunidades
// identificadas pelo diagnóstico, mantidas como contexto da reunião — não são
// o catálogo comercial). "services" é a lista final de serviços efetivamente
// ofertados, resolvida a partir de COMMERCIAL_SERVICES (com o texto livre de
// "Outro" já expandido no lugar do rótulo genérico).
export type MeetingProposal = {
  presented: boolean;
  services?: string[];
  opportunityIds?: string[];
  totalValue?: number;
  paymentTerms?: string;
  contractDuration?: string;
  notes?: string;
};

// Registro estruturado do que aconteceu em uma reunião realizada. "nextStep"
// alimenta a futura fase de Proposta (ex.: "Preparar proposta"), sem acionar
// nada automaticamente nesta fase.
export type MeetingOutcome = {
  summary: string;
  painPoints?: string;
  needs?: string;
  objectives?: string;
  objections?: string;
  discussedSolutions?: string;
  interestLevel: MeetingInterestLevel;
  nextStep: MeetingNextStep;
  nextStepDueDate?: string;
  notes?: string;
  proposal?: MeetingProposal;
};

export type Meeting = {
  id: string;
  leadId: string;
  campaignId: string;
  scheduledAt: string;
  durationMinutes: number;
  responsibleName?: string;
  title: string;
  notes?: string;
  status: MeetingStatus;
  createdAt: string;
  updatedAt: string;
  // Preenchido quando o resultado da reunião (realizada/no-show/cancelada) é registrado.
  completedAt?: string;
  // Presente apenas quando status === "completed".
  outcome?: MeetingOutcome;
  // Observação humana livre para status "no_show" ou "cancelled" (motivo/contexto).
  resultNotes?: string;
  provider: MeetingProvider;
  externalCalendarEventId?: string;
  meetingUrl?: string;
  syncStatus?: MeetingSyncStatus;
};

export const MEETING_DURATIONS = [15, 30, 45, 60] as const;

export const MEETING_STATUS_LABELS: Record<MeetingStatus, string> = {
  scheduled: "Agendada",
  completed: "Concluída",
  cancelled: "Cancelada",
  no_show: "Não compareceu",
};

// Estado comercial atual da negociação — um único registro ativo por lead,
// atualizado in place (não é histórico). A reunião/proposta que a originou
// continua preservada em Meeting/MeetingOutcome, sem sobrescrita.
export type Negotiation = {
  startedAt: string;
  updatedAt: string;
  value?: number;
  commercialTerms?: string;
  mainObjection?: string;
  nextStep?: string;
  nextFollowUpAt?: string;
  notes?: string;
};

// Dados de fechamento quando o lead vira cliente — via ação estruturada
// ("Marcar como cliente"), nunca por drag.
export type ClientClosing = {
  closedAt: string;
  services?: string[];
  value?: number;
  paymentTerms?: string;
  notes?: string;
};

export type LossReason =
  | "Preço"
  | "Sem orçamento"
  | "Escolheu concorrente"
  | "Timing"
  | "Não viu valor"
  | "Sem prioridade"
  | "Não respondeu após proposta/reunião"
  | "Decisor não aprovou"
  | "Outro";

export const LOSS_REASONS: LossReason[] = [
  "Preço",
  "Sem orçamento",
  "Escolheu concorrente",
  "Timing",
  "Não viu valor",
  "Sem prioridade",
  "Não respondeu após proposta/reunião",
  "Decisor não aprovou",
  "Outro",
];

// Oportunidade comercial real que não se converteu — distinto de
// Sem interesse/Desqualificado/No-show/Cancelada, que representam encerramento
// antes de uma reunião realizada.
export type LostDeal = {
  lostAt: string;
  reason: LossReason;
  customReason?: string;
  notes?: string;
};

// Fase E.2 — dado cadastral oficial persistido no lead, quando o CNPJ foi
// resolvido com alta confiança (CnpjResolver) E confirmado por cruzamento com
// a fonte oficial (CompanyRegistryProvider + confirmRegistryMatch). Os campos
// de RegistryCompanyData são os dados cadastrais em si; os campos abaixo são
// metadados de AUDITORIA do próprio match — nunca dado cadastral. matchEvidence
// guarda só os candidatos considerados (CNPJ + URL onde apareceu + trecho
// curto de contexto + sinais) — nunca HTML bruto nem texto integral de página.
export type CompanyRegistryProfile = RegistryCompanyData & {
  matchConfidence: number;
  matchSource: string;
  matchEvidence: CnpjCandidate[];
  registrySource: string;
  registryFetchedAt: string;
};

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

// Fase F — id determinístico da campanha-sistema que agrupa leads cadastrados
// manualmente (fora do fluxo de Discovery). Criada lazily (ver
// ensureManualLeadsCampaign em manual-lead.ts) na primeira vez que um lead
// manual é salvo. Excluída deliberadamente de listCampaignsDirect (nunca
// aparece como campanha normal) e nunca ganha processingTasks (não participa
// de cálculo de progresso — ver getCampaignProgress em prospecting-service.ts,
// que já devolve 0 com segurança quando não há jobs).
export const MANUAL_LEADS_CAMPAIGN_ID = "system-manual-leads";

// Fase F — payload do formulário de cadastro manual de lead. `cnpj` aqui é
// SEMPRE o valor bruto digitado pelo usuário (validado/normalizado em
// createManualLeadDirect antes de virar Lead.manualCnpj) — nunca confundir
// com um CNPJ já confirmado (isso vive em Lead.registryProfile).
export type ManualLeadInput = {
  company: string;
  city: string;
  state: string;
  // Fase F.1 — obrigatório: passa a ser a âncora de identidade do cadastro
  // manual (confirmada via CompanyRegistryProvider antes de qualquer
  // localização/enrichment real — ver resolveManualLeadIdentity em
  // prospecting-service.ts). Formato/dígitos verificadores continuam
  // validados em createManualLeadDirect (manual-lead.ts).
  cnpj: string;
  website?: string;
  phone?: string;
  address?: string;
  instagram?: string;
  notes?: string;
};

export type Lead = {
  id: string;
  campaignId?: string;
  sourceJobId?: string;
  // Fase E.1 — id do lead na fonte real de discovery que o criou (ex.:
  // Google Place ID), para reutilização em etapas futuras (ex.: Enrichment
  // via Place Details) sem repetir uma busca por texto.
  externalId?: string;
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
  linkedin?: string;
  // Fase F — cadastro manual. CNPJ digitado pelo usuário, ANTES de qualquer
  // confirmação cadastral — deliberadamente separado de `registryProfile`
  // (que só existe após um match CONFIRMADO via CnpjResolver +
  // CompanyRegistryProvider). Nunca copiado automaticamente para lá.
  manualCnpj?: string;
  address?: string;
  notes?: string;
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
  validation?: ValidationResult;
  auditFindings?: AuditResult[];
  diagnosisReport?: Diagnosis;
  opportunities?: ServiceOpportunity[];
  // Fase E.2 — presente só quando CNPJ Resolution + Company Registry
  // encontraram e confirmaram um CNPJ com segurança. Ausência é um resultado
  // válido (CNPJ não encontrado, ambíguo, ou lead sem website) — nunca é
  // preenchido com dado inventado.
  registryProfile?: CompanyRegistryProfile;
  copy?: Copy;
  contactAttempts?: ContactAttempt[];
  responses?: LeadResponse[];
  qualification?: Qualification;
  negotiation?: Negotiation;
  clientClosing?: ClientClosing;
  lostDeal?: LostDeal;
  diagnosis: string;
  microInsight: string;
  suggestedMessage: string;
};

export const statusOrder: LeadStatus[] = [
  ...TECHNICAL_STATUSES,
  ...COMMERCIAL_PIPELINE_STATUSES,
  ...COMMERCIAL_EXIT_STATUSES,
];

export const scoreLabel = (score: number) =>
  score >= 90
    ? "Excelente oportunidade"
    : score >= 80
      ? "Alta prioridade"
      : score >= 70
        ? "Boa oportunidade"
        : score >= 60
          ? "Média prioridade"
          : score >= 40
            ? "Baixa prioridade"
            : "Não priorizar";

export function calculateOpportunityScore(input: {
  fit: number;
  digital: number;
  intent: number;
  contact: number;
  activity: number;
}) {
  return Math.min(
    100,
    Math.max(0, input.fit + input.digital + input.intent + input.contact + input.activity),
  );
}

export const demoLeads: Lead[] = [
  {
    id: "lead-001",
    company: "Clínica Sorriso Prime",
    segment: "Clínica odontológica",
    city: "Curitiba",
    state: "PR",
    decisionMaker: "Mariana Costa",
    role: "Sócia",
    phone: "+55 41 3333-1200",
    whatsapp: "+55 41 99999-1200",
    email: "contato@sorrisoprime.example",
    instagram: "@sorrisoprime",
    website: "sorrisoprime.example",
    ads: true,
    score: 94,
    confidence: 92,
    opportunity: "Anúncios ativos direcionam para uma página institucional sem oferta específica.",
    status: "Aguardando aprovação",
    evidence: [
      {
        label: "Anúncios",
        value: "Ativos na Meta Ad Library",
        type: "Fato verificado",
        source: "Meta Ad Library",
      },
      {
        label: "Destino",
        value: "Página inicial do site",
        type: "Fato verificado",
        source: "Site institucional",
      },
      {
        label: "Oportunidade",
        value: "Criar landing page por intenção",
        type: "Oportunidade",
        source: "Análise Nexus",
      },
    ],
    diagnosis:
      "A clínica demonstra atividade comercial e presença digital consistente. O principal espaço de otimização está na transição entre anúncio e conversão: os criativos observados não têm uma página dedicada à oferta.",
    microInsight:
      "Vocês já têm anúncios ativos, mas os criativos observados levam para uma página inicial com várias opções em vez de uma oferta específica.",
    suggestedMessage:
      "Olá, Mariana. Estava analisando a presença digital da Sorriso Prime e encontrei um ponto interessante: vocês já têm anúncios ativos, mas os criativos observados levam para uma página inicial com várias opções em vez de uma oferta específica. Isso abre uma oportunidade de otimizar a passagem do clique para o contato. Posso te mostrar a análise em 10 minutos?",
  },
  {
    id: "lead-002",
    company: "Odonto Batel",
    segment: "Clínica odontológica",
    city: "Curitiba",
    state: "PR",
    decisionMaker: "Rafael Mendes",
    role: "Proprietário",
    phone: "+55 41 3222-4567",
    whatsapp: "+55 41 98888-4567",
    email: "comercial@odontobatel.example",
    instagram: "@odontobatel",
    website: "odontobatel.example",
    ads: false,
    score: 82,
    confidence: 86,
    opportunity:
      "Boa presença local e atividade recente, com oportunidade de aquisição estruturada.",
    status: "Diagnóstico concluído",
    evidence: [
      {
        label: "Google",
        value: "4,8 estrelas / 286 avaliações",
        type: "Fato verificado",
        source: "Perfil da Empresa no Google",
      },
      {
        label: "Atividade",
        value: "Publicações recentes",
        type: "Fato verificado",
        source: "Instagram público",
      },
      {
        label: "Aquisição",
        value: "Não foram observados anúncios na consulta",
        type: "Não confirmado",
        source: "Biblioteca de anúncios",
      },
    ],
    diagnosis:
      "A empresa apresenta prova social local forte e sinais recentes de atividade. Há uma hipótese comercial de ganho ao estruturar aquisição paga, mas a ausência de anúncios deve ser tratada como dado da consulta, não como prova de ausência total.",
    microInsight:
      "A Odonto Batel tem uma base forte de prova social local e atividade recente, mas não observamos anúncios na consulta que fizemos.",
    suggestedMessage:
      "Olá, Rafael. Encontrei a Odonto Batel durante uma análise de clínicas de Curitiba e chamou atenção a combinação de avaliação local forte e atividade recente. Na consulta que fizemos não observamos anúncios ativos, o que levanta uma hipótese interessante de aquisição. Posso te mostrar o raciocínio em 10 minutos?",
  },
  {
    id: "lead-003",
    company: "Clínica Vida Oral",
    segment: "Clínica odontológica",
    city: "São José dos Pinhais",
    state: "PR",
    decisionMaker: "Não localizado",
    role: "Canal comercial da empresa",
    phone: "+55 41 3330-7788",
    whatsapp: "+55 41 99910-7788",
    instagram: "@vidaoral",
    website: "vidaoral.example",
    ads: true,
    score: 76,
    confidence: 74,
    opportunity: "Atividade de aquisição observada, mas contato do decisor ainda não confirmado.",
    status: "Aguardando aprovação",
    evidence: [
      {
        label: "Decisor",
        value: "Não localizado — utilizando canal comercial",
        type: "Não confirmado",
        source: "Fontes públicas",
      },
      {
        label: "Publicidade",
        value: "Criativos ativos observados",
        type: "Fato verificado",
        source: "Meta Ad Library",
      },
      {
        label: "Confiança",
        value: "74/100",
        type: "Fato verificado",
        source: "Motor de validação",
      },
    ],
    diagnosis:
      "Há sinal de investimento em aquisição, porém a identidade do decisor não foi confirmada. O lead deve permanecer em contato comercial geral até que uma pessoa responsável seja validada.",
    microInsight:
      "Identificamos atividade de anúncios, mas o contato do decisor ainda não pôde ser confirmado; por isso a abordagem deve começar pelo canal comercial.",
    suggestedMessage:
      "Olá! Estava analisando a presença digital da Clínica Vida Oral e observei alguns pontos na estrutura de aquisição que podem ser otimizados. Identificamos anúncios ativos e uma oportunidade específica na passagem do tráfego para o contato. Quem é a pessoa responsável por marketing ou aquisição por aí?",
  },
  {
    id: "lead-004",
    company: "Dental House Água Verde",
    segment: "Clínica odontológica",
    city: "Curitiba",
    state: "PR",
    decisionMaker: "Lucas Ferreira",
    role: "Diretor Comercial",
    phone: "+55 41 3011-8822",
    email: "lucas@dentalhouse.example",
    instagram: "@dentalhouseav",
    website: "dentalhouse.example",
    ads: true,
    score: 88,
    confidence: 95,
    opportunity: "Oferta comercial clara, mas baixa conexão entre criativos e página de destino.",
    status: "Pronto para contato",
    evidence: [
      {
        label: "Decisor",
        value: "Lucas Ferreira — Diretor Comercial",
        type: "Fato verificado",
        source: "Site institucional",
      },
      {
        label: "Anúncios",
        value: "Campanhas ativas observadas",
        type: "Fato verificado",
        source: "Meta Ad Library",
      },
      {
        label: "Hipótese",
        value: "Mensagem do anúncio pode ser reforçada na página",
        type: "Hipótese",
        source: "Análise da jornada",
      },
    ],
    diagnosis:
      "A estrutura comercial é madura e há evidência pública de aquisição. A principal hipótese é melhorar a continuidade da promessa entre anúncio e destino.",
    microInsight:
      "Os anúncios têm uma promessa específica, enquanto a página de destino amplia o foco; existe uma oportunidade de tornar essa transição mais direta.",
    suggestedMessage:
      "Olá, Lucas. Analisei alguns anúncios da Dental House e notei uma oportunidade interessante na continuidade entre a promessa do criativo e a página de destino. Não parece ser um problema de presença, e sim de alinhamento da jornada. Posso te mostrar a análise em 10 minutos?",
  },
];
