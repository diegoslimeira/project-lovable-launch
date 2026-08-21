// Fase E.2 — utilitários puros de CNPJ: extração por regex, normalização,
// formatação e validação matemática dos dígitos verificadores. Nenhuma
// dependência de rede/DB — usado tanto pelo WebsiteCnpjResolver quanto pelos
// testes locais.
//
// Suporta os dois formatos vigentes: o numérico clássico e o alfanumérico
// (Instrução Normativa RFB nº 2.229/2024, em vigor desde 31/07/2026) — 8
// caracteres de raiz + 4 de filial (dígitos OU letras maiúsculas), sempre
// terminando em 2 dígitos verificadores puramente numéricos. O algoritmo de
// validação é o mesmo Módulo 11 de sempre, generalizado: cada caractere
// (dígito ou letra) entra na soma ponderada pelo seu valor ASCII menos 48
// ('0'..'9' → 0..9, exatamente como antes; 'A'..'Z' → 17..42) — isso é
// retrocompatível com CNPJs numéricos legados sem precisar de um caminho de
// código separado.

const ASCII_ZERO = 48;

function charValue(char: string): number {
  return char.charCodeAt(0) - ASCII_ZERO;
}

const FIRST_DIGIT_WEIGHTS = [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
const SECOND_DIGIT_WEIGHTS = [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];

function computeCheckDigit(chars: string, weights: number[]): number {
  let sum = 0;
  for (let i = 0; i < weights.length; i++) {
    sum += charValue(chars[i]!) * weights[i]!;
  }
  const remainder = sum % 11;
  return remainder < 2 ? 0 : 11 - remainder;
}

// Remove pontuação comum (. - /) e espaços, normaliza para maiúsculas. Não
// valida formato/tamanho — só limpa. Use isValidCnpj para validar de verdade.
export function normalizeCnpj(raw: string): string {
  return raw.replace(/[.\-/\s]/g, "").toUpperCase();
}

export function formatCnpj(cnpj: string): string {
  if (cnpj.length !== 14) return cnpj;
  return `${cnpj.slice(0, 2)}.${cnpj.slice(2, 5)}.${cnpj.slice(5, 8)}/${cnpj.slice(8, 12)}-${cnpj.slice(12, 14)}`;
}

// Valida um CNPJ já normalizado (14 caracteres, sem pontuação). Aceita tanto
// o formato numérico legado quanto o alfanumérico atual — os 2 últimos
// caracteres são sempre dígitos (verificadores), os 12 primeiros podem ser
// dígitos ou letras maiúsculas em qualquer combinação.
export function isValidCnpj(cnpj: string): boolean {
  const normalized = cnpj.toUpperCase();
  if (!/^[0-9A-Z]{12}\d{2}$/.test(normalized)) return false;
  // Guarda clássica contra sequências de um único caractere repetido (ex.:
  // "00000000000000") — formato válido, mas nunca uma raiz real emitida.
  if (/^(.)\1{13}$/.test(normalized)) return false;

  const payload = normalized.slice(0, 12);
  const providedDigits = normalized.slice(12);

  const firstDigit = computeCheckDigit(payload, FIRST_DIGIT_WEIGHTS);
  const secondDigit = computeCheckDigit(payload + firstDigit, SECOND_DIGIT_WEIGHTS);

  return providedDigits === `${firstDigit}${secondDigit}`;
}

export type CnpjOccurrence = {
  cnpj: string;
  index: number;
  raw: string;
};

// Regex deliberadamente permissiva (separadores opcionais, cobre formatado e
// não formatado, numérico e alfanumérico) com \b nas bordas para não casar
// como substring de um token alfanumérico maior (ex.: um hash). A precisão
// real vem da validação de dígito verificador em isValidCnpj, chamada pelo
// caller sobre cada ocorrência — a regex sozinha SEMPRE deve ser tratada como
// "candidato a validar", nunca como resultado final.
const CNPJ_OCCURRENCE_PATTERN =
  /\b[0-9A-Za-z]{2}\.?[0-9A-Za-z]{3}\.?[0-9A-Za-z]{3}\/?[0-9A-Za-z]{4}-?\d{2}\b/g;

// Encontra todas as ocorrências de padrão-CNPJ em um texto livre, com a
// posição no texto original (para extração de contexto). Não valida dígito
// verificador aqui — só reconhece o formato e normaliza.
export function findCnpjOccurrences(text: string): CnpjOccurrence[] {
  const pattern = new RegExp(CNPJ_OCCURRENCE_PATTERN.source, "g");
  const results: CnpjOccurrence[] = [];
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(text))) {
    const raw = match[0];
    const normalized = normalizeCnpj(raw);
    if (normalized.length === 14) {
      results.push({ cnpj: normalized, index: match.index, raw });
    }
  }
  return results;
}

// Conveniência: só os CNPJs (normalizados, deduplicados) que passam na
// validação de dígito verificador, na ordem em que aparecem no texto.
export function extractValidCnpjs(text: string): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const occurrence of findCnpjOccurrences(text)) {
    if (!isValidCnpj(occurrence.cnpj)) continue;
    if (seen.has(occurrence.cnpj)) continue;
    seen.add(occurrence.cnpj);
    result.push(occurrence.cnpj);
  }
  return result;
}
