export const WORKSPACE_OVERLAY_OPEN_EVENT = "sanghvi:workspace-overlay-open";

export type WorkspaceOverlayOpenDetail = {
  id: string;
};

export function announceWorkspaceOverlay(id: string) {
  window.dispatchEvent(
    new CustomEvent<WorkspaceOverlayOpenDetail>(
      WORKSPACE_OVERLAY_OPEN_EVENT,
      { detail: { id } },
    ),
  );
}
