import { describe, expect, test } from "bun:test";
import {
  extractValidCnpjs,
  findCnpjOccurrences,
  formatCnpj,
  isValidCnpj,
  normalizeCnpj,
} from "./cnpj";

// Fixture numérica com dígitos verificadores matematicamente corretos —
// conferida via cálculo independente (node -e, mesmo algoritmo) antes de
// virar fixture, não copiada de memória sem verificação.
const VALID_NUMERIC_CNPJ = "18236120000158";
const VALID_NUMERIC_CNPJ_FORMATTED = "18.236.120/0001-58";

describe("isValidCnpj — CNPJ numérico legado", () => {
  test("aceita um CNPJ numérico válido conhecido", () => {
    expect(isValidCnpj(VALID_NUMERIC_CNPJ)).toBe(true);
  });

  test("rejeita dígito verificador incorreto", () => {
    expect(isValidCnpj("18236120000159")).toBe(false);
  });

  test("rejeita sequência de um único caractere repetido", () => {
    expect(isValidCnpj("00000000000000")).toBe(false);
    expect(isValidCnpj("11111111111111")).toBe(false);
  });

  test("rejeita tamanho incorreto", () => {
    expect(isValidCnpj("1823612000015")).toBe(false);
    expect(isValidCnpj("182361200001580")).toBe(false);
  });

  test("rejeita caracteres inválidos", () => {
    expect(isValidCnpj("1823612000-158")).toBe(false);
  });
});

describe("isValidCnpj — CNPJ alfanumérico (IN RFB nº 2.229/2024)", () => {
  // Fixture alfanumérica construída manualmente aplicando o mesmo algoritmo
  // (ASCII - 48) sobre uma raiz com letras, para exercitar o caminho
  // alfanumérico com um caso matematicamente correto por construção.
  function computeCheckDigits(payload: string): string {
    const weights1 = [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
    const weights2 = [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
    const value = (c: string) => c.charCodeAt(0) - 48;
    const digit = (chars: string, weights: number[]) => {
      let sum = 0;
      for (let i = 0; i < weights.length; i++) sum += value(chars[i]!) * weights[i]!;
      const r = sum % 11;
      return r < 2 ? 0 : 11 - r;
    };
    const d1 = digit(payload, weights1);
    const d2 = digit(payload + d1, weights2);
    return `${payload}${d1}${d2}`;
  }

  test("aceita um CNPJ alfanumérico construído corretamente", () => {
    const cnpj = computeCheckDigits("12ABC34501DE");
    expect(isValidCnpj(cnpj)).toBe(true);
  });

  test("rejeita CNPJ alfanumérico com dígito verificador errado", () => {
    const cnpj = computeCheckDigits("12ABC34501DE");
    const corrupted = cnpj.slice(0, 12) + "00";
    expect(isValidCnpj(corrupted)).toBe(corrupted === cnpj);
  });

  test("dígitos verificadores em si são sempre numéricos", () => {
    const cnpj = computeCheckDigits("ZZAAZZ99ZZ88");
    expect(/^\d{2}$/.test(cnpj.slice(12))).toBe(true);
    expect(isValidCnpj(cnpj)).toBe(true);
  });

  test("é retrocompatível: mesma fórmula produz o mesmo resultado para payload 100% numérico", () => {
    const cnpj = computeCheckDigits("182361200001");
    expect(cnpj).toBe(VALID_NUMERIC_CNPJ);
  });
});

describe("normalizeCnpj / formatCnpj", () => {
  test("remove pontuação e espaços, maiúsculas", () => {
    expect(normalizeCnpj(VALID_NUMERIC_CNPJ_FORMATTED)).toBe(VALID_NUMERIC_CNPJ);
    expect(normalizeCnpj(" 18.236.120/0001-58 ")).toBe(VALID_NUMERIC_CNPJ);
    expect(normalizeCnpj("12abc34501de00")).toBe("12ABC34501DE00");
  });

  test("formatCnpj re-adiciona a pontuação padrão", () => {
    expect(formatCnpj(VALID_NUMERIC_CNPJ)).toBe(VALID_NUMERIC_CNPJ_FORMATTED);
  });

  test("formatCnpj não altera strings de tamanho inesperado", () => {
    expect(formatCnpj("123")).toBe("123");
  });
});

describe("findCnpjOccurrences / extractValidCnpjs — extração de texto livre", () => {
  test("encontra CNPJ formatado dentro de um parágrafo", () => {
    const text = `Rodapé: CNPJ: ${VALID_NUMERIC_CNPJ_FORMATTED} — Todos os direitos reservados.`;
    const occurrences = findCnpjOccurrences(text);
    expect(occurrences.length).toBe(1);
    expect(occurrences[0]!.cnpj).toBe(VALID_NUMERIC_CNPJ);
  });

  test("encontra CNPJ não formatado (14 dígitos corridos)", () => {
    const text = `CNPJ ${VALID_NUMERIC_CNPJ} - contato@empresa.com`;
    const occurrences = findCnpjOccurrences(text);
    expect(occurrences.length).toBe(1);
    expect(occurrences[0]!.cnpj).toBe(VALID_NUMERIC_CNPJ);
  });

  test("não confunde um CNPJ válido com uma substring de um token maior", () => {
    // 20 dígitos corridos, sem separadores — não deve casar como um CNPJ de
    // 14 dígitos no meio do token (a âncora \b nas bordas do padrão evita isso).
    const text = `id: ${VALID_NUMERIC_CNPJ}9999999999`;
    const occurrences = findCnpjOccurrences(text);
    expect(occurrences.length).toBe(0);
  });

  test("extractValidCnpjs descarta ocorrências com dígito verificador inválido", () => {
    const text = `CNPJ inválido: 11.222.333/0001-00`;
    expect(extractValidCnpjs(text)).toEqual([]);
  });

  test("extractValidCnpjs deduplica ocorrências repetidas do mesmo CNPJ", () => {
    const text = `${VALID_NUMERIC_CNPJ_FORMATTED} ... depois de novo: ${VALID_NUMERIC_CNPJ}`;
    expect(extractValidCnpjs(text)).toEqual([VALID_NUMERIC_CNPJ]);
  });

  test("extractValidCnpjs encontra múltiplos CNPJs distintos", () => {
    // Segunda fixture com dígitos verificadores igualmente conferidos.
    const second = "11444777000161";
    const text = `Matriz: ${VALID_NUMERIC_CNPJ_FORMATTED}. Desenvolvido por: 11.444.777/0001-61.`;
    const result = extractValidCnpjs(text);
    expect(result).toContain(VALID_NUMERIC_CNPJ);
    expect(result).toContain(second);
    expect(result.length).toBe(2);
  });

  test("não encontra nada em texto sem CNPJ", () => {
    expect(extractValidCnpjs("Bem-vindo ao nosso site institucional.")).toEqual([]);
  });
});
