import type {
  AdsProvider,
  AuditResult,
  CompanyCandidate,
  DigitalAuditProvider,
} from "../providers";

function pick<T>(list: T[]): T {
  return list[Math.floor(Math.random() * list.length)];
}

function socialMediaAudit(): AuditResult {
  const hasProfile = Math.random() > 0.15;
  if (!hasProfile) {
    return {
      dimension: "social_media",
      subject: "Redes sociais",
      findings: [
        {
          label: "Presença",
          value: "Nenhum perfil ativo encontrado nas principais redes",
          type: "Não confirmado",
        },
      ],
      confidence: 55,
    };
  }
  const postsPerMonth = Math.floor(2 + Math.random() * 14);
  const engagementRate = (Math.random() * 4 + 0.5).toFixed(1);
  return {
    dimension: "social_media",
    subject: "Redes sociais",
    findings: [
      {
        label: "Frequência de publicação",
        value: `${postsPerMonth} publicações nos últimos 30 dias`,
        type: "Fato verificado",
      },
      {
        label: "Engajamento",
        value: `Taxa de engajamento estimada em ${engagementRate}%`,
        type: "Inferência",
      },
      {
        label: "Crescimento",
        value: "Dados insuficientes para calcular crescimento no período consultado",
        type: "Não confirmado",
      },
    ],
    confidence: Math.round(60 + Math.random() * 30),
  };
}

function gmbAudit(): AuditResult {
  const hasProfile = Math.random() > 0.1;
  if (!hasProfile) {
    return {
      dimension: "gmb",
      subject: "Google Meu Negócio",
      findings: [
        {
          label: "Perfil",
          value: "Perfil não localizado no Google Meu Negócio",
          type: "Não confirmado",
        },
      ],
      confidence: 50,
    };
  }
  const rating = (3.5 + Math.random() * 1.5).toFixed(1);
  const reviewCount = Math.floor(5 + Math.random() * 300);
  const responded = Math.random() > 0.4;
  return {
    dimension: "gmb",
    subject: "Google Meu Negócio",
    findings: [
      {
        label: "Avaliação média",
        value: `${rating} estrelas (${reviewCount} avaliações)`,
        type: "Fato verificado",
      },
      {
        label: "Resposta a avaliações",
        value: responded
          ? "Proprietário responde às avaliações recentes"
          : "Nenhuma resposta recente às avaliações",
        type: "Fato verificado",
      },
      {
        label: "Completude do perfil",
        value: pick([
          "Perfil completo com horários, fotos e categoria",
          "Perfil incompleto: faltam fotos e horário de funcionamento",
        ]),
        type: "Inferência",
      },
    ],
    confidence: Math.round(65 + Math.random() * 30),
  };
}

function websiteAudit(company: CompanyCandidate): AuditResult {
  const hasWebsite = Boolean(company.website) || Math.random() > 0.35;
  if (!hasWebsite) {
    return {
      dimension: "website",
      subject: "Website",
      findings: [
        {
          label: "Presença",
          value: "Nenhum site institucional identificado",
          type: "Não confirmado",
        },
      ],
      confidence: 60,
    };
  }
  const issues = pick([
    ["Sem certificado HTTPS visível"],
    ["Layout não responsivo em telas menores"],
    ["Tempo de carregamento acima do recomendado"],
    [] as string[],
  ]);
  return {
    dimension: "website",
    subject: "Website",
    findings: [
      {
        label: "Presença",
        value: `Site ${company.website ?? "identificado na consulta"} localizado`,
        type: "Fato verificado",
      },
      {
        label: "Estrutura",
        value: issues.length
          ? `Possíveis problemas: ${issues.join(", ")}`
          : "Nenhum problema estrutural evidente na análise",
        type: "Inferência",
      },
    ],
    confidence: Math.round(55 + Math.random() * 35),
  };
}

function reviewsAudit(): AuditResult {
  const totalReviews = Math.floor(3 + Math.random() * 250);
  const sentiment = pick([
    "majoritariamente positivo",
    "misto, com pontos de atenção recorrentes",
    "predominantemente positivo com poucas críticas",
  ]);
  return {
    dimension: "reviews",
    subject: "Avaliações públicas",
    findings: [
      {
        label: "Volume de avaliações",
        value: `${totalReviews} avaliações públicas identificadas entre as fontes consultadas`,
        type: "Fato verificado",
      },
      { label: "Sentimento geral", value: `Sentimento ${sentiment}`, type: "Inferência" },
    ],
    confidence: Math.round(55 + Math.random() * 30),
  };
}

function visualIdentityAudit(): AuditResult {
  const hasProfilePhoto = Math.random() > 0.2;
  const consistent = Math.random() > 0.3;
  const hasBio = Math.random() > 0.25;
  return {
    dimension: "visual_identity",
    subject: "Identidade visual",
    findings: [
      {
        label: "Foto de perfil",
        value: hasProfilePhoto
          ? "Foto de perfil presente e legível"
          : "Foto de perfil ausente ou genérica",
        type: "Fato verificado",
      },
      {
        label: "Consistência visual",
        value: consistent
          ? "Cores e logotipo consistentes entre canais"
          : "Identidade visual inconsistente entre canais",
        type: "Inferência",
      },
      {
        label: "Bio/posicionamento",
        value: hasBio
          ? "Bio com posicionamento claro do negócio"
          : "Bio ausente ou genérica, sem posicionamento claro",
        type: "Inferência",
      },
    ],
    confidence: Math.round(55 + Math.random() * 30),
  };
}

function reclameAquiAudit(): AuditResult | null {
  const listed = Math.random() > 0.6;
  if (!listed) return null;
  const score = (5 + Math.random() * 4).toFixed(1);
  return {
    dimension: "reclame_aqui",
    subject: "Reclame Aqui",
    findings: [
      { label: "Reputação", value: `Nota ${score}/10 no Reclame Aqui`, type: "Fato verificado" },
    ],
    confidence: Math.round(60 + Math.random() * 25),
  };
}

function otherAudit(): AuditResult | null {
  if (Math.random() > 0.3) return null;
  return {
    dimension: "other",
    subject: "Outros sinais",
    findings: [
      {
        label: "Sinal adicional",
        value: pick([
          "Vagas de emprego abertas recentemente, indicando crescimento",
          "Menção em veículo de imprensa local",
          "Participação em eventos do setor",
        ]),
        type: "Hipótese",
      },
    ],
    confidence: Math.round(45 + Math.random() * 20),
  };
}

/**
 * Provider mock de auditoria digital. Gera achados estruturados por dimensão
 * (AuditDimension), preservando evidência suficiente para uma futura etapa de
 * Diagnosis consolidar os dados. Não é substituído por Reclame Aqui/other quando
 * não aplicável — nesse caso a dimensão simplesmente não gera resultado.
 */
export class MockDigitalAuditProvider implements DigitalAuditProvider {
  async audit(company: CompanyCandidate): Promise<AuditResult[]> {
    const results: (AuditResult | null)[] = [
      socialMediaAudit(),
      gmbAudit(),
      websiteAudit(company),
      reviewsAudit(),
      visualIdentityAudit(),
      reclameAquiAudit(),
      otherAudit(),
    ];
    return results.filter((result): result is AuditResult => result !== null);
  }
}

export const mockDigitalAuditProvider = new MockDigitalAuditProvider();

export class MockAdsProvider implements AdsProvider {
  async findPublicAds(company: CompanyCandidate): Promise<AuditResult[]> {
    const active = Math.random() > 0.55;
    if (!active) return [];
    const platform = pick(["Meta Ad Library", "Google Ads Transparency"]);
    return [
      {
        dimension: "ads",
        subject: "Anúncios públicos",
        findings: [
          {
            label: "Anúncios ativos",
            value: `Campanhas ativas de ${company.name} observadas em ${platform}`,
            type: "Fato verificado",
          },
        ],
        confidence: Math.round(70 + Math.random() * 25),
      },
    ];
  }
}

export const mockAdsProvider = new MockAdsProvider();
