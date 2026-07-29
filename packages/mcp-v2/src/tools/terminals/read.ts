import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { defineTool } from "../../define-tool";
import { hostServiceCall } from "../../host-service-client";
import {
	buildHostCapabilityMissing,
	buildTerminalReadResult,
	type HostTerminalSnapshot,
	isMissingTerminalSnapshot,
	type TerminalSummary,
} from "./terminal-read-contract";

interface HostInfo {
	version: string;
}

async function readHostVersion(
	options: Parameters<typeof hostServiceCall>[0],
): Promise<string> {
	try {
		return (await hostServiceCall<HostInfo>(options, "host.info", "query"))
			.version;
	} catch {
		return "unknown";
	}
}

export function register(server: McpServer): void {
	defineTool(server, {
		name: "terminals_read",
		annotations: { readOnlyHint: true },
		description:
			"Read a terminal's sanitized current screen plus stable agent identity, state, and last activity. Returns recent scrollback, not a full transcript. Older hosts without terminal.snapshot return HOST_CAPABILITY_MISSING with upgrade diagnostics.",
		inputSchema: {
			hostId: z
				.string()
				.min(1)
				.describe("Host machineId the workspace lives on."),
			workspaceId: z
				.string()
				.uuid()
				.describe("Workspace UUID the terminal runs in."),
			terminalId: z
				.string()
				.describe(
					"Terminal id (the `sessionId` agents_create returned, or `terminalId` from terminals_create).",
				),
			maxLines: z
				.number()
				.int()
				.positive()
				.optional()
				.describe(
					"Cap returned rows from the bottom. Omit for the full snapshot.",
				),
		},
		handler: async (input, ctx) => {
			const options = {
				relayUrl: ctx.relayUrl,
				organizationId: ctx.organizationId,
				hostId: input.hostId,
				jwt: ctx.bearerToken,
			};

			let snapshot: HostTerminalSnapshot;
			try {
				snapshot = await hostServiceCall<HostTerminalSnapshot>(
					options,
					"terminal.snapshot",
					"query",
					{
						terminalId: input.terminalId,
						workspaceId: input.workspaceId,
						maxLines: input.maxLines,
					},
				);
			} catch (error) {
				if (!isMissingTerminalSnapshot(error)) throw error;
				return buildHostCapabilityMissing(await readHostVersion(options));
			}

			let summary: TerminalSummary | undefined;
			try {
				const listed = await hostServiceCall<{ sessions: TerminalSummary[] }>(
					options,
					"terminal.listSessions",
					"query",
					{ workspaceId: input.workspaceId },
				);
				summary = listed.sessions.find(
					(session) => session.terminalId === input.terminalId,
				);
			} catch {
				// Snapshot remains useful if the optional metadata enrichment fails.
			}

			return buildTerminalReadResult({
				workspaceId: input.workspaceId,
				snapshot,
				summary,
			});
		},
	});
}
