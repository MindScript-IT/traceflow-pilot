"use client";
import { useTranslations } from "next-intl";
import { AlertTriangle, CheckCircle2, CircleDashed, FileQuestion } from "lucide-react";
import { clsx } from "clsx";

const MAP: Record<string, { cls: string; Icon: typeof CheckCircle2 }> = {
  verified: { cls: "bg-moss-wash text-moss-deep border-moss/30", Icon: CheckCircle2 },
  proposed: { cls: "bg-amber-wash text-amber border-amber/30", Icon: CircleDashed },
  conflicting: { cls: "bg-brick-wash text-brick border-brick/30", Icon: AlertTriangle },
  missing: { cls: "bg-stone-wash text-muted border-line", Icon: FileQuestion },
};

export function StateBadge({ state, pulse }: { state: string; pulse?: boolean }) {
  const t = useTranslations("console.states");
  const key = state in MAP ? state : "missing";
  const m = MAP[key];
  const { Icon } = m;
  return (
    <span
      className={clsx(
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold tracking-wide",
        m.cls,
      )}
    >
      <Icon size={13} strokeWidth={2.5} className={pulse ? "animate-pulse" : undefined} />
      {t(key)}
    </span>
  );
}
