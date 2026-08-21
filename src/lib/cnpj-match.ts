import { normalizeCnpj } from "./cnpj";
import type { CompanyCandidate, RegistryCompanyData } from "./providers";

// Fase E.2 — confirmação FINAL de um candidato a CNPJ contra dados oficiais.
// Roda DEPOIS do CnpjResolver (que só olha sinais do próprio site) e DEPOIS
// do CompanyRegistryProvider.lookup(cnpj) (que só devolve dados oficiais) —
// é o segundo portão de confiança pedido explicitamente na Fase E.2: mesmo um
// candidato de "alta confiança" do site precisa bater nome/cidade/UF com o
// registro oficial antes de ser aceito como match seguro.

const LEGAL_SUFFIX_PATTERN =
  /\b(ltda|me|epp|eireli|s\/?a|sa|cia|comercio|comercial|servicos|consultoria|associacao|cooperativa)\b/g;

// Marcas de acento combinantes pós-NFD (ex.: "á" -> "a" + U+0301). Construído
// via RegExp(string) em vez de um literal /[̀-ͯ]/ porque escapes
// unicode em charset literal podem ser normalizados para o próprio caractere
// combinante pelas ferramentas de edição — como string, o \\u permanece
// texto puro até virar RegExp em runtime.
const COMBINING_MARKS_PATTERN = new RegExp("[\\u0300-\\u036f]", "g");

// Exportada — reutilizada fora deste módulo (ex.: dedup de leads manuais em
// manual-lead.ts, comparação de cidade) como utilitário genérico de
// normalização de texto (acento/case/pontuação/sufixo societário).
export function normalizeForComparison(text: string): string {
  return text
    .normalize("NFD")
    .replace(COMBINING_MARKS_PATTERN, "")
    .toLowerCase()
    .replace(LEGAL_SUFFIX_PATTERN, "")
    .replace(/[^a-z0-9\s]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

// UFs brasileiras: nome completo -> sigla. Necessário porque o Discovery via
// Google Places persiste o nome completo do estado (ex.: "Paraná", extraído
// de addressComponents por administrative_area_level_1 — ver
// google-places-discovery.ts), enquanto o OpenCNPJ sempre devolve a sigla de
// 2 letras (ex.: "PR" — confirmado no teste real isolado da Fase E.2). Sem
// essa normalização, uma comparação por igualdade estrita rejeitaria como
// divergente um match que na verdade é idêntico, só por causa do formato.
const STATE_NAME_TO_UF: Record<string, string> = {
  acre: "AC",
  alagoas: "AL",
  amapa: "AP",
  amazonas: "AM",
  bahia: "BA",
  ceara: "CE",
  "distrito federal": "DF",
  "espirito santo": "ES",
  goias: "GO",
  maranhao: "MA",
  "mato grosso": "MT",
  "mato grosso do sul": "MS",
  "minas gerais": "MG",
  para: "PA",
  paraiba: "PB",
  parana: "PR",
  pernambuco: "PE",
  piaui: "PI",
  "rio de janeiro": "RJ",
  "rio grande do norte": "RN",
  "rio grande do sul": "RS",
  rondonia: "RO",
  roraima: "RR",
  "santa catarina": "SC",
  "sao paulo": "SP",
  sergipe: "SE",
  tocantins: "TO",
};

// Normaliza um valor de estado (sigla OU nome completo, com ou sem acento)
// para a sigla de 2 letras, para comparação — nunca lançamos se o valor não
// bater com nada conhecido, só devolvemos o valor normalizado (maiúsculo, sem
// acento) como fallback, para não quebrar em um formato inesperado.
// Exportada — reutilizada fora deste módulo (ex.: dedup de leads manuais em
// manual-lead.ts) para comparar UF de forma consistente com o resto do
// domínio.
export function normalizeStateToUf(state: string): string {
  const normalized = normalizeForComparison(state);
  const bySiglaCandidate = normalized.toUpperCase();
  if (bySiglaCandidate.length === 2) return bySiglaCandidate;
  return STATE_NAME_TO_UF[normalized] ?? bySiglaCandidate;
}

// Achado real do teste de cobertura de 5 leads (Fase E.2): lead do Google
// Places "Clínica Smile Lovers | Seu dentista no Batel em Curitiba" (7
// tokens) vs. nome fantasia oficial "SMILE LOVERS" (2 tokens) — os 2 tokens
// da fonte oficial estavam 100% contidos no nome do lead, mas o score antigo
// (shared / MAX(tamanho)) dividia por 7, punindo o lead por ter um nome mais
// longo (tagline de marketing colada pelo Google Places), não por ser um
// nome realmente diferente. A correção não é "baixar o threshold" — é trocar
// a base de comparação: (1) descarta a tagline após um separador seguro
// antes de tokenizar, (2) remove termos genéricos de estabelecimento (que
// nunca deveriam, sozinhos, confirmar uma identidade), (3) mede cobertura
// pelo tamanho do MENOR conjunto de tokens distintivos, não do maior — ou
// seja, "o nome mais curto está contido no mais longo?", não "quanto do
// texto total bate?".

// Separadores de tagline/slogan seguros: `|`, en dash, em dash e hífen
// cercados de espaço (nunca hífen colado, ex. "Água-Verde", que é parte de
// uma palavra/nome composto, não separador de frase). Só o segmento ANTES do
// primeiro separador é usado — convenção observada em nomes de exibição do
// Google Places ("Nome Real | descrição/slogan").
const TAGLINE_SEPARATOR_PATTERN = /\s[|–—-]\s/;

function primarySegment(name: string): string {
  return name.split(TAGLINE_SEPARATOR_PATTERN)[0]?.trim() || name;
}

// Termos genéricos de estabelecimento do segmento atual do produto (clínicas
// odontológicas/saúde) — nunca contam sozinhos como sinal de identidade,
// exatamente o pedido de "evitar que palavras genéricas sozinhas produzam
// match". Escopo deliberadamente restrito ao segmento hoje suportado; um
// segmento futuro diferente precisaria da própria lista.
const GENERIC_ESTABLISHMENT_TERMS = new Set([
  "clinica",
  "clinicas",
  "clinico",
  "clinicos",
  "centro",
  "instituto",
  "institutos",
  "consultorio",
  "consultorios",
  "studio",
  "policlinica",
  "policlinico",
  "odonto",
  "odontologia",
  "odontologico",
  "odontologica",
  "dental",
  "dentista",
  "dentistas",
  "saude",
  "estetica",
  "estetico",
  "esteticos",
  "medico",
  "medica",
  "medicos",
  "hospital",
  "laboratorio",
]);

// Tokens "distintivos" de um nome: tagline removida, acentos/case/pontuação/
// sufixo societário normalizados (normalizeForComparison), termos genéricos
// de estabelecimento removidos. Se a remoção de genéricos esvaziar o
// conjunto (nome composto só por termos genéricos, ex. "Clínica Odontológica"
// sem mais nada), usa os tokens sem essa remoção — nunca fica com zero
// tokens só por causa do stoplist, isso esconderia o sinal em vez de
// simplesmente não achar nada genérico para remover.
function distinctiveTokens(name: string): Set<string> {
  const normalized = normalizeForComparison(primarySegment(name));
  const allTokens = normalized.split(" ").filter((t) => t.length > 2);
  const withoutGeneric = allTokens.filter((t) => !GENERIC_ESTABLISHMENT_TERMS.has(t));
  return new Set(withoutGeneric.length > 0 ? withoutGeneric : allTokens);
}

// Cobertura do MENOR conjunto de tokens distintivos pelo maior — não do
// maior pelo total combinado. "SMILE LOVERS" (2 tokens) inteiramente contido
// em "Clínica Smile Lovers | ..." (2 tokens distintivos após tagline+genérico
// removidos) dá 1.0; um nome de 5 tokens distintivos que só compartilha 1
// com um nome de 2 tokens dá 0.5 (metade do menor lado), não 0.2 (1 de 5).
function distinctiveOverlapScore(a: string, b: string): number {
  const tokensA = distinctiveTokens(a);
  const tokensB = distinctiveTokens(b);
  if (tokensA.size === 0 || tokensB.size === 0) return 0;
  let shared = 0;
  for (const token of tokensA) if (tokensB.has(token)) shared++;
  return shared / Math.min(tokensA.size, tokensB.size);
}

// Maior similaridade entre o nome do lead e a razão social OU o nome
// fantasia oficial — um lead descoberto via Google Places normalmente carrega
// o nome "fantasia" popular, que costuma bater melhor com nome_fantasia do
// que com razão social (frequentemente bem diferente, ex. sócios no nome).
export function nameSimilarity(leadCompanyName: string, registry: RegistryCompanyData): number {
  const legalScore = distinctiveOverlapScore(leadCompanyName, registry.legalName);
  const tradeScore = registry.tradeName
    ? distinctiveOverlapScore(leadCompanyName, registry.tradeName)
    : 0;
  return Math.max(legalScore, tradeScore);
}

// Fase F — mesma cobertura de tokens distintivos de distinctiveOverlapScore,
// mas exposta para comparar dois nomes de EMPRESA (lead vs. lead) em vez de
// lead vs. registro oficial — reutilizada pelo dedup de cadastro manual
// (manual-lead.ts) em vez de duplicar a lógica de tagline/termo genérico.
export function companyNameSimilarity(nameA: string, nameB: string): number {
  return distinctiveOverlapScore(nameA, nameB);
}

// Pelo menos 70% dos tokens distintivos do MENOR nome (lead ou fonte oficial,
// o que for mais curto) precisam estar presentes no outro — deliberadamente
// mais alto que uma fração simples do total combinado, porque agora a base
// de comparação já é "o nome mais específico", não mais diluída por
// diferença de tamanho entre os dois nomes. Calibrado contra os casos reais
// e sintéticos em cnpj-match.test.ts, incluindo negativos (nomes que só
// compartilham um termo genérico, ou só compartilham uma tagline descartada).
const NAME_SIMILARITY_THRESHOLD = 0.7;

export type RegistryMatchResult = {
  confirmed: boolean;
  nameSimilarityScore: number;
  cityMatches: boolean;
  stateMatches: boolean;
};

// Cidade/UF ausentes de QUALQUER um dos lados não bloqueiam a confirmação
// (não há dado para contradizer) — só uma DIVERGÊNCIA real entre dois valores
// presentes derruba o match. O sinal mais forte continua sendo a similaridade
// de nome.
export function confirmRegistryMatch(
  company: CompanyCandidate,
  registry: RegistryCompanyData,
): RegistryMatchResult {
  const nameSimilarityScore = nameSimilarity(company.name, registry);
  const cityMatches =
    !company.city ||
    !registry.city ||
    normalizeForComparison(company.city) === normalizeForComparison(registry.city);
  const stateMatches =
    !company.state ||
    !registry.state ||
    normalizeStateToUf(company.state) === normalizeStateToUf(registry.state);

  return {
    confirmed: nameSimilarityScore >= NAME_SIMILARITY_THRESHOLD && cityMatches && stateMatches,
    nameSimilarityScore,
    cityMatches,
    stateMatches,
  };
}

// Fase F.1.1 — regra de confirmação de identidade ESPECÍFICA do cadastro
// manual por CNPJ, deliberadamente separada de confirmRegistryMatch acima em
// vez de generalizar aquele matcher. Os dois resolvem problemas diferentes:
//
// - confirmRegistryMatch (Fase E.2): o CNPJ é uma HIPÓTESE inferida por
//   scraping (WebsiteCnpjResolver) a partir do site do lead — pode ser o
//   CNPJ de uma agência/plataforma/fornecedor citado no rodapé, não da
//   própria empresa. Nome+cidade+UF batendo é a corroboração que torna esse
//   CNPJ inferido seguro o suficiente para aceitar. Continua exigindo os 3
//   sinais — não foi alterado, não deve ser enfraquecido.
//
// - confirmManualIdentity (esta função): o CNPJ foi digitado DIRETAMENTE
//   pelo usuário — é a âncora primária de identidade, não uma hipótese.
//   Achado real (lead Jacomar, teste remoto controlado): usuário digitou
//   "Jacomar Supermercado" / Curitiba; CNPJ 78.413.325/0001-93 é válido e o
//   OpenCNPJ o encontra, mas devolve razão social "SUPERMERCADO JACOMAR
//   LTDA" com sede cadastral em São José dos Pinhais/PR (matriz e filial
//   operacional em municípios diferentes é uma situação legítima e comum —
//   não indica que o CNPJ é de outra empresa). Bloquear esse caso com o
//   mesmo portão de nome+cidade+UF do fluxo de Discovery rejeitaria uma
//   identidade que já está corretamente confirmada pelo CNPJ.
//
// Bloqueio real (`identity_rejected`) é só quando o próprio elo CNPJ->dado
// cadastral está comprometido: o registro devolvido é de um CNPJ diferente
// do que foi pedido (nunca deveria acontecer com um provider correto, mas é
// o único caso que realmente compromete "de qual empresa estamos falando").
// CNPJ inválido e "não encontrado" são tratados ANTES desta função (ver
// resolveManualLeadIdentity em prospecting-service.ts) — não duplicados
// aqui. Nome/cidade/UF divergentes nunca bloqueiam: viram sinais de alerta
// (`warnings`), registrados como evidência para o usuário revisar, nunca
// escondidos.
export type ManualIdentityOutcome =
  "identity_confirmed" | "identity_confirmed_with_warnings" | "identity_rejected";

export type ManualIdentityWarning = "nome_diverge" | "cidade_diverge" | "uf_diverge";

export type ManualIdentityConfirmation = {
  outcome: ManualIdentityOutcome;
  warnings: ManualIdentityWarning[];
  nameSimilarityScore: number;
  cityMatches: boolean;
  stateMatches: boolean;
  reason: string;
};

export function confirmManualIdentity(
  manualCnpj: string,
  input: { company: string; city?: string; state?: string },
  registry: RegistryCompanyData,
): ManualIdentityConfirmation {
  // Único bloqueio real desta função: o registro cadastral devolvido não é
  // do CNPJ pedido. normalizeCnpj de novo aqui (não confia que todo
  // CompanyRegistryProvider já devolve normalizado) — comparação nunca deve
  // falhar só por formatação.
  if (normalizeCnpj(registry.cnpj) !== manualCnpj) {
    return {
      outcome: "identity_rejected",
      warnings: [],
      nameSimilarityScore: 0,
      cityMatches: false,
      stateMatches: false,
      reason: "O CNPJ retornado pela base cadastral não corresponde ao CNPJ informado.",
    };
  }

  const nameSimilarityScore = nameSimilarity(input.company, registry);
  const cityMatches =
    !input.city ||
    !registry.city ||
    normalizeForComparison(input.city) === normalizeForComparison(registry.city);
  const stateMatches =
    !input.state ||
    !registry.state ||
    normalizeStateToUf(input.state) === normalizeStateToUf(registry.state);

  const warnings: ManualIdentityWarning[] = [];
  if (nameSimilarityScore < NAME_SIMILARITY_THRESHOLD) warnings.push("nome_diverge");
  if (!cityMatches) warnings.push("cidade_diverge");
  if (!stateMatches) warnings.push("uf_diverge");

  return {
    outcome: warnings.length === 0 ? "identity_confirmed" : "identity_confirmed_with_warnings",
    warnings,
    nameSimilarityScore,
    cityMatches,
    stateMatches,
    reason:
      warnings.length === 0
        ? "Nome, cidade e UF informados conferem com o cadastro oficial."
        : "CNPJ confirmado, mas alguns dados informados divergem do cadastro oficial — ver alertas.",
  };
}
