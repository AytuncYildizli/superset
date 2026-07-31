import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { defineTool } from "../../define-tool";
import { hostServiceCall } from "../../host-service-client";

export function register(server: McpServer): void {
	defineTool(server, {
		name: "agents_list_resumable",
		annotations: { readOnlyHint: true },
		description: `List agents in a workspace that have already exited and may be restarted with their prior conversation context.

These are dead sessions, not live ones — use agents_list / terminals_list for live agents. Each row carries a tombstoneId (pass it to agents_resume), the runtime, a label, a redacted launch command, when it exited, and two fields that bound what a resume may claim:

- resumable=false means this one cannot be restored at all (for example a plain shell); do not offer it.
- fidelity="exact" means the recorded session id will be used.
- fidelity="last" means the runtime can only be asked for its most recent session, which may not be the one the user meant. Never promise an exact restore for "last"; say you are opening the most recent session.

Rows are newest-exit first. This tool launches nothing.`,
		inputSchema: {
			hostId: z.string().min(1),
			workspaceId: z.string().min(1),
		},
		handler: async (input, ctx) =>
			hostServiceCall(
				{
					relayUrl: ctx.relayUrl,
					organizationId: ctx.organizationId,
					hostId: input.hostId,
					jwt: ctx.bearerToken,
				},
				"terminalAgents.listResumable",
				"query",
				{ workspaceId: input.workspaceId },
			),
	});
}
