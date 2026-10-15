"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { Bell } from "lucide-react";
import { useTranslations } from "next-intl";
import { apiNotifications } from "@/lib/api";

export function NotificationsBell() {
  const t = useTranslations("console");
  const [unread, setUnread] = useState<number | null>(null);

  useEffect(() => {
    let alive = true;
    const load = () =>
      apiNotifications(true, 1)
        .then((d) => {
          if (alive) setUnread(d.unread_count);
        })
        .catch(() => {});
    load();
    const t = setInterval(load, 30_000);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, []);

  return (
    <Link
      href="/notifications"
      aria-label={t("nav.notifications")}
      className="relative flex min-h-[44px] items-center gap-3 rounded-lg px-3 text-sm font-medium text-paper/70 transition-colors duration-150 hover:bg-paper/10 hover:text-paper"
    >
      <Bell size={17} strokeWidth={2.2} />
      {t("nav.notifications")}
      {unread !== null && unread > 0 && (
        <span className="ml-auto rounded-full bg-amber px-2 py-0.5 text-[11px] font-bold tabular-nums text-ink">
          {unread}
        </span>
      )}
    </Link>
  );
}
