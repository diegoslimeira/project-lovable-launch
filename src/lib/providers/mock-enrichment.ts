import type { CompanyCandidate, ContactCandidate, ContactEnrichmentProvider } from "../providers";

const FIRST_NAMES = [
  "Ana",
  "Bruno",
  "Carla",
  "Diego",
  "Eduarda",
  "Felipe",
  "Gabriela",
  "Henrique",
  "Isabela",
  "João",
  "Karina",
  "Lucas",
  "Mariana",
  "Nicolas",
  "Otávio",
  "Patrícia",
  "Rafael",
  "Sofia",
  "Thiago",
  "Vitória",
];
const LAST_NAMES = [
  "Almeida",
  "Barbosa",
  "Costa",
  "Duarte",
  "Ferreira",
  "Gomes",
  "Lima",
  "Martins",
  "Nogueira",
  "Oliveira",
  "Pereira",
  "Ribeiro",
  "Santos",
  "Silva",
  "Souza",
  "Teixeira",
];
const DEFAULT_ROLES = ["Sócio(a)", "Proprietário(a)", "Diretor(a) Comercial", "Gerente Geral"];

const DDD_BY_STATE: Record<string, string> = {
  PR: "41",
  SP: "11",
  RJ: "21",
  MG: "31",
  RS: "51",
  SC: "48",
  BA: "71",
  DF: "61",
  GO: "62",
  PE: "81",
};

function pick<T>(list: T[]): T {
  return list[Math.floor(Math.random() * list.length)];
}

const DIACRITICS: Record<string, string> = {
  á: "a",
  à: "a",
  ã: "a",
  â: "a",
  ä: "a",
  é: "e",
  è: "e",
  ê: "e",
  ë: "e",
  í: "i",
  ì: "i",
  î: "i",
  ï: "i",
  ó: "o",
  ò: "o",
  õ: "o",
  ô: "o",
  ö: "o",
  ú: "u",
  ù: "u",
  û: "u",
  ü: "u",
  ç: "c",
  ñ: "n",
};

function slugify(value: string) {
  const withoutDiacritics = value
    .toLowerCase()
    .split("")
    .map((char) => DIACRITICS[char] ?? char)
    .join("");
  return withoutDiacritics.replace(/[^a-z0-9]+/g, "").slice(0, 24) || "empresa";
}

export function guessCompanyWebsite(companyName: string): string | undefined {
  if (Math.random() > 0.75) return undefined;
  return `${slugify(companyName)}.com.br`;
}

/**
 * Provider mock de enriquecimento de contatos. Gera dados coerentes (mas fictícios)
 * de decisor a partir da empresa candidata, simulando cobertura parcial: nem toda
 * empresa tem um decisor localizável nesta fase, assim como aconteceria com fontes reais.
 */
export class MockContactEnrichmentProvider implements ContactEnrichmentProvider {
  async enrich(
    company: CompanyCandidate,
    decisionMakerRoles: string[],
  ): Promise<ContactCandidate[]> {
    if (Math.random() < 0.15) return [];

    const name = `${pick(FIRST_NAMES)} ${pick(LAST_NAMES)}`;
    const role = pick(decisionMakerRoles.length ? decisionMakerRoles : DEFAULT_ROLES);
    const slug = slugify(company.name);
    const ddd = (company.state && DDD_BY_STATE[company.state]) || "41";
    const line = Math.floor(1000 + Math.random() * 8999);
    const hasEmail = Math.random() > 0.1;
    const hasInstagram = Math.random() > 0.15;

    const contact: ContactCandidate = {
      name,
      role,
      email: hasEmail ? `contato@${slug}.com.br` : undefined,
      phone: `+55 ${ddd} 9${line}-${Math.floor(1000 + Math.random() * 8999)}`,
      // Fase E.1 — antes era um fallback aplicado incondicionalmente na
      // orquestração (enrichLead), o que também rodaria com um provider
      // real. Inventar um site é comportamento do mock, então mora aqui
      // agora: só o mock "chuta" um domínio plausível quando a empresa
      // ainda não tem site conhecido.
      website: company.website ?? guessCompanyWebsite(company.name),
      linkedin: undefined,
      instagram: hasInstagram ? `@${slug}` : undefined,
      confidence: Math.round(55 + Math.random() * 40),
      source: {
        source: "Mock Enrichment Provider",
        collectedAt: new Date().toISOString(),
        method: "mock:web-search",
        confidence: Math.round(60 + Math.random() * 35),
      },
    };

    return [contact];
  }
}

export const mockContactEnrichmentProvider = new MockContactEnrichmentProvider();
