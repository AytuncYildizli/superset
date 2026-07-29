import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { defineTool } from "../../define-tool";
import { hostServiceCall } from "../../host-service-client";
import type { HostTerminalSummary } from "../terminals/terminal-list-contract";
import {
	rankVoiceTargets,
	type VoiceTargetCandidate,
} from "./target-resolver-contract";

export function register(server: McpServer): void {
	defineTool(server, {
		name: "targets_resolve_spoken",
		annotations: { readOnlyHint: true },
		description: `Resolve a noisy spoken workspace/agent reference against live Superset targets without mutating anything.

Use before terminals_send when Voice transcription may have mangled names such as Superset/super set, Kahvetabela/kahve tabela, Claude/cloud, Codex/kodeks, Kimi/Kimmy, Glama, or MCP. The alias table only normalizes the query; canonical identity always comes from live workspace and terminal metadata.

If ambiguous=true, ask one short clarification and do not send. If false, speak canonicalConfirmation before mutation and use the returned exact hostId/workspaceId/terminalId.`,
		inputSchema: {
			hostId: z.string().min(1),
			query: z.string().min(1).max(500),
			maxWorkspaces: z.number().int().min(1).max(20).default(10),
		},
		handler: async (input, ctx) => {
			const workspaces = await hostServiceCall<
				Array<{ id: string; name: string }>
			>(
				{
					relayUrl: ctx.relayUrl,
					organizationId: ctx.organizationId,
					hostId: input.hostId,
					jwt: ctx.bearerToken,
				},
				"workspace.list",
				"query",
			);
			const workspaceCandidates: VoiceTargetCandidate[] = workspaces.map(
				(workspace) => ({
					hostId: input.hostId,
					workspaceId: workspace.id,
					workspaceName: workspace.name,
				}),
			);
			const shortlist = rankVoiceTargets(input.query, workspaceCandidates)
				.candidates.slice(0, input.maxWorkspaces)
				.map((candidate) => candidate.workspaceId);
			const selected = workspaces.filter((workspace) =>
				shortlist.includes(workspace.id),
			);
			const sessionResults = await Promise.allSettled(
				selected.map(async (workspace) => ({
					workspace,
					result: await hostServiceCall<{ sessions: HostTerminalSummary[] }>(
						{
							relayUrl: ctx.relayUrl,
							organizationId: ctx.organizationId,
							hostId: input.hostId,
							jwt: ctx.bearerToken,
						},
						"terminal.listSessions",
						"query",
						{ workspaceId: workspace.id },
					),
				})),
			);
			const candidates = [...workspaceCandidates];
			const failedWorkspaceIds: string[] = [];
			for (const [index, settled] of sessionResults.entries()) {
				if (settled.status !== "fulfilled") {
					const failed = selected[index];
					if (failed) failedWorkspaceIds.push(failed.id);
					continue;
				}
				for (const session of settled.value.result.sessions) {
					candidates.push({
						hostId: input.hostId,
						workspaceId: settled.value.workspace.id,
						workspaceName: settled.value.workspace.name,
						terminalId: session.terminalId,
						runtime: session.agent?.runtime ?? "unknown",
						...(session.agent?.label ? { label: session.agent.label } : {}),
					});
				}
			}
			const ranked = rankVoiceTargets(input.query, candidates);
			const top = ranked.candidates.slice(0, 8);
			return {
				query: input.query,
				partial: failedWorkspaceIds.length > 0,
				failedWorkspaceIds,
				ambiguous: ranked.ambiguous || failedWorkspaceIds.length > 0,
				canonicalConfirmation:
					!ranked.ambiguous && failedWorkspaceIds.length === 0 && top[0]
						? `${top[0].canonicalName} hedefini seçtim.`
						: null,
				candidates: top,
			};
		},
	});
}
