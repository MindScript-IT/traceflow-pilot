"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowUpRight, Inbox, Plus } from "lucide-react";
import { clsx } from "clsx";
import { useTranslations } from "next-intl";
import { apiAuthed } from "@/lib/api";
import { StateBadge } from "@/components/StateBadge";

type Req = {
  id: string; product_id: string; product_name: string; product_sku: string;
  requester_name: string; requester_org: string | null; subject: string;
  status: string; received_at: string; readiness_percent: number; actions_required: number;
};

export default function RequestsPage() {
  const t = useTranslations("console.requests");
  const [items, setItems] = useState<Req[] | null>(null);
  const [products, setProducts] = useState<any[]>([]);
  const [error, setError] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ product_id: "", requester_name: "", requester_org: "", subject: "", message: "" });
  const [mode, setMode] = useState<"existing" | "new">("existing");
  const [np, setNp] = useState({ sku: "", name: "", manufacturer_name: "" });
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    apiAuthed("/api/requests").then(setItems).catch((e) => setError(e.message));
    apiAuthed("/api/products").then(setProducts).catch(() => {});
  }, []);

  async function create(e: React.FormEvent) {
    e.preventDefault();
    setError(""); setBusy(true);
    try {
      // One intake: the client's email opens the dossier AND the request together.
      const payload: any = {
        requester_name: form.requester_name, requester_org: form.requester_org,
        subject: form.subject, message: form.message,
      };
      if (mode === "existing") payload.product_id = form.product_id;
      else payload.new_product = { ...np, category: "footwear" };
      const out = await apiAuthed("/api/requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      window.location.href = `/requests/${out.id}/request`;
    } catch (err) {
      setError(err instanceof Error ? err.message : t("createFailed"));
      setBusy(false);
    }
  }

  const inputCls =
    "mt-2 min-h-[44px] w-full rounded-lg border border-line bg-paper px-3.5 text-[15px] outline-none transition-shadow duration-150 placeholder:text-muted/70 focus:border-ink focus:ring-2 focus:ring-ink/15";

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
          <Plus size={17} /> {t("newRequest")}
        </button>
      </div>
      {error && <p className="mt-4 rounded-xl border border-brick/30 bg-brick-wash p-3.5 text-sm font-medium text-brick">{error}</p>}

      {showForm && (
        <form onSubmit={create} className="animate-rise mt-5 grid gap-4 rounded-xl2 border border-line bg-white/70 p-6 shadow-card md:grid-cols-2">
          <div className="md:col-span-2">
            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-muted">{t("intakeBanner")}</p>
            <div className="mt-2 grid grid-cols-2 gap-1 rounded-xl bg-parchment p-1">
              <button type="button" onClick={() => setMode("new")}
                className={clsx("min-h-[40px] rounded-lg text-sm font-semibold transition-colors", mode === "new" ? "bg-ink text-paper shadow-card" : "text-inksoft hover:text-ink")}>
                {t("modeNew")}
              </button>
              <button type="button" onClick={() => setMode("existing")}
                className={clsx("min-h-[40px] rounded-lg text-sm font-semibold transition-colors", mode === "existing" ? "bg-ink text-paper shadow-card" : "text-inksoft hover:text-ink")}>
                {t("modeExisting")}
              </button>
            </div>
          </div>
          {mode === "existing" ? (
          <div>
            <label className="text-xs font-semibold uppercase tracking-[0.12em] text-muted" htmlFor="product">{t("productDossier")}</label>
            <select id="product" required={mode === "existing"} value={form.product_id} onChange={(e) => setForm({ ...form, product_id: e.target.value })}
              className="mt-2 min-h-[44px] w-full rounded-lg border border-line bg-paper px-3 text-[15px] outline-none focus:border-ink">
              <option value="">{t("selectProduct")}</option>
              {products.map((p) => <option key={p.id} value={p.id}>{p.name} · {p.sku}</option>)}
            </select>
          </div>
          ) : (
          <>
            <div>
              <label className="text-xs font-semibold uppercase tracking-[0.12em] text-muted" htmlFor="np-name">{t("productName")}</label>
              <input id="np-name" required={mode === "new"} placeholder="AeroStep Runner" value={np.name}
                onChange={(e) => setNp({ ...np, name: e.target.value })} className={inputCls} />
            </div>
            <div>
              <label className="text-xs font-semibold uppercase tracking-[0.12em] text-muted" htmlFor="np-sku">{t("sku")}</label>
              <input id="np-sku" required={mode === "new"} placeholder="S-042" value={np.sku}
                onChange={(e) => setNp({ ...np, sku: e.target.value })} className={inputCls} />
            </div>
            <div className="md:col-span-2">
              <label className="text-xs font-semibold uppercase tracking-[0.12em] text-muted" htmlFor="np-mfr">{t("manufacturer")}</label>
              <input id="np-mfr" required={mode === "new"} placeholder="Nova Footwear" value={np.manufacturer_name}
                onChange={(e) => setNp({ ...np, manufacturer_name: e.target.value })} className={inputCls} />
            </div>
          </>
          )}
          <div>
            <label className="text-xs font-semibold uppercase tracking-[0.12em] text-muted" htmlFor="subject">{t("subject")}</label>
            <input id="subject" required placeholder="Product information request — AeroStep Runner" value={form.subject}
              onChange={(e) => setForm({ ...form, subject: e.target.value })} className={inputCls} />
          </div>
          <div>
            <label className="text-xs font-semibold uppercase tracking-[0.12em] text-muted" htmlFor="rname">{t("requesterName")}</label>
            <input id="rname" required placeholder="Giulia Ferrari" value={form.requester_name}
              onChange={(e) => setForm({ ...form, requester_name: e.target.value })} className={inputCls} />
          </div>
          <div>
            <label className="text-xs font-semibold uppercase tracking-[0.12em] text-muted" htmlFor="rorg">{t("requesterOrg")}</label>
            <input id="rorg" placeholder="Meridian Sport Retail" value={form.requester_org}
              onChange={(e) => setForm({ ...form, requester_org: e.target.value })} className={inputCls} />
          </div>
          <div className="md:col-span-2">
            <label className="text-xs font-semibold uppercase tracking-[0.12em] text-muted" htmlFor="msg">{t("originalMessage")}</label>
            <textarea id="msg" rows={3} placeholder={t("messagePlaceholder")} value={form.message}
              onChange={(e) => setForm({ ...form, message: e.target.value })}
              className="mt-2 w-full rounded-lg border border-line bg-paper px-3.5 py-3 text-[15px] outline-none transition-shadow duration-150 placeholder:text-muted/70 focus:border-ink focus:ring-2 focus:ring-ink/15" />
          </div>
          <div className="md:col-span-2">
            <button type="submit" disabled={busy} className="inline-flex min-h-[44px] items-center rounded-xl bg-moss px-6 font-semibold text-white transition-transform duration-150 hover:scale-[1.01] active:scale-[0.99] disabled:opacity-50">
              {busy ? t("creating") : t("openRequest")}
            </button>
          </div>
        </form>
      )}

      <div className="mt-6 overflow-hidden rounded-xl2 border border-line bg-white/70 shadow-card">
        <ul className="divide-y divide-line">
          {(items ?? []).map((r) => (
            <li key={r.id}>
              <Link href={`/requests/${r.id}/request`} className="group flex items-center gap-4 px-5 py-4 transition-colors duration-150 hover:bg-parchment/60">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="truncate font-semibold">{r.subject}</span>
                    <StateBadge state={r.status === "responded" ? "verified" : r.actions_required > 0 ? "proposed" : "verified"} />
                  </div>
                  <p className="mt-0.5 text-[13px] text-inksoft">
                    {r.requester_name}{r.requester_org ? ` · ${r.requester_org}` : ""} → {r.product_name} ({r.product_sku})
                  </p>
                </div>
                <div className="shrink-0 text-right">
                  <p className="font-display text-2xl font-semibold tabular-nums">{r.readiness_percent}<span className="text-sm">%</span></p>
                  <p className="text-xs text-muted tabular-nums">{t("actionsCount", { count: r.actions_required })}</p>
                </div>
              </Link>
            </li>
          ))}
        </ul>
        {items?.length === 0 && (
          <div className="px-5 py-10 text-center">
            <Inbox size={26} className="mx-auto text-muted" />
            <p className="mt-3 font-display text-xl font-semibold">{t("noRequestsTitle")}</p>
            <p className="mx-auto mt-1 max-w-sm text-sm text-inksoft">{t("noRequestsText")}</p>
          </div>
        )}
        {items === null && !error && <p className="px-5 py-8 text-sm text-muted">{t("loading")}</p>}
      </div>
    </>
  );
}
