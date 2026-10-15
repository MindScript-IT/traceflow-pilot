"use client";
import { useState } from "react";
import { MailOpen } from "lucide-react";
import { useTranslations } from "next-intl";
import { useRequest } from "@/components/RequestWorkspace";
import { FIELD_GROUPS, groupReadiness } from "@/lib/groups";

/** Stage 01 — the client request and the checklist it maps to. */
export function StageRequest() {
  const t = useTranslations("console.requests.stageRequest");
  const tGroups = useTranslations("console.requests.groups");
  const { data } = useRequest();
  const { request, dossier } = data;
  const [openOriginal, setOpenOriginal] = useState(false);

  return (
    <div className="space-y-4">
      <section className="animate-rise rounded-xl2 border border-line bg-white/70 p-6 shadow-card">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
          <p className="text-[13px] text-inksoft">
            <strong className="text-ink">{request.requester_name}</strong>
            {request.requester_org ? ` — ${request.requester_org}` : ""}
          </p>
          <p className="ml-auto font-mono text-xs text-muted">
            {t("received", { date: new Date(request.received_at).toLocaleString() })}
          </p>
        </div>
        <blockquote className="mt-3 border-l-2 border-ink/25 pl-4 text-[15px] leading-relaxed">
          {request.message || <em className="text-muted">{t("noMessage")}</em>}
        </blockquote>
        <button
          onClick={() => setOpenOriginal(true)}
          className="mt-3 inline-flex min-h-[36px] items-center gap-2 rounded-lg border border-line px-3 text-[13px] font-semibold text-inksoft transition-colors hover:border-ink hover:text-ink"
        >
          <MailOpen size={14} /> {t("openOriginal")}
        </button>
      </section>

      <section className="animate-rise rounded-xl2 border border-line bg-white/70 p-6 shadow-card" style={{ animationDelay: "0.05s" }}>
        <h2 className="font-display text-lg font-semibold">{t("mappingTitle")}</h2>
        <p className="mt-1 text-[13px] text-inksoft">
          {t("mappingSubtitle", { total: dossier.total_required })}
        </p>
        <div className="mt-4 space-y-4">
          {FIELD_GROUPS.map((g, gi) => {
            const r = groupReadiness(dossier.fields, g);
            const fields = dossier.fields.filter((f: any) => f.required && g.fields.includes(f.field_key));
            return (
              <div key={g.key}>
                <div className="flex items-baseline gap-3">
                  <span className="font-mono text-xs text-muted">0{gi + 1}</span>
                  <h3 className="font-display text-[17px] font-semibold">{tGroups(g.key)}</h3>
                  <span className="text-xs text-muted">{g.hint}</span>
                  <span className="ml-auto font-mono text-xs tabular-nums text-muted">{t("verified", { verified: r.verified, total: r.total })}</span>
                </div>
                <ul className="mt-2 divide-y divide-dashed divide-line border-t border-dashed border-line">
                  {fields.map((f: any) => (
                    <li key={f.field_key} className="flex items-center gap-3 py-2 text-sm">
                      <span className="font-medium">{f.label}</span>
                      <span className="ml-auto font-mono text-xs text-muted">{f.state.replace("_", " ")}</span>
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
        </div>
      </section>

      {openOriginal && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-ink/50 p-6" onClick={() => setOpenOriginal(false)}>
          <div className="w-full max-w-lg rounded-xl2 bg-paper p-6 shadow-pop" onClick={(e) => e.stopPropagation()}>
            <p className="font-mono text-xs text-muted">{t("originalMessage")}</p>
            <p className="mt-1 text-sm font-semibold">{request.subject}</p>
            <p className="mt-1 text-sm text-inksoft">{t("from", { name: `${request.requester_name}${request.requester_org ? `, ${request.requester_org}` : ""}` })}</p>
            <p className="mt-3 whitespace-pre-wrap text-[15px] leading-relaxed">{request.message}</p>
            <button onClick={() => setOpenOriginal(false)}
              className="mt-5 min-h-[40px] rounded-lg bg-ink px-5 text-sm font-semibold text-paper">{t("close")}</button>
          </div>
        </div>
      )}
    </div>
  );
}
