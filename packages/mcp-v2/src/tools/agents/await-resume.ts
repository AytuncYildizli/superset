import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { defineTool } from "../../define-tool";
import { hostServiceCall } from "../../host-service-client";

export function register(server: McpServer): void {
	defineTool(server, {
		name: "agents_await_resume",
		annotations: { readOnlyHint: true },
		description: `Wait server-side for evidence that an agents_resume actually restored the prior conversation. Call it exactly once with the terminalId, workspaceId, and fidelity returned by agents_resume. The host polls internally, so Voice needs no polling loop.

Only phase="restored" with verified=true is positive proof. Every other phase is unverified and must be spoken as such:

- restored_last: a session opened, but via the runtime's "most recent" form, so it may not be the one the user meant.
- started_empty: the agent came up with NO prior context. The process is healthy and the screen changed, so every surface-level signal looks like success — it is not. Say the history did not load.
- restore_failed: the runtime reported it could not resume.
- unknown_timeout: no usable evidence. Do not guess.

Speak the returned "speak" string verbatim or more conservatively. A changed screen, a running process, or new output never prove a restore on their own.`,
		inputSchema: {
			hostId: z.string().min(1),
			workspaceId: z.string().min(1),
			terminalId: z.string().min(1),
			fidelity: z.enum(["exact", "last"]),
			timeoutMs: z.number().int().min(250).max(30_000).default(8_000),
		},
		handler: async (input, ctx) =>
			hostServiceCall(
				{
					relayUrl: ctx.relayUrl,
					organizationId: ctx.organizationId,
					hostId: input.hostId,
					jwt: ctx.bearerToken,
				},
				"terminalAgents.awaitResume",
				"query",
				{
					terminalId: input.terminalId,
					workspaceId: input.workspaceId,
					fidelity: input.fidelity,
					timeoutMs: input.timeoutMs,
				},
			),
	});
}
