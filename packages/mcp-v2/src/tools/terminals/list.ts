import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { defineTool } from "../../define-tool";
import { hostServiceCall } from "../../host-service-client";
import {
	type HostTerminalSummary,
	normalizeTerminalSummary,
} from "./terminal-list-contract";

export function register(server: McpServer): void {
	defineTool(server, {
		name: "terminals_list",
		annotations: { readOnlyHint: true },
		description:
			"List live terminal sessions with stable runtime/preset identity, sanitized launch command, state, and last activity. Identity is captured at launch and is never inferred from a human-written title. Use to select a terminalId before terminals_send/terminals_read/terminals_close.",
		inputSchema: {
			hostId: z
				.string()
				.min(1)
				.describe("Host machineId the workspace lives on."),
			workspaceId: z
				.string()
				.uuid()
				.describe("Workspace UUID whose terminals to list."),
		},
		handler: async (input, ctx) => {
			const result = await hostServiceCall<{ sessions: HostTerminalSummary[] }>(
				{
					relayUrl: ctx.relayUrl,
					organizationId: ctx.organizationId,
					hostId: input.hostId,
					jwt: ctx.bearerToken,
				},
				"terminal.listSessions",
				"query",
				{ workspaceId: input.workspaceId },
			);
			return {
				sessions: result.sessions.map(normalizeTerminalSummary),
			};
		},
	});
}
