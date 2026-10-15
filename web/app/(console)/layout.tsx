import { SidebarProvider } from "@/components/SidebarContext";
import { ConsoleShell } from "@/components/ConsoleShell";

export default function ConsoleLayout({ children }: { children: React.ReactNode }) {
  return (
    <SidebarProvider>
      <ConsoleShell>{children}</ConsoleShell>
    </SidebarProvider>
  );
}