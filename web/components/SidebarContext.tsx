"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { usePathname } from "next/navigation";

interface SidebarContextValue {
  isOpen: boolean;
  isMobile: boolean;
  toggle: () => void;
  open: () => void;
  close: () => void;
}

const SidebarContext = createContext<SidebarContextValue | undefined>(undefined);

const STORAGE_KEY = "traceflow_sidebar_open";
const MOBILE_BREAKPOINT = 1024; // lg breakpoint in Tailwind

export function SidebarProvider({ children }: { children: ReactNode }) {
  const [isOpen, setIsOpen] = useState(true);
  const [isMobile, setIsMobile] = useState(false);
  const [hasMounted, setHasMounted] = useState(false);
  const pathname = usePathname();

  useEffect(() => {
    setHasMounted(true);

    const checkMobile = () => {
      const mobile = window.innerWidth < MOBILE_BREAKPOINT;
      setIsMobile(mobile);
      if (mobile) {
        setIsOpen(false);
      } else {
        const stored = localStorage.getItem(STORAGE_KEY);
        if (stored !== null) {
          setIsOpen(stored === "true");
        } else {
          setIsOpen(true);
        }
      }
    };

    checkMobile();
    window.addEventListener("resize", checkMobile);
    return () => window.removeEventListener("resize", checkMobile);
  }, []);

  // When route changes on mobile, close the drawer automatically
  useEffect(() => {
    if (isMobile) {
      setIsOpen(false);
    }
  }, [pathname, isMobile]);

  // Global keyboard shortcut: Ctrl+B or Cmd+B to toggle, Escape to close on mobile
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.isContentEditable)
      ) {
        return;
      }

      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "b") {
        e.preventDefault();
        setIsOpen((prev) => {
          const next = !prev;
          if (!isMobile) {
            try {
              localStorage.setItem(STORAGE_KEY, String(next));
            } catch {}
          }
          return next;
        });
      } else if (e.key === "Escape" && isOpen && isMobile) {
        setIsOpen(false);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, isMobile]);

  const toggle = useCallback(() => {
    setIsOpen((prev) => {
      const next = !prev;
      if (!isMobile) {
        try {
          localStorage.setItem(STORAGE_KEY, String(next));
        } catch {}
      }
      return next;
    });
  }, [isMobile]);

  const open = useCallback(() => {
    setIsOpen(true);
    if (!isMobile) {
      try {
        localStorage.setItem(STORAGE_KEY, "true");
      } catch {}
    }
  }, [isMobile]);

  const close = useCallback(() => {
    setIsOpen(false);
    if (!isMobile) {
      try {
        localStorage.setItem(STORAGE_KEY, "false");
      } catch {}
    }
  }, [isMobile]);

  return (
    <SidebarContext.Provider
      value={{
        isOpen: hasMounted ? isOpen : true,
        isMobile,
        toggle,
        open,
        close,
      }}
    >
      {children}
    </SidebarContext.Provider>
  );
}

export function useSidebar() {
  const context = useContext(SidebarContext);
  if (!context) {
    throw new Error("useSidebar must be used within a SidebarProvider");
  }
  return context;
}
