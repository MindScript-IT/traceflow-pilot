"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  Bell, Bot, Fingerprint, Inbox, LayoutDashboard, LogOut, Mailbox, PanelLeftClose, ScrollText, Truck, UserRound,
} from "lucide-react";
import { clsx } from "clsx";
import { apiAuthed } from "@/lib/api";
import { createClient } from "@/utils/supabase/client";
import { useTranslations } from "next-intl";
import { NotificationsBell } from "@/components/NotificationsBell";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";
import { useSidebar } from "@/components/SidebarContext";

const SECTIONS: { key: string; items: { href: string; key: string; Icon: typeof Inbox; badge?: string }[] }[] = [
  {
    key: "overview",
    items: [
      { href: "/products", key: "dashboard", Icon: LayoutDashboard },
      { href: "/requests", key: "requests", Icon: Mailbox },
      { href: "/review", key: "review", Icon: Inbox, badge: "queue" },
      { href: "/notifications", key: "notifications", Icon: Bell },
      { href: "/ask", key: "ask", Icon: Bot },
    ],
  },
  {
    key: "evidence",
    items: [{ href: "/suppliers", key: "suppliers", Icon: Truck }],
  },
  {
    key: "system",
    items: [
      { href: "/activity", key: "activity", Icon: ScrollText },
      { href: "/account", key: "account", Icon: UserRound },
    ],
  },
];

export function Sidebar() {
  const t = useTranslations("console");
  const path = usePathname();
  const router = useRouter();
  const [queue, setQueue] = useState<number | null>(null);
  const [email, setEmail] = useState("");
  const { isOpen, close } = useSidebar();

  useEffect(() => {
    apiAuthed("/api/review-queue").then((d) => setQueue(d.count)).catch(() => { });
    createClient().auth.getUser().then(({ data }: { data: { user: { email?: string } | null } }) => setEmail(data.user?.email ?? ""));
  }, [path]);

  async function signOut() {
    await createClient().auth.signOut();
    router.push("/login");
  }

  const isActive = (href: string) => {
    if (href === "/products") return path === "/products";
    if (href === "/requests") return path.startsWith("/requests");
    return path.startsWith(href);
  };

  return (
    <aside
      aria-label="Sidebar navigation"
      className={clsx(
        "fixed inset-y-0 left-0 z-40 flex w-64 flex-col bg-ink text-paper shadow-pop transition-transform duration-300 ease-in-out",
        isOpen ? "translate-x-0" : "-translate-x-full",
      )}
    >
      <div className="flex items-center justify-between px-5 pt-6">
        <div className="flex items-center gap-3">
          <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-paper text-ink">
            <Fingerprint size={18} />
          </span>
          <div>
            <p className="font-display text-[17px] font-semibold leading-none tracking-tight">TraceFlow</p>
            <p className="mt-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-paper/50">{t("pilotConsole")}</p>
          </div>
        </div>
        <button
          type="button"
          onClick={close}
          aria-label={t("nav.closeSidebar")}
          title={`${t("nav.closeSidebar")} (Ctrl+B)`}
          className="flex h-8 w-8 items-center justify-center rounded-lg text-paper/60 transition-colors hover:bg-paper/10 hover:text-paper active:scale-95"
        >
          <PanelLeftClose size={18} />
        </button>
      </div>

      <nav className="mt-8 flex-1 space-y-6 overflow-y-auto px-3">
        {SECTIONS.map((s) => (
          <div key={s.key}>
            <p className="px-3 text-[10px] font-semibold uppercase tracking-[0.18em] text-paper/40">{t(`nav.${s.key}`)}</p>
            <ul className="mt-2 space-y-1">
              {s.items.map((it) => (
                <li key={it.href}>
                  {it.href === "/notifications" ? (
                    <NotificationsBell />
                  ) : (
                    <Link
                      href={it.href}
                      className={clsx(
                        "flex min-h-[44px] items-center gap-3 rounded-lg px-3 text-sm font-medium transition-colors duration-150",
                        isActive(it.href) ? "bg-paper text-ink" : "text-paper/70 hover:bg-paper/10 hover:text-paper",
                      )}
                    >
                      <it.Icon size={17} strokeWidth={2.2} />
                      {t(`nav.${it.key}`)}
                      {it.badge === "queue" && queue !== null && queue > 0 && (
                        <span className="ml-auto rounded-full bg-amber px-2 py-0.5 text-[11px] font-bold tabular-nums text-ink">
                          {queue}
                        </span>
                      )}
                    </Link>
                  )}
                </li>
              ))}
            </ul>
          </div>
        ))}
      </nav>

      <div className="border-t border-paper/15 p-4">
        <LanguageSwitcher variant="dark" />
        <p className="mt-3 truncate px-1 text-xs text-paper/60">{email}</p>
        <button
          onClick={() => void signOut()}
          className="mt-2 flex min-h-[40px] w-full items-center gap-2.5 rounded-lg px-3 text-sm text-paper/70 transition-colors duration-150 hover:bg-paper/10 hover:text-paper"
        >
          <LogOut size={16} /> {t("nav.signOut")}
        </button>
      </div>
    </aside>
  );
}
