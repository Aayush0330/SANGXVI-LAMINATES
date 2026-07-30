import type { ReactNode } from "react";
import { WorkspaceAppShell } from "@/components/workspace-app-shell";

export default function AttendanceLayout({
  children,
}: {
  children: ReactNode;
}) {
  return (
    <WorkspaceAppShell routeKind="shared">
      {children}
    </WorkspaceAppShell>
  );
}
