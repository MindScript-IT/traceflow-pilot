"use client";
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { BellRing, CheckCheck, Plus } from "lucide-react";
import { clsx } from "clsx";
import { apiIntake, apiMarkRead, apiNotifications, apiReadAll } from "@/lib/api";
import { useLocale, useTranslations } from "next-intl";

type Notif = {
  id: string; type: string; title: string; body: string | null;
  entity_type: string | null; entity_id: string | null;
  read_at: string | null; created_at: string | null;
};

export default function NotificationsPage() {
  const t = useTranslations("console.notifications");
  const locale = useLocale();

  const [items, setItems] = useState<Notif[] | null>(null);
  const [unreadCount, setUnreadCount] = useState(0);
  const [error, setError] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ subject: "", from_email: "", body_text: "" });
  const [busy, setBusy] = useState(false);
  const [created, setCreated] = useState<{ request_id: string; items_count: number } | null>(null);

  const reload = useCallback(() =>
    apiNotifications(false, 100)
      .then((d) => {
        setItems(d.items);
        setUnreadCount(d.unread_count);
      })
      .catch((e) => setError(e instanceof Error ? e.message : String(e))),
    []);

  useEffect(() => {
    reload();
  }, [reload]);

  async function markRead(id: string) {
    try {
      await apiMarkRead(id);
      await reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : t("markReadFailed"));
    }
  }

  async function readAll() {
    try {
      await apiReadAll();
      await reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : t("readAllFailed"));
    }
  }

  async function submitIntake(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setCreated(null);
    setBusy(true);
    try {
      const out = await apiIntake(form.subject, form.body_text, form.from_email || undefined);
      setCreated(out);
      setForm({ subject: "", from_email: "", body_text: "" });
      await reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : t("intakeFailed"));
    } finally {
      setBusy(false);
    }
  }

  const formatType = (type: string) => {
    if (type === "request.received") return t("types.requestReceived");
    return type;
  };

  const inputCls =
    "mt-2 min-h-[44px] w-full rounded-lg border border-line bg-paper px-3.5 text-[15px] outline-none transition-shadow duration-150 placeholder:text-muted/70 focus:border-ink focus:ring-2 focus:ring-ink/15";

  return (
    <>
      <div className="flex flex-wrap items-end gap-4">
        <div>
          <p className="font-mono text-xs uppercase tracking-[0.14em] text-muted">{t("inboxBadge")}</p>
          <h1 className="mt-1 font-display text-4xl font-semibold tracking-tight">{t("title")}</h1>
        </div>
        <div className="ml-auto flex gap-2">
          <button
            onClick={() => setShowForm((v) => !v)}
            className="inline-flex min-h-[44px] items-center gap-2 rounded-xl bg-ink px-5 font-semibold text-paper transition-transform duration-150 hover:scale-[1.02] active:scale-[0.98]"
          >
            <Plus size={17} /> {t("newIntake")}
          </button>
          {unreadCount > 0 && (
            <button
              onClick={() => void readAll()}
              className="inline-flex min-h-[44px] items-center gap-2 rounded-xl border border-line bg-white/70 px-5 font-semibold transition-colors hover:bg-parchment/60"
            >
              <CheckCheck size={17} /> {t("markAllRead")}
            </button>
          )}
        </div>
      </div>
      {error && <p className="mt-4 rounded-xl border border-brick/30 bg-brick-wash p-3.5 text-sm font-medium text-brick">{error}</p>}

      {showForm && (
        <form onSubmit={submitIntake} className="animate-rise mt-5 grid gap-4 rounded-xl2 border border-line bg-white/70 p-6 shadow-card md:grid-cols-2">
          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-muted md:col-span-2">
            {t("formSubtitle")}
          </p>
          <div>
            <label className="text-xs font-semibold uppercase tracking-[0.12em] text-muted" htmlFor="ni-subject">{t("subject")}</label>
            <input id="ni-subject" required placeholder={t("subjectPlaceholder")} value={form.subject}
              onChange={(e) => setForm({ ...form, subject: e.target.value })} className={inputCls} />
          </div>
          <div>
            <label className="text-xs font-semibold uppercase tracking-[0.12em] text-muted" htmlFor="ni-from">{t("from")}</label>
            <input id="ni-from" placeholder={t("fromPlaceholder")} value={form.from_email}
              onChange={(e) => setForm({ ...form, from_email: e.target.value })} className={inputCls} />
          </div>
          <div className="md:col-span-2">
            <label className="text-xs font-semibold uppercase tracking-[0.12em] text-muted" htmlFor="ni-body">{t("body")}</label>
            <textarea id="ni-body" required rows={5} placeholder={t("bodyPlaceholder")} value={form.body_text}
              onChange={(e) => setForm({ ...form, body_text: e.target.value })}
              className="mt-2 w-full rounded-lg border border-line bg-paper px-3.5 py-3 text-[15px] outline-none transition-shadow duration-150 placeholder:text-muted/70 focus:border-ink focus:ring-2 focus:ring-ink/15" />
          </div>
          <div className="md:col-span-2">
            <button type="submit" disabled={busy} className="inline-flex min-h-[44px] items-center rounded-xl bg-moss px-6 font-semibold text-white transition-transform duration-150 hover:scale-[1.01] active:scale-[0.99] disabled:opacity-50">
              {busy ? t("extracting") : t("createIntake")}
            </button>
            {created && (
              <p className="mt-3 text-sm font-medium text-moss-deep">
                {t("intakeCreated", { count: created.items_count })}{" "}
                <Link href={`/requests/${created.request_id}/request`} className="underline">
                  {t("openRequest")}
                </Link>
              </p>
            )}
          </div>
        </form>
      )}

      <div className="mt-6 overflow-hidden rounded-xl2 border border-line bg-white/70 shadow-card">
        <ul className="divide-y divide-line">
          {(items ?? []).map((n) => (
            <li
              key={n.id}
              className={clsx("flex items-start gap-4 px-5 py-4", !n.read_at && "bg-amber-wash/40")}
            >
              <BellRing size={18} className={clsx("mt-1 shrink-0", n.read_at ? "text-muted" : "text-amber")} />
              <div className="min-w-0 flex-1">
                <p className={clsx(!n.read_at && "font-semibold")}>{n.title}</p>
                {n.body && <p className="mt-1 line-clamp-2 text-[13px] text-inksoft">{n.body}</p>}
                <p className="mt-1 flex flex-wrap items-center gap-x-2 font-mono text-xs text-muted">
                  {n.created_at ? <span>{new Date(n.created_at).toLocaleString(locale === "it" ? "it-IT" : "en-US")}</span> : null}
                  <span>·</span>
                  <span>{formatType(n.type)}</span>
                  {n.entity_id && (
                    <>
                      <span>·</span>
                      <Link href={`/requests/${n.entity_id}/request`} className="underline hover:text-ink">
                        {t("openRequest")}
                      </Link>
                    </>
                  )}
                </p>
              </div>
              {!n.read_at && (
                <button
                  onClick={() => void markRead(n.id)}
                  className="inline-flex min-h-[40px] shrink-0 items-center rounded-lg border border-line px-3 text-sm font-semibold transition-colors hover:bg-parchment/60"
                >
                  {t("markRead")}
                </button>
              )}
            </li>
          ))}
        </ul>
        {items?.length === 0 && <p className="px-5 py-8 text-center text-sm text-muted">{t("empty")}</p>}
        {items === null && !error && <p className="px-5 py-8 text-center text-sm text-muted">{t("loading")}</p>}
      </div>
    </>
  );
}
