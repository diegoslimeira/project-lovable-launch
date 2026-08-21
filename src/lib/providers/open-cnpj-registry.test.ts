import { afterEach, describe, expect, test } from "bun:test";
import { openCnpjRegistryProvider } from "./open-cnpj-registry";

let restoreFetch: (() => void) | undefined;

afterEach(() => {
  restoreFetch?.();
  restoreFetch = undefined;
});

function installMockFetch(handler: (url: string) => Response | Promise<Response>) {
  const original = globalThis.fetch;
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const url =
      typeof input === "string"
        ? input
        : input instanceof URL
          ? input.toString()
          : (input as Request).url;
    return handler(url);
  }) as typeof fetch;
  restoreFetch = () => {
    globalThis.fetch = original;
  };
}

const CNPJ = "18236120000158";

describe("OpenCnpjRegistryProvider — sem rede real (fetch mockado)", () => {
  // Payload conferido campo a campo contra o schema real do Worker
  // (github.com/Hitmasu/OpenCNPJ, src/Worker/src/schema.ts) — cnae_principal
  // é um código só (sem descrição), cnaes_secundarios é array de códigos,
  // porte_empresa (não "porte"), tipo_logradouro separado de logradouro.
  test("mapeia uma resposta compatível para RegistryCompanyData", async () => {
    installMockFetch(
      () =>
        new Response(
          JSON.stringify({
            cnpj: "18236120000158",
            razao_social: "Sorriso Prime Odontologia LTDA",
            nome_fantasia: "Clínica Sorriso Prime",
            situacao_cadastral: "Ativa",
            cnae_principal: "8630503",
            cnaes_secundarios: ["4772500"],
            data_inicio_atividade: "2015-03-10",
            porte_empresa: "ME",
            natureza_juridica: "Sociedade Empresária Limitada",
            tipo_logradouro: "Rua",
            logradouro: "das Flores",
            numero: "100",
            bairro: "Batel",
            municipio: "Curitiba",
            uf: "PR",
            cep: "80420000",
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        ),
    );

    const result = await openCnpjRegistryProvider.lookup(CNPJ);
    expect(result).not.toBeNull();
    expect(result!.cnpj).toBe("18236120000158");
    expect(result!.legalName).toBe("Sorriso Prime Odontologia LTDA");
    expect(result!.tradeName).toBe("Clínica Sorriso Prime");
    expect(result!.registrationStatus).toBe("Ativa");
    expect(result!.primaryCnae).toBe("8630-5/03");
    expect(result!.secondaryCnaes).toEqual(["4772-5/00"]);
    expect(result!.size).toBe("ME");
    expect(result!.city).toBe("Curitiba");
    expect(result!.state).toBe("PR");
    expect(result!.address).toBe("Rua das Flores, 100, Batel");
  });

  test("preserva letras no CNPJ alfanumérico devolvido pela API (nunca faz strip de não-dígitos)", async () => {
    installMockFetch(
      () =>
        new Response(
          JSON.stringify({
            cnpj: "12.ABC.345/01DE-35",
            razao_social: "Empresa Alfanumérica LTDA",
            situacao_cadastral: "Ativa",
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        ),
    );
    const result = await openCnpjRegistryProvider.lookup("12ABC34501DE35");
    expect(result!.cnpj).toBe("12ABC34501DE35");
  });

  test("nome_fantasia vazio é tratado como ausente", async () => {
    installMockFetch(
      () =>
        new Response(
          JSON.stringify({
            cnpj: CNPJ,
            razao_social: "Empresa Sem Fantasia LTDA",
            situacao_cadastral: "Ativa",
            nome_fantasia: "",
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        ),
    );
    const result = await openCnpjRegistryProvider.lookup(CNPJ);
    expect(result!.tradeName).toBeUndefined();
  });

  test("404 -> null (CNPJ válido mas não encontrado, nunca inventa dado)", async () => {
    installMockFetch(() => new Response("", { status: 404 }));
    const result = await openCnpjRegistryProvider.lookup(CNPJ);
    expect(result).toBeNull();
  });

  test("erro HTTP não-404 -> lança com status/corpo capturados", async () => {
    installMockFetch(
      () =>
        new Response("Internal Server Error", {
          status: 500,
          headers: { "content-type": "text/plain" },
        }),
    );
    await expect(openCnpjRegistryProvider.lookup(CNPJ)).rejects.toThrow(/status 500/);
  });

  test("resposta em formato inesperado (sem campos obrigatórios) -> lança em vez de persistir dado incompleto", async () => {
    installMockFetch(
      () =>
        new Response(JSON.stringify({ algum_campo_diferente: true }), {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
    );
    await expect(openCnpjRegistryProvider.lookup(CNPJ)).rejects.toThrow(/formato inesperado/);
  });

  test("falha de rede (fetch lança) propaga como erro, não como null silencioso", async () => {
    installMockFetch(() => {
      throw new TypeError("fetch failed");
    });
    await expect(openCnpjRegistryProvider.lookup(CNPJ)).rejects.toThrow();
  });
});
