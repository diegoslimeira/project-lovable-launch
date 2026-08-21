import { afterEach, describe, expect, test } from "bun:test";
import { MAX_BYTES_PER_PAGE, MAX_TOTAL_PAGES, websiteCnpjResolver } from "./website-cnpj-resolver";
import type { CompanyCandidate } from "../providers";

// --- infraestrutura de mock de fetch (zero rede real) ---
// Cada teste registra um mapa exato URL -> handler. Qualquer URL não
// registrada simula uma falha de rede (equivalente a "página não existe" do
// ponto de vista do fetchBounded interno, que trata qualquer exceção como
// null) — isso cobre robots.txt implicitamente: se o teste não registra
// .../robots.txt, o resolver trata como "sem robots.txt" (comportamento
// correto, sem precisar registrar em todo teste).

type Handler = (init?: RequestInit) => Response | Promise<Response>;

let restoreFetch: (() => void) | undefined;

afterEach(() => {
  restoreFetch?.();
  restoreFetch = undefined;
});

function installMockFetch(handlers: Record<string, Handler>) {
  const original = globalThis.fetch;
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url =
      typeof input === "string"
        ? input
        : input instanceof URL
          ? input.toString()
          : (input as Request).url;
    const handler = handlers[url];
    if (!handler) throw new Error(`(mock) fetch não configurado para ${url}`);
    return handler(init);
  }) as typeof fetch;
  restoreFetch = () => {
    globalThis.fetch = original;
  };
}

function htmlResponse(body: string, opts: { url?: string; contentType?: string } = {}): Response {
  const response = new Response(body, {
    status: 200,
    headers: { "content-type": opts.contentType ?? "text/html; charset=utf-8" },
  });
  if (opts.url) {
    Object.defineProperty(response, "url", { value: opts.url, configurable: true });
  }
  return response;
}

function company(overrides: Partial<CompanyCandidate> = {}): CompanyCandidate {
  return {
    name: "Clínica Sorriso Prime",
    city: "Curitiba",
    state: "PR",
    website: "clinica-exemplo.example",
    sources: [],
    ...overrides,
  };
}

const HOME = "https://clinica-exemplo.example/";
const ROBOTS = "https://clinica-exemplo.example/robots.txt";

// Fixtures de CNPJ válido/inválido (dígitos verificadores conferidos por
// cálculo independente, mesma prática de cnpj.test.ts).
const VALID_CNPJ = "18.236.120/0001-58";
const VALID_CNPJ_2 = "11.444.777/0001-61";
const INVALID_CNPJ = "11.222.333/0001-00"; // formato ok, dígito verificador errado

describe("WebsiteCnpjResolver — cenários sem rede real (fetch mockado)", () => {
  test("1) site com 1 CNPJ válido em contexto de identificação -> high_confidence", async () => {
    installMockFetch({
      [HOME]: () =>
        htmlResponse(
          `<html><body><footer>CNPJ: ${VALID_CNPJ} - Clínica Sorriso Prime</footer></body></html>`,
          { url: HOME },
        ),
    });
    const result = await websiteCnpjResolver.resolve(company());
    expect(result.outcome).toBe("high_confidence");
    expect(result.cnpj).toBe("18236120000158");
  });

  test("2) CNPJ com dígito verificador inválido -> nunca vira candidato (not_found)", async () => {
    installMockFetch({
      [HOME]: () => htmlResponse(`<html><body>CNPJ: ${INVALID_CNPJ}</body></html>`, { url: HOME }),
    });
    const result = await websiteCnpjResolver.resolve(company());
    expect(result.outcome).toBe("not_found");
    expect(result.candidates).toEqual([]);
  });

  test("3) CNPJ alfanumérico válido -> high_confidence", async () => {
    // Payload alfanumérico com dígitos verificadores conferidos por cálculo
    // independente (node -e, mesmo algoritmo): 12ABC34501DE35.
    const alnumFormatted = "12.ABC.345/01DE-35";
    installMockFetch({
      [HOME]: () =>
        htmlResponse(`<html><body>Clínica Sorriso Prime - CNPJ: ${alnumFormatted}</body></html>`, {
          url: HOME,
        }),
    });
    const result = await websiteCnpjResolver.resolve(company());
    expect(result.outcome).toBe("high_confidence");
    expect(result.cnpj).toBe("12ABC34501DE35");
  });

  test("4) múltiplos CNPJs plausíveis sem desempate -> ambiguous", async () => {
    installMockFetch({
      [HOME]: () =>
        htmlResponse(
          `<html><body><p>CNPJ: ${VALID_CNPJ}</p><p>CNPJ: ${VALID_CNPJ_2}</p></body></html>`,
          { url: HOME },
        ),
    });
    const result = await websiteCnpjResolver.resolve(company());
    expect(result.outcome).toBe("ambiguous");
    expect(result.candidates.length).toBe(2);
  });

  test('5) único CNPJ em contexto "desenvolvido por" -> not_found (sinal de terceiro)', async () => {
    installMockFetch({
      [HOME]: () =>
        htmlResponse(
          `<html><body><footer>Desenvolvido por Agência XPTO - CNPJ ${VALID_CNPJ}</footer></body></html>`,
          {
            url: HOME,
          },
        ),
    });
    const result = await websiteCnpjResolver.resolve(company());
    expect(result.outcome).toBe("not_found");
  });

  test("6) nenhum CNPJ na página -> not_found", async () => {
    installMockFetch({
      [HOME]: () =>
        htmlResponse("<html><body>Bem-vindo à nossa clínica.</body></html>", { url: HOME }),
    });
    const result = await websiteCnpjResolver.resolve(company());
    expect(result.outcome).toBe("not_found");
  });

  test("7) site fora do ar (fetch falha) -> not_found, nunca lança", async () => {
    installMockFetch({
      [HOME]: () => {
        throw new TypeError("fetch failed");
      },
    });
    const result = await websiteCnpjResolver.resolve(company());
    expect(result.outcome).toBe("not_found");
    expect(result.candidates).toEqual([]);
  });

  test("8) timeout (fetch aborta) -> not_found, nunca lança", async () => {
    // Simula o resultado de um AbortController.abort() disparado pelo nosso
    // próprio timeout — testa o tratamento do erro, não a duração real de
    // FETCH_TIMEOUT_MS (6s), que não vale a pena esperar de verdade num teste.
    installMockFetch({
      [HOME]: () => {
        throw new DOMException("The operation was aborted.", "AbortError");
      },
    });
    const result = await websiteCnpjResolver.resolve(company());
    expect(result.outcome).toBe("not_found");
  });

  test("9a) redirect para o mesmo domínio -> conteúdo usado normalmente", async () => {
    installMockFetch({
      [HOME]: () =>
        htmlResponse(`<html><body>Clínica Sorriso Prime - CNPJ: ${VALID_CNPJ}</body></html>`, {
          url: "https://clinica-exemplo.example/home-final",
        }),
    });
    const result = await websiteCnpjResolver.resolve(company());
    expect(result.outcome).toBe("high_confidence");
  });

  test("9b) redirect para domínio diferente -> conteúdo descartado (not_found)", async () => {
    installMockFetch({
      [HOME]: () =>
        htmlResponse(`<html><body>Clínica Sorriso Prime - CNPJ: ${VALID_CNPJ}</body></html>`, {
          url: "https://dominio-expirado-parking.example/",
        }),
    });
    const result = await websiteCnpjResolver.resolve(company());
    expect(result.outcome).toBe("not_found");
  });

  test("10a) página enorme: CNPJ além do limite de bytes não é encontrado", async () => {
    const padding = "x".repeat(MAX_BYTES_PER_PAGE + 10_000);
    installMockFetch({
      [HOME]: () =>
        htmlResponse(`<html><body>${padding} CNPJ: ${VALID_CNPJ}</body></html>`, { url: HOME }),
    });
    const result = await websiteCnpjResolver.resolve(company());
    expect(result.outcome).toBe("not_found");
  });

  test("10b) página grande mas CNPJ antes do limite de bytes é encontrado normalmente", async () => {
    const padding = "x".repeat(1000);
    installMockFetch({
      [HOME]: () =>
        htmlResponse(
          `<html><body>Clínica Sorriso Prime - CNPJ: ${VALID_CNPJ} ${padding}</body></html>`,
          {
            url: HOME,
          },
        ),
    });
    const result = await websiteCnpjResolver.resolve(company());
    expect(result.outcome).toBe("high_confidence");
  });

  test("11) robots.txt bloqueia a home -> not_found sem tentar ler a página", async () => {
    let homeWasFetched = false;
    installMockFetch({
      [ROBOTS]: () =>
        htmlResponse("User-agent: *\nDisallow: /", { url: ROBOTS, contentType: "text/plain" }),
      [HOME]: () => {
        homeWasFetched = true;
        return htmlResponse(`CNPJ: ${VALID_CNPJ}`, { url: HOME });
      },
    });
    const result = await websiteCnpjResolver.resolve(company());
    expect(result.outcome).toBe("not_found");
    expect(homeWasFetched).toBe(false);
  });

  test("12) CNPJ só na página de contato (link descoberto na home) -> encontrado", async () => {
    const contactUrl = "https://clinica-exemplo.example/contato";
    installMockFetch({
      [HOME]: () =>
        htmlResponse(`<html><body><a href="/contato">Fale conosco</a></body></html>`, {
          url: HOME,
        }),
      [contactUrl]: () =>
        htmlResponse(`<html><body>Clínica Sorriso Prime - CNPJ: ${VALID_CNPJ}</body></html>`, {
          url: contactUrl,
        }),
    });
    const result = await websiteCnpjResolver.resolve(company());
    expect(result.outcome).toBe("high_confidence");
    expect(result.candidates[0]!.foundOnUrl).toBe(contactUrl);
  });

  test("respeita o limite de páginas totais (home + no máximo 3 adicionais)", async () => {
    const links = ["/contato", "/sobre", "/privacidade", "/termos", "/cookies"];
    const anchors = links.map((path) => `<a href="${path}">link</a>`).join(" ");
    let fetchedCount = 0;
    const handlers: Record<string, Handler> = {
      [HOME]: () => {
        fetchedCount++;
        return htmlResponse(`<html><body>${anchors}</body></html>`, { url: HOME });
      },
    };
    for (const path of links) {
      const url = `https://clinica-exemplo.example${path}`;
      handlers[url] = () => {
        fetchedCount++;
        return htmlResponse("<html><body>sem cnpj aqui</body></html>", { url });
      };
    }
    installMockFetch(handlers);
    await websiteCnpjResolver.resolve(company());
    expect(fetchedCount).toBeLessThanOrEqual(MAX_TOTAL_PAGES);
  });

  test("13) lead sem website -> not_found imediato, zero chamadas de rede", async () => {
    let anyFetchCalled = false;
    installMockFetch({});
    const original = globalThis.fetch;
    globalThis.fetch = (async (...args: Parameters<typeof fetch>) => {
      anyFetchCalled = true;
      return original(...args);
    }) as typeof fetch;

    const result = await websiteCnpjResolver.resolve(company({ website: undefined }));
    expect(result.outcome).toBe("not_found");
    expect(result.candidates).toEqual([]);
    expect(anyFetchCalled).toBe(false);
  });
});
