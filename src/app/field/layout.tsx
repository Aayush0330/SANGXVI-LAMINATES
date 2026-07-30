import type { ReactNode } from "react";
import { WorkspaceAppShell } from "@/components/workspace-app-shell";

export default function FieldLayout({
  children,
}: {
  children: ReactNode;
}) {
  return (
    <WorkspaceAppShell routeKind="field">
      {children}
    </WorkspaceAppShell>
  );
}
