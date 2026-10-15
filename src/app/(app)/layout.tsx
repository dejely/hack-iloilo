import { Suspense } from "react";
import { AppSidebar } from "@/components/app-sidebar";
import {
  SidebarInset,
  SidebarProvider,
  SidebarTrigger,
} from "@/components/ui/sidebar";
import { Skeleton } from "@/components/ui/skeleton";
import { requireRole } from "@/modules/accounts/auth";

async function StaffShell({ children }: { children: React.ReactNode }) {
  const staff = await requireRole();

  return (
    <SidebarProvider>
      <AppSidebar staff={staff} />
      {/* min-w-0 lets wide tables scroll in place instead of widening the page. */}
      <SidebarInset className="min-w-0">
        <header className="flex h-12 items-center gap-2 border-b px-4">
          <SidebarTrigger />
        </header>
        <div className="flex flex-1 flex-col gap-4 p-4">{children}</div>
      </SidebarInset>
    </SidebarProvider>
  );
}

export default function AppLayout({ children }: LayoutProps<"/">) {
  return (
    <Suspense fallback={<Skeleton className="m-4 h-96" />}>
      <StaffShell>{children}</StaffShell>
    </Suspense>
  );
}
