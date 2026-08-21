import { findCnpjOccurrences, isValidCnpj } from "../cnpj";
import type {
  CnpjCandidate,
  CnpjResolution,
  CnpjResolver,
  CompanyCandidate,
  CnpjSignal,
} from "../providers";

// Fase E.2 — WebsiteCnpjResolver: primeira implementação de CnpjResolver.
// Estratégia (aprovada na investigação da Fase E.2): homepage do domínio já
// conhecido do lead + até 3 páginas internas relevantes (contato/sobre/
// políticas/termos/cookies), busca por padrões de CNPJ validados por dígito
// verificador, e scoring explicável por sinais de contexto — nunca "primeiro
// CNPJ encontrado".
//
// Regras rígidas de escopo (todas aplicadas abaixo): mesmo domínio apenas,
// nunca crawling recursivo (só 1 nível: links da homepage, nunca links DENTRO
// de uma página secundária), no máximo 4 páginas totais por lead, timeout
// curto por request, limite de bytes lidos por página, redirects seguidos mas
// validados contra o domínio final, User-Agent identificável, robots.txt
// respeitado quando acessível, nunca headless browser, nunca tentativa de
// burlar bloqueio/anti-bot — qualquer falha de rede/timeout/bloqueio vira
// "sem CNPJ" (retorno normal), nunca uma exceção não tratada.

// Exportadas (não só const internas) para que os testes locais referenciem
// os mesmos valores em vez de duplicar números mágicos — ver
// website-cnpj-resolver.test.ts.
export const MAX_ADDITIONAL_PAGES = 3;
export const MAX_TOTAL_PAGES = 1 + MAX_ADDITIONAL_PAGES;
export const MAX_BYTES_PER_PAGE = 300_000;
export const FETCH_TIMEOUT_MS = 6_000;
const CONTEXT_RADIUS = 80;
const USER_AGENT = "ProspectAI-Bot/1.0 (+identidade cadastral; uso: prospecção B2B)";

const RELEVANT_LINK_KEYWORDS = [
  "contato",
  "contact",
  "sobre",
  "quem-somos",
  "quem_somos",
  "about",
  "privacidade",
  "privacy",
  "termos",
  "terms",
  "cookies",
  "legal",
];

const NEGATIVE_CONTEXT_KEYWORDS = [
  "desenvolvido por",
  "desenvolvido pela",
  "powered by",
  "criado por",
  "hospedado por",
  "hospedagem",
  "agência de",
  "agencia de",
  "plataforma de",
  "fornecedor",
  "criação de sites",
  "criação: ",
];

// --- fetch com timeout + limite de bytes, nunca lança: falhas viram null ---

async function fetchBounded(
  url: string,
  maxBytes: number,
  timeoutMs: number,
): Promise<string | null> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      redirect: "follow",
      headers: { "User-Agent": USER_AGENT, Accept: "text/html,text/plain;q=0.8" },
    });
    if (!response.ok || !response.body) return null;

    const contentType = response.headers.get("content-type") ?? "";
    if (contentType && !contentType.includes("text/html") && !contentType.includes("text/plain")) {
      // Recurso não-HTML (PDF, imagem etc.) — não é útil para esta análise e
      // pode ser grande; não vale a pena baixar.
      return null;
    }

    // Redirect pode ter levado para fora do domínio original (ex.: domínio
    // expirado redirecionando para uma página de parqueamento) — nesse caso o
    // conteúdo não pertence mais ao site do lead, não deve ser usado.
    try {
      const finalHost = new URL(response.url).hostname;
      const originalHost = new URL(url).hostname;
      if (finalHost !== originalHost) return null;
    } catch {
      // response.url inválida é inesperado; segue com o conteúdo mesmo assim.
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let result = "";
    let received = 0;
    while (received < maxBytes) {
      const { done, value } = await reader.read();
      if (done) break;
      // Trunca precisamente no limite mesmo quando um único chunk excede o
      // restante do orçamento de bytes — sem isso, um body entregue em poucos
      // chunks grandes (comum em respostas pequenas/médias) ignoraria o
      // limite na prática, já que o corte só acontecia entre chunks.
      const remaining = maxBytes - received;
      const bounded = value.byteLength > remaining ? value.slice(0, remaining) : value;
      received += bounded.byteLength;
      result += decoder.decode(bounded, { stream: true });
      if (bounded.byteLength < value.byteLength) break;
    }
    await reader.cancel().catch(() => {});
    return result;
  } catch {
    // Timeout (AbortError), falha de rede, DNS, TLS, desafio anti-bot etc. —
    // tudo tratado como "não foi possível ler esta página", nunca propagado.
    return null;
  } finally {
    clearTimeout(timeoutId);
  }
}

// --- robots.txt: só o grupo "User-agent: *", regras Disallow por prefixo de
// path. Não é compliance RFC 9309 completa — é a checagem de boa prática
// pedida explicitamente na Fase E.2, não uma obrigação legal no Brasil. ---

function parseDisallowRules(robotsTxt: string): string[] {
  const rules: string[] = [];
  let inWildcardGroup = false;
  for (const rawLine of robotsTxt.split(/\r?\n/)) {
    const line = rawLine.split("#")[0]!.trim();
    if (!line) continue;
    const separatorIndex = line.indexOf(":");
    if (separatorIndex === -1) continue;
    const key = line.slice(0, separatorIndex).trim().toLowerCase();
    const value = line.slice(separatorIndex + 1).trim();
    if (key === "user-agent") {
      inWildcardGroup = value === "*";
    } else if (key === "disallow" && inWildcardGroup && value) {
      rules.push(value);
    }
  }
  return rules;
}

async function fetchRobotsDisallowRules(baseUrl: URL): Promise<string[]> {
  const robotsUrl = `${baseUrl.protocol}//${baseUrl.host}/robots.txt`;
  const text = await fetchBounded(robotsUrl, 50_000, 4_000);
  if (text === null) return [];
  return parseDisallowRules(text);
}

function isDisallowed(url: string, disallowRules: string[]): boolean {
  let path: string;
  try {
    path = new URL(url).pathname;
  } catch {
    return false;
  }
  return disallowRules.some((rule) => path.startsWith(rule));
}

// --- descoberta de links internos: só a homepage é analisada por links (1
// nível, nunca recursivo), filtrados por domínio + palavra-chave relevante. ---

function stripHtmlTags(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/\s+/g, " ");
}

function extractInternalLinks(html: string, baseUrl: URL): string[] {
  const hrefPattern = /<a\b[^>]*href\s*=\s*["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  const seen = new Set<string>();
  const links: string[] = [];
  let match: RegExpExecArray | null;
  while ((match = hrefPattern.exec(html))) {
    const hrefRaw = match[1]!;
    const linkText = stripHtmlTags(match[2]!).toLowerCase();
    let resolved: URL;
    try {
      resolved = new URL(hrefRaw, baseUrl);
    } catch {
      continue;
    }
    if (resolved.hostname !== baseUrl.hostname) continue;
    if (resolved.protocol !== "http:" && resolved.protocol !== "https:") continue;
    resolved.hash = "";
    const url = resolved.toString();
    if (seen.has(url)) continue;

    const haystack = `${resolved.pathname.toLowerCase()} ${linkText}`;
    const isRelevant = RELEVANT_LINK_KEYWORDS.some((keyword) => haystack.includes(keyword));
    if (!isRelevant) continue;

    seen.add(url);
    links.push(url);
  }
  return links;
}

// --- extração de contexto + sinais por ocorrência ---

function extractContext(text: string, index: number, rawLength: number, radius: number): string {
  const start = Math.max(0, index - radius);
  const end = Math.min(text.length, index + rawLength + radius);
  return text.slice(start, end).trim();
}

function scoreSignals(context: string, company: CompanyCandidate): CnpjSignal[] {
  const lower = context.toLowerCase();
  const signals: CnpjSignal[] = [];

  const hasCnpjLabel = /cnpj/i.test(context);
  signals.push({
    label: hasCnpjLabel
      ? 'Rótulo "CNPJ" próximo ao número'
      : 'Sem rótulo "CNPJ" identificado por perto',
    positive: hasCnpjLabel,
  });

  const negativeHit = NEGATIVE_CONTEXT_KEYWORDS.find((keyword) => lower.includes(keyword));
  if (negativeHit) {
    signals.push({ label: `Contexto sugere terceiro ("${negativeHit.trim()}")`, positive: false });
  }

  const firstNameWord = company.name.toLowerCase().split(/\s+/)[0];
  if (firstNameWord && firstNameWord.length > 2 && lower.includes(firstNameWord)) {
    signals.push({ label: "Nome da empresa aparece próximo ao CNPJ", positive: true });
  }

  return signals;
}

// --- scoring/decisão final: 3 faixas explícitas, documentadas e testadas ---
// (ver website-cnpj-resolver.test.ts para os casos que calibraram os limiares)
//
// score de um candidato = 40 (base: encontrado no próprio domínio do lead,
//   o sinal mais forte desta estratégia) + 25 por sinal positivo - 60 por
//   sinal negativo, + até 20 de bônus se o mesmo CNPJ aparece em mais de uma
//   página (10 por repetição extra, capado em 20).
//
//   score < 20  -> not_found  (dominado por sinal negativo: candidato de
//                  terceiro, ou nenhum candidato válido)
//   20-69       -> ambiguous (sinal fraco/misto, ou sem desempate seguro
//                  entre 2+ candidatos)
//   >= 70 E margem >= 25 sobre o 2º colocado -> high_confidence

const NOT_FOUND_THRESHOLD = 20;
const HIGH_CONFIDENCE_THRESHOLD = 70;
const MIN_MARGIN_OVER_RUNNER_UP = 25;

function clampScore(score: number): number {
  return Math.max(0, Math.min(100, score));
}

function candidateBaseScore(signals: CnpjSignal[]): number {
  let score = 40;
  for (const signal of signals) score += signal.positive ? 25 : -60;
  return score;
}

function decideOutcome(rawCandidates: CnpjCandidate[]): CnpjResolution {
  if (rawCandidates.length === 0) {
    return {
      outcome: "not_found",
      confidence: 0,
      candidates: [],
      reason: "Nenhum CNPJ com dígitos verificadores válidos encontrado nas páginas analisadas.",
      source: "WebsiteCnpjResolver",
    };
  }

  const byCnpj = new Map<string, CnpjCandidate[]>();
  for (const candidate of rawCandidates) {
    const group = byCnpj.get(candidate.cnpj) ?? [];
    group.push(candidate);
    byCnpj.set(candidate.cnpj, group);
  }

  const scored = [...byCnpj.entries()]
    .map(([cnpj, occurrences]) => {
      const allSignals = occurrences.flatMap((o) => o.signals);
      const repetitionBonus = Math.min(20, (occurrences.length - 1) * 10);
      return { cnpj, occurrences, score: candidateBaseScore(allSignals) + repetitionBonus };
    })
    .sort((a, b) => b.score - a.score);

  const best = scored[0]!;
  const runnerUp = scored[1];

  if (best.score < NOT_FOUND_THRESHOLD) {
    return {
      outcome: "not_found",
      confidence: 0,
      candidates: rawCandidates,
      reason:
        "O(s) único(s) candidato(s) encontrado(s) têm sinais fortes de pertencer a terceiro (agência/plataforma/fornecedor), não à própria empresa.",
      source: "WebsiteCnpjResolver",
    };
  }

  if (
    best.score < HIGH_CONFIDENCE_THRESHOLD ||
    (runnerUp && best.score - runnerUp.score < MIN_MARGIN_OVER_RUNNER_UP)
  ) {
    return {
      outcome: "ambiguous",
      confidence: clampScore(best.score),
      candidates: rawCandidates,
      reason:
        scored.length > 1
          ? `${scored.length} candidatos de CNPJ distintos encontrados sem desempate seguro entre eles.`
          : "Sinais insuficientes para confirmar automaticamente o único candidato encontrado.",
      source: "WebsiteCnpjResolver",
    };
  }

  return {
    outcome: "high_confidence",
    cnpj: best.cnpj,
    confidence: clampScore(best.score),
    candidates: rawCandidates,
    reason: `CNPJ encontrado em ${best.occurrences.length} página(s) do domínio com sinais consistentes.`,
    source: "WebsiteCnpjResolver",
  };
}

export class WebsiteCnpjResolver implements CnpjResolver {
  async resolve(company: CompanyCandidate): Promise<CnpjResolution> {
    if (!company.website) {
      return {
        outcome: "not_found",
        confidence: 0,
        candidates: [],
        reason: "Lead sem website conhecido — nenhuma página para analisar.",
        source: "WebsiteCnpjResolver",
      };
    }

    let baseUrl: URL;
    try {
      const withProtocol = /^https?:\/\//i.test(company.website)
        ? company.website
        : `https://${company.website}`;
      baseUrl = new URL(withProtocol);
    } catch {
      return {
        outcome: "not_found",
        confidence: 0,
        candidates: [],
        reason: "Website do lead não é uma URL válida.",
        source: "WebsiteCnpjResolver",
      };
    }

    const disallowRules = await fetchRobotsDisallowRules(baseUrl);

    const homepageUrl = baseUrl.toString();
    if (isDisallowed(homepageUrl, disallowRules)) {
      return {
        outcome: "not_found",
        confidence: 0,
        candidates: [],
        reason: "robots.txt do domínio bloqueia a página inicial para bots.",
        source: "WebsiteCnpjResolver",
      };
    }

    const homepageHtml = await fetchBounded(homepageUrl, MAX_BYTES_PER_PAGE, FETCH_TIMEOUT_MS);
    if (homepageHtml === null) {
      return {
        outcome: "not_found",
        confidence: 0,
        candidates: [],
        reason:
          "Não foi possível acessar a página inicial do site (indisponível, timeout ou bloqueio).",
        source: "WebsiteCnpjResolver",
      };
    }

    const internalLinks = extractInternalLinks(homepageHtml, baseUrl)
      .filter((url) => !isDisallowed(url, disallowRules))
      .slice(0, MAX_ADDITIONAL_PAGES);

    const pages: { url: string; html: string }[] = [{ url: homepageUrl, html: homepageHtml }];
    for (const link of internalLinks) {
      if (pages.length >= MAX_TOTAL_PAGES) break;
      const html = await fetchBounded(link, MAX_BYTES_PER_PAGE, FETCH_TIMEOUT_MS);
      if (html !== null) pages.push({ url: link, html });
    }

    const rawCandidates: CnpjCandidate[] = [];
    for (const page of pages) {
      const text = stripHtmlTags(page.html);
      for (const occurrence of findCnpjOccurrences(text)) {
        // Regex sozinha nunca é aceita: descarta imediatamente qualquer
        // ocorrência que não passe na validação de dígito verificador.
        if (!isValidCnpj(occurrence.cnpj)) continue;
        const context = extractContext(
          text,
          occurrence.index,
          occurrence.raw.length,
          CONTEXT_RADIUS,
        );
        rawCandidates.push({
          cnpj: occurrence.cnpj,
          foundOnUrl: page.url,
          context,
          signals: scoreSignals(context, company),
        });
      }
    }

    return decideOutcome(rawCandidates);
  }
}

export const websiteCnpjResolver = new WebsiteCnpjResolver();
