import type { ReactNode } from "react";
import { PageShell, Eyebrow } from "@/components/site/Site";

export type InformationSection = {
  title: string;
  body?: ReactNode;
  items?: string[];
};

export function InformationPage({
  eyebrow,
  title,
  intro,
  updated,
  sections,
  aside,
}: {
  eyebrow: string;
  title: string;
  intro: string;
  updated?: string;
  sections: InformationSection[];
  aside?: ReactNode;
}) {
  return (
    <PageShell>
      <section className="bg-secondary">
        <div className="mx-auto max-w-4xl px-4 py-14 sm:px-6 sm:py-20">
          <Eyebrow>{eyebrow}</Eyebrow>
          <h1 className="mt-4 max-w-3xl text-3xl leading-tight min-[360px]:text-4xl sm:text-5xl md:text-6xl">{title}</h1>
          <p className="mt-5 max-w-2xl text-base leading-7 text-muted-foreground sm:text-lg">{intro}</p>
          {updated && <p className="mt-5 text-xs font-semibold uppercase tracking-widest text-primary">Last updated {updated}</p>}
        </div>
      </section>
      <section className="mx-auto grid max-w-4xl gap-10 px-4 py-14 sm:px-6 sm:py-20 md:grid-cols-[minmax(0,1fr)_15rem]">
        <div className="min-w-0 space-y-10">
          {sections.map((section) => (
            <article key={section.title}>
              <h2 className="text-2xl leading-tight sm:text-3xl">{section.title}</h2>
              {section.body && <div className="mt-3 text-sm leading-7 text-muted-foreground sm:text-base">{section.body}</div>}
              {section.items && (
                <ul className="mt-4 space-y-3 text-sm leading-7 text-muted-foreground sm:text-base">
                  {section.items.map((item) => (
                    <li key={item} className="grid grid-cols-[auto_minmax(0,1fr)] gap-3">
                      <span className="mt-2.5 h-1.5 w-1.5 rounded-full bg-primary" />
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
              )}
            </article>
          ))}
        </div>
        <aside className="h-fit min-w-0 break-words border-l-2 border-primary bg-secondary p-5 text-sm leading-6 text-muted-foreground [overflow-wrap:anywhere] md:sticky md:top-6">
          {aside ?? <>Questions about this page? Email <a className="font-semibold text-primary underline" href="mailto:support@universalcrest.vip">support@universalcrest.vip</a>.</>}
        </aside>
      </section>
    </PageShell>
  );
}