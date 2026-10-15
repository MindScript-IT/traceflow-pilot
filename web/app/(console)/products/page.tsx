"use client";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  ArrowRight, ArrowUpRight, BadgeCheck, FileSearch, FileUp, PackagePlus,
  Rocket, ShieldCheck, TriangleAlert,
} from "lucide-react";
import { clsx } from "clsx";
import { apiAuthed } from "@/lib/api";
import { Donut } from "@/components/Donut";
import { StateBadge } from "@/components/StateBadge";
import { useTranslations } from "next-intl";

type Product = {
  id: string; sku: string; name: string; category: string; manufacturer_name: string;
  public_slug: string; passport_published: boolean;
  counts: Record<string, number>; readiness_percent: number; actions_required: number;
  total_required: number; next_action: { key: string; label: string };
};

const ACTION_TONE: Record<string, string> = {
  live: "bg-moss-wash text-moss-deep",
  publish: "bg-moss-wash text-moss-deep",
  resolve: "bg-brick-wash text-brick",
  review: "bg-amber-wash text-amber",
  upload: "bg-parchment text-ink",
  chase: "bg-parchment text-inksoft",
};

const STEPS = [
  { Icon: FileUp, key: "upload" },
  { Icon: FileSearch, key: "review" },
  { Icon: Rocket, key: "publish" },
] as const;

function Stat({ label, value, sub, Icon, tone }: { label: string; value: string; sub: string; Icon: typeof Rocket; tone: string }) {
  return (
    <div className="animate-rise rounded-xl2 border border-line bg-white/70 p-5 shadow-card">
      <div className="flex items-center gap-3">
        <span className={clsx("flex h-10 w-10 items-center justify-center rounded-lg", tone)}>
          <Icon size={19} />
        </span>
        <span className="text-xs font-semibold uppercase tracking-[0.12em] text-muted">{label}</span>
      </div>
      <p className="mt-3 font-display text-4xl font-semibold tabular-nums">{value}</p>
      <p className="mt-1 text-[13px] text-inksoft">{sub}</p>
    </div>
  );
}

function overallState(p: Product): string {
  if (p.passport_published) return "verified";
  if ((p.counts.conflicting ?? 0) > 0) return "conflicting";
  if ((p.counts.proposed ?? 0) > 0) return "proposed";
  if ((p.counts.verified ?? 0) === p.total_required && p.total_required > 0) return "verified";
  return "missing";
}

export default function Dashboard() {
  const t = useTranslations("console.dashboard");
  const [products, setProducts] = useState<Product[] | null>(null);
  const [error, setError] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ sku: "", name: "", manufacturer_name: "", category: "footwear" });
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    apiAuthed("/api/products").then(setProducts).catch((e) => setError(e.message));
  }, []);

  const agg = useMemo(() => {
    const list = products ?? [];
    const counts: Record<string, number> = { verified: 0, proposed: 0, missing: 0, conflicting: 0 };
    let actions = 0, published = 0, readiness = 0;
    for (const p of list) {
      for (const k of Object.keys(counts)) counts[k] += p.counts[k] ?? 0;
      actions += p.actions_required;
      if (p.passport_published) published += 1;
      readiness += p.readiness_percent;
    }
    return { counts, actions, published, avg: list.length ? Math.round(readiness / list.length) : 0 };
  }, [products]);

  async function create(e: React.FormEvent) {
    e.preventDefault();
    setError(""); setBusy(true);
    try {
      const out = await apiAuthed("/api/products", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      window.location.href = `/products/${out.id}`;
    } catch (err) {
      setError(err instanceof Error ? err.message : t("createFailed"));
      setBusy(false);
    }
  }

  return (
    <>
      <div className="flex flex-wrap items-end gap-4">
        <div>
          <p className="font-mono text-xs uppercase tracking-[0.14em] text-muted">{t("commandCenter")}</p>
          <h1 className="mt-1 font-display text-4xl font-semibold tracking-tight">{t("title")}</h1>
        </div>
        <button
          onClick={() => setShowForm((v) => !v)}
          className="ml-auto inline-flex min-h-[44px] items-center gap-2 rounded-xl bg-ink px-5 font-semibold text-paper transition-transform duration-150 hover:scale-[1.02] active:scale-[0.98]"
        >
          <PackagePlus size={17} /> {t("newDossier")}
        </button>
      </div>

      {error && <p className="mt-4 rounded-xl border border-brick/30 bg-brick-wash p-3.5 text-sm font-medium text-brick">{error}</p>}

      {(() => {
        const seen: Record<string, number> = {};
        (products ?? []).forEach((p) => { seen[p.sku] = (seen[p.sku] ?? 0) + 1; });
        const dups = Object.keys(seen).filter((k) => seen[k] > 1);
        if (dups.length === 0) return null;
        return (
          <p className="mt-4 rounded-xl border border-amber/40 bg-amber-wash p-3.5 text-sm font-medium text-amber">
            {t("duplicateSkus", { count: dups.length, skus: dups.join(", ") })}
          </p>
        );
      })()}

      {showForm && (
        <form onSubmit={create} className="animate-rise mt-5 grid gap-4 rounded-xl2 border border-line bg-white/70 p-6 shadow-card md:grid-cols-3">
          {([["name", t("productName"), "Valencia Runner"], ["sku", t("sku"), "VR-2026-BRN"], ["manufacturer_name", t("manufacturer"), "Pilot Footwear SARL"]] as const).map(([k, label, hint]) => (
            <div key={k}>
              <label className="text-xs font-semibold uppercase tracking-[0.12em] text-muted" htmlFor={k}>{label}</label>
              <input id={k} required placeholder={hint} value={form[k]} onChange={(e) => setForm({ ...form, [k]: e.target.value })}
                className="mt-2 min-h-[44px] w-full rounded-lg border border-line bg-paper px-3.5 text-[15px] outline-none transition-shadow duration-150 placeholder:text-muted/70 focus:border-ink focus:ring-2 focus:ring-ink/15" />
            </div>
          ))}
          <div className="flex items-end md:col-span-3">
            <button type="submit" disabled={busy} className="inline-flex min-h-[44px] items-center gap-2 rounded-xl bg-moss px-6 font-semibold text-white transition-transform duration-150 hover:scale-[1.01] active:scale-[0.99] disabled:opacity-50">
              {t("createOpen")} <ArrowRight size={16} />
            </button>
          </div>
        </form>
      )}

      <div className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Stat label={t("stats.dossiers")} value={String(products?.length ?? "—")} sub={t("stats.dossiersSub")} Icon={ShieldCheck} tone="bg-parchment text-ink" />
        <Stat label={t("stats.readiness")} value={products ? `${agg.avg}%` : "—"} sub={t("stats.readinessSub")} Icon={BadgeCheck} tone="bg-moss-wash text-moss-deep" />
        <Stat label={t("stats.openActions")} value={products ? String(agg.actions) : "—"} sub={t("stats.openActionsSub")} Icon={TriangleAlert} tone="bg-brick-wash text-brick" />
        <Stat label={t("stats.published")} value={products ? String(agg.published) : "—"} sub={t("stats.publishedSub")} Icon={Rocket} tone="bg-amber-wash text-amber" />
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-[1fr_360px]">
        <section className="animate-rise rounded-xl2 border border-line bg-white/70 shadow-card" style={{ animationDelay: "0.05s" }}>
          <div className="flex items-center border-b border-line px-5 py-4">
            <h2 className="font-display text-lg font-semibold">{t("dossiersTitle")}</h2>
            <span className="ml-2 rounded-full bg-parchment px-2 py-0.5 font-mono text-xs text-muted">{products?.length ?? 0}</span>
          </div>
          <p className="border-b border-line bg-parchment/50 px-5 py-2.5 text-[13px] text-inksoft">
            {t("dossiersHint")}
          </p>
          {products === null && <p className="px-5 py-8 text-sm text-muted">{t("loading")}</p>}
          {products?.length === 0 && (
            <div className="px-5 py-10 text-center">
              <p className="font-display text-xl font-semibold">{t("emptyTitle")}</p>
              <p className="mx-auto mt-2 max-w-sm text-sm text-inksoft">{t("emptyText")}</p>
            </div>
          )}
          <ul className="divide-y divide-line">
            {(products ?? []).map((p) => (
              <li key={p.id}>
                <Link href={`/products/${p.id}`} className="group flex items-center gap-4 px-5 py-4 transition-colors duration-150 hover:bg-parchment/60">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="truncate font-semibold">{p.name}</span>
                      <StateBadge state={overallState(p)} />
                      {p.passport_published && <span className="font-mono text-[11px] uppercase tracking-wider text-moss-deep">{t("live")}</span>}
                    </div>
                    <p className="mt-0.5 font-mono text-xs text-muted">{p.sku} · {p.manufacturer_name}</p>
                    {p.next_action && (
                      <p className="mt-1.5">
                        <span className={clsx("rounded-full px-2.5 py-0.5 text-xs font-semibold", ACTION_TONE[p.next_action.key] ?? "bg-parchment text-inksoft")}>
                          {t("next", { label: p.next_action.label })}
                        </span>
                      </p>
                    )}
                    <div className="mt-2 h-1.5 w-full max-w-xs overflow-hidden rounded-full bg-parchment">
                      <div className="h-full rounded-full bg-moss transition-[width] duration-700 ease-out" style={{ width: `${p.readiness_percent}%` }} />
                    </div>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="font-display text-2xl font-semibold tabular-nums">{p.readiness_percent}<span className="text-sm">%</span></p>
                    <p className="text-xs text-muted tabular-nums">{t("actionsCount", { count: p.actions_required })}</p>
                  </div>
                  <ArrowUpRight size={18} className="shrink-0 text-muted transition-transform duration-200 group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-ink" />
                </Link>
              </li>
            ))}
          </ul>
        </section>

        <div className="space-y-4">
          <section className="animate-rise rounded-xl2 border border-line bg-white/70 p-5 shadow-card" style={{ animationDelay: "0.1s" }}>
            <h2 className="font-display text-lg font-semibold">{t("mixTitle")}</h2>
            <p className="text-[13px] text-inksoft">{t("mixSub")}</p>
            <div className="mt-4"><Donut counts={agg.counts} /></div>
          </section>
          <section className="animate-rise rounded-xl2 border border-ink/15 bg-ink p-5 text-paper shadow-card" style={{ animationDelay: "0.15s" }}>
            <h2 className="font-display text-lg font-semibold">{t("flowTitle")}</h2>
            <ol className="mt-3 space-y-3">
              {STEPS.map((s, i) => (
                <li key={s.key} className="flex gap-3">
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-paper/15"><s.Icon size={16} /></span>
                  <div>
                    <p className="text-sm font-semibold">0{i + 1} · {t(`steps.${s.key}.title`)}</p>
                    <p className="text-[13px] leading-relaxed text-paper/70">{t(`steps.${s.key}.text`)}</p>
                  </div>
                </li>
              ))}
            </ol>
          </section>
        </div>
      </div>
    </>
  );
}
