/**
 * Future: plug Resend / SES / Postmark here. URL is absolute when `baseUrl` is set.
 */
export type WorkspaceInviteEmailPayload = {
  to: string;
  workspaceName: string;
  inviteUrl: string;
  role: string;
};

export async function sendWorkspaceInviteEmail(_payload: WorkspaceInviteEmailPayload): Promise<void> {
  // Intentionally no-op for local / MVP — token + link returned in API response and UI.
}
