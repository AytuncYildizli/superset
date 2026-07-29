import { describe, expect, it } from "bun:test";
import { buildTerminalOperatorSession } from "./operator-view";

const summary = {
	terminalId: "terminal-1",
	workspaceId: "workspace-1",
	createdAt: 100,
	exited: false,
	exitCode: 0,
	attached: true,
	title: "human title that must not drive identity",
};

describe("buildTerminalOperatorSession", () => {
	it.each([
		["codex", "codex"],
		["claude", "claude"],
		["kimi", "kimi"],
		["amp", "unknown"],
	] as const)("maps %s binding to %s runtime without reading title", (agentId, runtime) => {
		const view = buildTerminalOperatorSession({
			summary,
			binding: {
				terminalId: summary.terminalId,
				workspaceId: summary.workspaceId,
				agentId,
				presetId: agentId,
				label: agentId,
				launchCommand: `'${agentId}'`,
				startedAt: 100,
				lastEventAt: 200,
				lastEventType: "Start",
			},
			hasRunningProcess: true,
		});
		expect(view.agent.runtime).toBe(runtime);
		expect(view.agent.presetId).toBe(agentId);
		expect(view.state).toBe("running");
	});

	it("marks ordinary terminals as shell and derives idle state", () => {
		const view = buildTerminalOperatorSession({
			summary,
			hasRunningProcess: false,
		});
		expect(view.agent).toEqual({ runtime: "shell" });
		expect(view.state).toBe("idle");
		expect(view.launchCommand).toBeNull();
	});

	it("maps permission and stop lifecycle events", () => {
		const binding = {
			terminalId: summary.terminalId,
			workspaceId: summary.workspaceId,
			agentId: "claude" as const,
			startedAt: 100,
			lastEventAt: 200,
			lastEventType: "PermissionRequest",
		};
		expect(
			buildTerminalOperatorSession({
				summary,
				binding,
				hasRunningProcess: true,
			}).state,
		).toBe("waiting_input");
		expect(
			buildTerminalOperatorSession({
				summary,
				binding: { ...binding, lastEventType: "Stop" },
				hasRunningProcess: false,
			}).state,
		).toBe("idle");
	});
});
