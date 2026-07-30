import type { ReactNode } from "react";
import { WorkspaceAppShell } from "@/components/workspace-app-shell";

export default function InternalLayout({
  children,
}: {
  children: ReactNode;
}) {
  return (
    <WorkspaceAppShell routeKind="internal">
      {children}
    </WorkspaceAppShell>
  );
}
