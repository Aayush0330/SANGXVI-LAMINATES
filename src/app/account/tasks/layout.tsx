import type { ReactNode } from "react";
import { WorkspaceAppShell } from "@/components/workspace-app-shell";

export default function TasksLayout({ children }: { children: ReactNode }) {
  return (
    <WorkspaceAppShell routeKind="shared">
      {children}
    </WorkspaceAppShell>
  );
}
