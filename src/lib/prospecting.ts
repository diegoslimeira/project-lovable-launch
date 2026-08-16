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
  | "Fato verificado"
  | "Inferência"
  | "Oportunidade"
  | "Hipótese"
  | "Não confirmado";

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
  campaignId?: string;
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
  "Encontrado",
  "Enriquecendo",
  "Validando",
  "Analisando",
  "Diagnóstico concluído",
  "Aguardando aprovação",
  "Pronto para contato",
  "Contato realizado",
  "Respondeu",
  "Interessado",
  "Reunião agendada",
  "Follow-up",
  "Sem resposta",
  "Sem interesse",
  "Desqualificado",
  "Cliente",
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
    Math.max(
      0,
      input.fit + input.digital + input.intent + input.contact + input.activity,
    ),
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
    opportunity:
      "Anúncios ativos direcionam para uma página institucional sem oferta específica.",
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
    opportunity:
      "Atividade de aquisição observada, mas contato do decisor ainda não confirmado.",
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
    opportunity:
      "Oferta comercial clara, mas baixa conexão entre criativos e página de destino.",
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
