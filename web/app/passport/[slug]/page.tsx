import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { cookies } from "next/headers";
import { cache } from "react";
import { AlertTriangle, BadgeCheck, Building2, Calendar, Fingerprint, Tag } from "lucide-react";
import { apiPublicPassport } from "@/lib/api";
import en from "../../../messages/en.json";
import it from "../../../messages/it.json";

const MESSAGES = { en, it } as const;
type Locale = keyof typeof MESSAGES;

const getPassport = cache((slug: string) => apiPublicPassport(slug));

function currentLocale(): Locale {
  const value = cookies().get("tf_locale")?.value;
  return value === "it" ? "it" : "en";
}

function humanDate(iso: string | null | undefined, locale: Locale): string | null {
  if (!iso) return null;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleDateString(locale === "it" ? "it-IT" : "en-GB", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

export async function generateMetadata({ params }: { params: { slug: string } }): Promise<Metadata> {
  const t = MESSAGES[currentLocale()].passport;
  try {
    const data = await getPassport(params.slug);
    if (!data) return { title: `${t.notFoundTitle} — TraceFlow` };
    const description = data.manufacturer_name
      ? `${t.intro} ${data.product_name} — ${data.manufacturer_name}.`
      : `${t.intro} ${data.product_name}.`;
    return {
      title: `${data.product_name} — ${t.title}`,
      description,
      openGraph: { title: data.product_name, description, type: "website" },
    };
  } catch {
    return { title: `${t.title} — TraceFlow` };
  }
}

export default async function PassportPage({ params }: { params: { slug: string } }) {
  const locale = currentLocale();
  const t = MESSAGES[locale].passport;

  let data: Awaited<ReturnType<typeof apiPublicPassport>>;
  try {
    data = await getPassport(params.slug);
  } catch {
    return (
      <main className="flex min-h-screen items-center justify-center px-6">
        <div className="max-w-md text-center">
          <AlertTriangle className="mx-auto text-brick" size={28} />
          <h1 className="mt-3 font-display text-3xl font-semibold">{t.unavailableTitle}</h1>
          <p className="mt-2 text-inksoft">{t.unavailableBody}</p>
          <a href="/" className="mt-6 inline-block font-semibold underline">{t.backToHome}</a>
        </div>
      </main>
    );
  }
  if (!data) notFound();

  const published = humanDate(data.published_at, locale);
  const fields = data.fields.filter((f) => f.field_key !== "product_name" && f.field_key !== "sku");

  return (
    <main className="min-h-screen">
      <div className="border-b border-line bg-parchment/60">
        <div className="mx-auto flex h-16 max-w-3xl items-center gap-3 px-6">
          <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-ink text-paper">
            <Fingerprint size={18} />
          </span>
          <span className="font-display text-lg font-semibold tracking-tight">TraceFlow</span>
          <span className="ml-auto inline-flex items-center gap-1.5 rounded-full border border-moss/30 bg-moss-wash px-2.5 py-1 text-xs font-semibold text-moss-deep">
            <BadgeCheck size={13} /> {t.humanVerified}
          </span>
        </div>
      </div>

      <article className="mx-auto max-w-3xl px-6 py-12">
        <p className="font-mono text-xs uppercase tracking-[0.16em] text-muted">{t.title}</p>
        <h1 className="mt-2 font-display text-5xl font-semibold tracking-tight">{data.product_name}</h1>
        <p className="mt-3 max-w-xl text-[15px] leading-relaxed text-inksoft">{t.intro}</p>

        <div className="mt-6 flex flex-wrap gap-x-6 gap-y-2 text-sm text-inksoft">
          {data.sku && (
            <span className="inline-flex items-center gap-1.5">
              <Tag size={14} className="text-muted" />
              <span className="text-xs font-semibold uppercase tracking-[0.12em] text-muted">{t.sku}</span>
              <span className="font-mono">{data.sku}</span>
            </span>
          )}
          {data.manufacturer_name && (
            <span className="inline-flex items-center gap-1.5">
              <Building2 size={14} className="text-muted" />
              <span className="text-xs font-semibold uppercase tracking-[0.12em] text-muted">{t.manufacturer}</span>
              <span>{data.manufacturer_name}</span>
            </span>
          )}
          {published && (
            <span className="inline-flex items-center gap-1.5">
              <Calendar size={14} className="text-muted" />
              <span className="text-xs font-semibold uppercase tracking-[0.12em] text-muted">{t.lastPublished}</span>
              <span>{published}</span>
            </span>
          )}
        </div>

        <div className="ledger-rule my-8" />

        <h2 className="text-xs font-semibold uppercase tracking-[0.12em] text-muted">{t.verifiedFields}</h2>
        {fields.length === 0 ? (
          <p className="mt-3 text-sm text-inksoft">{t.noFields}</p>
        ) : (
          <dl className="mt-3 overflow-hidden rounded-xl2 border border-line bg-white/70 shadow-card">
            {fields.map((f, i) => (
              <div key={`${f.field_key ?? f.label}-${i}`} className={i > 0 ? "border-t border-line" : ""}>
                <div className="grid gap-1 px-6 py-4 sm:grid-cols-[220px_1fr] sm:gap-4">
                  <dt className="text-xs font-semibold uppercase tracking-[0.12em] text-muted sm:pt-1">{f.label}</dt>
                  <dd className="font-display text-xl font-medium">
                    {f.value}{f.unit ? <span className="text-muted"> {f.unit}</span> : null}
                  </dd>
                </div>
              </div>
            ))}
          </dl>
        )}

        <p className="mt-8 text-center font-mono text-xs text-muted">{t.footer}</p>
      </article>
    </main>
  );
}
