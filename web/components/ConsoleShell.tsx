"use client";

import { useTranslations } from "next-intl";
import { PanelLeftOpen } from "lucide-react";
import { clsx } from "clsx";
import { Sidebar } from "@/components/Sidebar";
import { useSidebar } from "@/components/SidebarContext";

export function ConsoleShell({ children }: { children: React.ReactNode }) {
  const { isOpen, toggle, close, isMobile } = useSidebar();
  const t = useTranslations("console");

  return (
    <div className="relative min-h-screen bg-paper">
      {/* Mobile Backdrop */}
      {isMobile && isOpen && (
        <div
          role="button"
          tabIndex={0}
          aria-label={t("nav.closeSidebar")}
          onClick={close}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") close();
          }}
          className="fixed inset-0 z-30 bg-ink/50 backdrop-blur-xs transition-opacity duration-300 animate-fade-in"
        />
      )}

      {/* Sidebar navigation */}
      <Sidebar />

      {/* Floating open trigger button when sidebar is closed */}
      {!isOpen && (
        <button
          type="button"
          onClick={toggle}
          aria-label={t("nav.openSidebar")}
          title={`${t("nav.openSidebar")} (Ctrl+B)`}
          className="fixed top-4 left-4 z-30 flex h-9 items-center gap-2 rounded-xl bg-ink px-3 py-1.5 text-paper shadow-pop border border-paper/15 transition-all duration-200 hover:bg-inksoft hover:scale-105 active:scale-95 group animate-fade-in focus:outline-none focus:ring-2 focus:ring-ink/20"
        >
          <PanelLeftOpen size={17} className="text-paper transition-transform group-hover:scale-110" />
          <span className="text-xs font-semibold tracking-tight pr-0.5">{t("nav.openSidebar")}</span>
          <kbd className="hidden sm:inline-block rounded border border-paper/20 px-1 text-[10px] font-mono text-paper/60">
            Ctrl+B
          </kbd>
        </button>
      )}

      {/* Main content wrapper */}
      <div
        className={clsx(
          "min-h-screen transition-[padding] duration-300 ease-in-out",
          isOpen ? "lg:pl-64" : "pl-0 pt-10 sm:pt-12",
        )}
      >
        <div className="mx-auto max-w-6xl px-8 py-8">{children}</div>
      </div>
    </div>
  );
}
