import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Outlet,
  Link,
  createRootRouteWithContext,
  useRouter,
  useLocation,
  HeadContent,
  Scripts,
  type ErrorComponentProps,
} from "@tanstack/react-router";
import { useEffect, useState, type ReactNode } from "react";
import { useServerFn } from "@tanstack/react-start";
import { getPublicSettings } from "@/lib/settings.functions";
import { getMe } from "@/lib/auth.functions";
import { SiteSettingsProvider, brandCss, fallbackPublicSettings } from "@/lib/site-settings";
import type { PublicSettings } from "@/lib/settings-schema";

import appCss from "../styles.css?url";
import { reportLovableError } from "../lib/lovable-error-reporting";
import { Toaster } from "@/components/ui/sonner";

function NotFoundComponent() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-7xl font-bold text-foreground">404</h1>
        <h2 className="mt-4 text-xl font-semibold text-foreground">Page not found</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          The page you're looking for doesn't exist or has been moved.
        </p>
        <div className="mt-6">
          <Link
            to="/"
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Go home
          </Link>
        </div>
      </div>
    </div>
  );
}

function ErrorComponent({ error, reset }: ErrorComponentProps) {
  console.error(error);
  const router = useRouter();
  useEffect(() => {
    reportLovableError(error, { boundary: "tanstack_root_error_component" });
  }, [error]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-xl font-semibold tracking-tight text-foreground">
          This page didn't load
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Something went wrong on our end. You can try refreshing or head back home.
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <button
            onClick={() => {
              router.invalidate();
              reset();
            }}
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Try again
          </button>
          <a
            href="/"
            className="inline-flex items-center justify-center rounded-md border border-input bg-background px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-accent"
          >
            Go home
          </a>
        </div>
      </div>
    </div>
  );
}

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  loader: async (): Promise<PublicSettings> => {
    try { return await getPublicSettings(); } catch { return fallbackPublicSettings(); }
  },
  staleTime: 60_000,
  head: ({ loaderData }) => {
    const s = loaderData ?? fallbackPublicSettings();
    const base = s.general.siteUrl.replace(/\/$/, "");
    const og = s.assets.og_image && base ? base + s.assets.og_image.split("?")[0] : "";
    return {
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: s.seo.metaTitle || s.general.siteName },
      { name: "description", content: s.seo.metaDescription || s.general.description },
      ...(s.seo.keywords ? [{ name: "keywords", content: s.seo.keywords }] : []),
      ...(s.seo.ogTitle ? [{ property: "og:title", content: s.seo.ogTitle }] : []),
      ...(s.seo.ogDescription ? [{ property: "og:description", content: s.seo.ogDescription }] : []),
      ...(og ? [{ property: "og:image", content: og }, { name: "twitter:image", content: og }] : []),
      ...(s.seo.allowIndexing ? [] : [{ name: "robots", content: "noindex, nofollow" }]),
      ...(s.seo.googleVerification ? [{ name: "google-site-verification", content: s.seo.googleVerification }] : []),
      { property: "og:site_name", content: s.general.siteName },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
    scripts: s.seo.analyticsId ? [
      { src: `https://www.googletagmanager.com/gtag/js?id=${s.seo.analyticsId}`, async: true },
      { children: `window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments)}gtag('js',new Date());gtag('config','${s.seo.analyticsId}');` },
    ] : [],
    styles: brandCss(s) ? [{ children: brandCss(s) }] : [],
    links: [
      { rel: "stylesheet", href: appCss },
      s.assets.favicon ? { rel: "icon", href: s.assets.favicon } : { rel: "icon", href: "/favicon.svg", type: "image/svg+xml" },
    ],
    };
  },
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});

function RootShell({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
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
  const settings = Route.useLoaderData() ?? fallbackPublicSettings();

  return (
    <QueryClientProvider client={queryClient}>
      <SiteSettingsProvider value={settings}>
        {/* Required: nested routes render here. Removing <Outlet /> breaks all child routes. */}
        <MaintenanceGate settings={settings}><Outlet /></MaintenanceGate>
      </SiteSettingsProvider>
      <Toaster />
    </QueryClientProvider>
  );
}

// Visitors see the maintenance page; staff pages and signed-in admins are let through.
// Customer sign-in and every customer server function are also blocked server-side.
function MaintenanceGate({ settings, children }: { settings: PublicSettings; children: ReactNode }) {
  const path = useLocation({ select: (l) => l.pathname });
  const fetchMe = useServerFn(getMe);
  const [isAdmin, setIsAdmin] = useState(false);
  const on = settings.maintenance.enabled;
  useEffect(() => { if (on) fetchMe().then((u) => setIsAdmin(Boolean(u?.isAdmin))).catch(() => {}); }, [on, fetchMe]);
  if (!on || path.startsWith("/admin") || isAdmin) return <>{children}</>;
  const m = settings.maintenance;
  const logo = settings.assets.maintenance_logo ?? settings.assets.logo;
  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-lg text-center">
        {logo ? <img src={logo} alt={settings.general.siteName} className="mx-auto mb-6 h-14 w-auto object-contain" /> : <p className="mb-6 font-display text-2xl text-primary">{settings.general.siteName}</p>}
        <h1 className="font-display text-3xl text-foreground sm:text-4xl">{m.title}</h1>
        <p className="mt-4 whitespace-pre-line text-muted-foreground">{m.message}</p>
        {m.contact && <p className="mt-6 text-sm text-foreground">{m.contact}</p>}
      </div>
    </main>
  );
}
