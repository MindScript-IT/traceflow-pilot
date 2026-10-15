"use client";
import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { apiAuthed } from "@/lib/api";

type DocItem = {
  id: string;
  label: string;
  value: string;
  unit: string | null;
  location: string | null;
};

/** Full transcribed values for one document (Track A). Passport mapping untouched. */
export function DocumentItems({ documentId }: { documentId: string }) {
  const t = useTranslations("console.docItems");
  const [items, setItems] = useState<DocItem[] | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let live = true;
    setItems(null);
    setError("");
    apiAuthed(`/api/documents/${documentId}/items`)
      .then((d) => {
        if (live) setItems(d.items ?? []);
      })
      .catch((err) => {
        if (live) setError(err instanceof Error ? err.message : t("loadFailed"));
      });
    return () => {
      live = false;
    };
  }, [documentId]);

  if (error) return <p className="mt-2 text-[13px] font-medium text-brick">{error}</p>;
  if (items === null) return <p className="mt-2 text-[13px] italic text-muted">{t("loading")}</p>;
  if (items.length === 0)
    return <p className="mt-2 text-[13px] italic text-muted">{t("empty")}</p>;

  return (
    <div className="mt-2 overflow-x-auto">
      <table className="w-full text-left text-[13px]">
        <thead>
          <tr className="font-mono text-[11px] uppercase tracking-wide text-muted">
            <th className="py-1.5 pr-3 font-semibold">{t("label")}</th>
            <th className="py-1.5 pr-3 font-semibold">{t("value")}</th>
            <th className="py-1.5 pr-3 font-semibold">{t("unit")}</th>
            <th className="py-1.5 font-semibold">{t("location")}</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-dashed divide-line">
          {items.map((it) => (
            <tr key={it.id}>
              <td className="py-1.5 pr-3 font-medium">{it.label}</td>
              <td className="py-1.5 pr-3">{it.value}</td>
              <td className="py-1.5 pr-3 font-mono text-xs text-muted">{it.unit ?? "—"}</td>
              <td className="py-1.5 font-mono text-xs text-muted">{it.location ?? "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
