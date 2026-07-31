import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { defineTool } from "../../define-tool";
import { hostServiceCall } from "../../host-service-client";

export function register(server: McpServer): void {
	defineTool(server, {
		name: "agents_resume",
		description: `Restart an agent that has exited, resuming its prior conversation context. Takes a tombstoneId from agents_list_resumable.

This replaces a session and can discard in-memory state, so treat it like a destructive action: name the workspace, the agent, and the action in one sentence and get explicit confirmation before calling. Never infer it from an incomplete utterance.

The returned phase is always "launched". That proves a process started and nothing more — it is NOT proof the conversation was restored. Immediately follow with agents_await_resume exactly once, using the returned terminalId, workspaceId, and fidelity, and speak that result instead of this one. Do not build your own polling loop.

Fails with NOT_FOUND if the tombstone expired (they are retained for a bounded window) and PRECONDITION_FAILED if that runtime cannot be resumed.`,
		inputSchema: {
			hostId: z.string().min(1),
			tombstoneId: z.string().min(1),
			cwd: z.string().min(1).optional(),
		},
		handler: async (input, ctx) =>
			hostServiceCall(
				{
					relayUrl: ctx.relayUrl,
					organizationId: ctx.organizationId,
					hostId: input.hostId,
					jwt: ctx.bearerToken,
				},
				"terminalAgents.resume",
				"mutation",
				{
					tombstoneId: input.tombstoneId,
					...(input.cwd ? { cwd: input.cwd } : {}),
				},
			),
	});
}
