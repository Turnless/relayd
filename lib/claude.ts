import Anthropic from "@anthropic-ai/sdk";

/**
 * Shared Claude client. Organisation-level keys that are not scoped to a
 * workspace must name one on every request; set ANTHROPIC_WORKSPACE_ID for that.
 */
export function claude() {
  const workspace = process.env.ANTHROPIC_WORKSPACE_ID?.trim();
  return new Anthropic(workspace ? { defaultHeaders: { "anthropic-workspace-id": workspace } } : {});
}
