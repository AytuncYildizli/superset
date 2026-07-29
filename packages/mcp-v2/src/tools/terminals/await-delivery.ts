import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { defineTool } from "../../define-tool";
import { hostServiceCall } from "../../host-service-client";

export function register(server: McpServer): void {
	defineTool(server, {
		name: "terminals_await_delivery",
		annotations: { readOnlyHint: true },
		description: `Wait server-side for evidence that a terminals_send delivery was processed.

Use the exact deliveryId, hostId, workspaceId, and terminalId returned/bound by terminals_send. The host polls its lifecycle hooks and terminal snapshot internally, so Voice does not need a fragile chain of terminals_list/terminals_read calls.

Only phase=working/completed/needs_input with verified=true is positive processing evidence. phase=staged means the prompt is still visible and unprocessed. phase=unknown_timeout is YELLOW and must be spoken as unverified. Output/screen changes alone never prove completion. Use the returned short speak string verbatim or more conservatively.`,
		inputSchema: {
			hostId: z.string().min(1),
			workspaceId: z.string().min(1),
			terminalId: z.string().min(1),
			deliveryId: z.string().uuid(),
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
				"terminal.awaitDelivery",
				"query",
				{
					deliveryId: input.deliveryId,
					terminalId: input.terminalId,
					workspaceId: input.workspaceId,
					timeoutMs: input.timeoutMs,
				},
			),
	});
}
