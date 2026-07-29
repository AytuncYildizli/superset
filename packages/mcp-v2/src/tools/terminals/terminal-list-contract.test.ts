import { describe, expect, it } from "bun:test";
import { normalizeTerminalSummary } from "./terminal-list-contract";

const base = {
	terminalId: "terminal-1",
	workspaceId: "workspace-1",
	createdAt: 100,
	exited: false,
	exitCode: 0,
	attached: true,
	title: "Claude-ish title must not be identity",
};

describe("normalizeTerminalSummary", () => {
	it("normalizes an old-host summary without inferring identity or freshness", () => {
		const normalized = normalizeTerminalSummary(base);
		expect(normalized).toMatchObject({
			agent: { runtime: "unknown" },
			launchCommand: null,
			state: "unknown",
			stateSource: "unknown",
		});
		expect(normalized.updatedAt).toBeUndefined();
	});

	it("preserves enriched metadata and redacts launch command", () => {
		const normalized = normalizeTerminalSummary({
			...base,
			agent: { runtime: "codex", presetId: "codex", label: "Codex" },
			launchCommand: "'codex' '--api-key' 'do-not-leak'",
			state: "waiting_input",
			updatedAt: "2026-07-29T00:00:00.000Z",
		});
		expect(normalized.agent.runtime).toBe("codex");
		expect(normalized.state).toBe("waiting_input");
		expect(normalized.launchCommand).not.toContain("do-not-leak");
	});
});
