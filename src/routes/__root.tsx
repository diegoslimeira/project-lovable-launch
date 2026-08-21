import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Outlet,
  Link,
  createRootRouteWithContext,
  useRouter,
  HeadContent,
  Scripts,
} from "@tanstack/react-router";
import { useEffect, type ReactNode } from "react";

import appCss from "../styles.css?url";
import { reportLovableError } from "../lib/lovable-error-reporting";

function NotFoundComponent() {
  return (
    <div
      style={{
        minHeight: "100vh",
        display: "grid",
        placeItems: "center",
        padding: "24px",
        background: "#f6f7f4",
        color: "#172019",
      }}
    >
      <div style={{ maxWidth: 420, textAlign: "center" }}>
        <h1 style={{ fontSize: 72, margin: 0 }}>404</h1>
        <h2 style={{ fontSize: 20, margin: "16px 0 8px" }}>Página não encontrada</h2>
        <p style={{ color: "#6f7972", fontSize: 13 }}>
          A página que você procura não existe ou foi movida.
        </p>
        <Link
          to="/"
          style={{
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            padding: "9px 14px",
            borderRadius: 8,
            background: "#245d3d",
            color: "#fff",
            fontSize: 12,
            fontWeight: 600,
            textDecoration: "none",
          }}
        >
          Voltar ao início
        </Link>
      </div>
    </div>
  );
}

function ErrorComponent({ error, reset }: { error: Error; reset: () => void }) {
  console.error(error);
  const router = useRouter();

  useEffect(() => {
    reportLovableError(error, { boundary: "tanstack_root_error_component" });
  }, [error]);

  return (
    <div
      style={{
        minHeight: "100vh",
        display: "grid",
        placeItems: "center",
        padding: "24px",
        background: "#f6f7f4",
        color: "#172019",
      }}
    >
      <div style={{ maxWidth: 420, textAlign: "center" }}>
        <h1 style={{ fontSize: 22, margin: 0 }}>Não foi possível carregar</h1>
        <p style={{ color: "#6f7972", fontSize: 13 }}>
          Algo deu errado. Tente novamente ou volte ao início.
        </p>
        <div style={{ display: "flex", justifyContent: "center", gap: 8 }}>
          <button
            onClick={() => {
              router.invalidate();
              reset();
            }}
            style={{
              border: 0,
              borderRadius: 8,
              padding: "9px 14px",
              background: "#245d3d",
              color: "#fff",
              fontSize: 12,
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            Tentar novamente
          </button>
          <a
            href="/"
            style={{
              border: "1px solid #e1e6df",
              borderRadius: 8,
              padding: "9px 14px",
              background: "#fff",
              color: "#4c564f",
              fontSize: 12,
              textDecoration: "none",
            }}
          >
            Início
          </a>
        </div>
      </div>
    </div>
  );
}

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "ProspectAI — Sales Intelligence" },
      {
        name: "description",
        content:
          "Prospecção fria inteligente com pesquisa, enriquecimento, auditoria digital, diagnóstico e abordagem personalizada.",
      },
      { name: "author", content: "Nexus" },
      { property: "og:title", content: "ProspectAI — Sales Intelligence" },
      {
        property: "og:description",
        content: "Menos pesquisa manual. Melhores leads. Mais reuniões qualificadas.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
    links: [
      { rel: "stylesheet", href: appCss },
      { rel: "icon", href: "/favicon.ico", type: "image/x-icon" },
    ],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});

function RootShell({ children }: { children: ReactNode }) {
  return (
    <html lang="pt-BR">
      <head>
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

function RootComponent() {
  const { queryClient } = Route.useRouteContext();

  return (
    <QueryClientProvider client={queryClient}>
      <Outlet />
    </QueryClientProvider>
  );
}
