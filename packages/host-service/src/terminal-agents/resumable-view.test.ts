import { describe, expect, it } from "bun:test";
import type { AgentTombstoneRow } from "./tombstone-store";
import { toResumableAgentView, toResumableAgentViews } from "./resumable-view";

function row(overrides: Partial<AgentTombstoneRow> = {}): AgentTombstoneRow {
	return {
		id: "tomb-1",
		workspaceId: "w1",
		terminalId: "term-1",
		agentId: "kimi" as AgentTombstoneRow["agentId"],
		agentSessionId: "sess-abc",
		definitionId: null,
		presetId: "preset-1",
		label: "kimi ana",
		launchCommand: "kimi -m kimi-code/k3",
		runtime: "kimi",
		startedAt: 1_700_000_000_000,
		exitedAt: 1_700_000_200_000,
		...overrides,
	};
}

describe("toResumableAgentView", () => {
	it("marks a row with a session id as exactly resumable", () => {
		const view = toResumableAgentView(row());
		expect(view.resumable).toBe(true);
		expect(view.fidelity).toBe("exact");
	});

	it("marks a row without a session id as resumable at last-session fidelity", () => {
		const view = toResumableAgentView(row({ agentSessionId: null }));
		expect(view.resumable).toBe(true);
		expect(view.fidelity).toBe("last");
	});

	it("marks a shell as not resumable", () => {
		const view = toResumableAgentView(row({ runtime: "shell" }));
		expect(view.resumable).toBe(false);
		expect(view.fidelity).toBe(null);
	});

	it("never exposes the raw agent session id", () => {
		const view = toResumableAgentView(row());
		expect(JSON.stringify(view)).not.toContain("sess-abc");
		expect("agentSessionId" in view).toBe(false);
	});

	it("emits exitedAt as an ISO timestamp", () => {
		expect(toResumableAgentView(row()).exitedAt).toBe(
			new Date(1_700_000_200_000).toISOString(),
		);
	});

	it("passes the launch command through redaction", () => {
		const view = toResumableAgentView(
			row({ launchCommand: "kimi --api-key sk-supersecretvalue123456" }),
		);
		expect(view.launchCommand).not.toContain("sk-supersecretvalue123456");
	});

	it("keeps a null launch command null rather than redacting a placeholder", () => {
		expect(
			toResumableAgentView(row({ launchCommand: null })).launchCommand,
		).toBe(null);
	});
});

describe("toResumableAgentViews", () => {
	it("orders the most recently exited agent first", () => {
		const views = toResumableAgentViews([
			row({ id: "old", exitedAt: 1_000 }),
			row({ id: "newest", exitedAt: 3_000 }),
			row({ id: "middle", exitedAt: 2_000 }),
		]);
		expect(views.map((v) => v.tombstoneId)).toEqual([
			"newest",
			"middle",
			"old",
		]);
	});

	it("does not mutate the caller's array", () => {
		const rows = [row({ id: "a", exitedAt: 1 }), row({ id: "b", exitedAt: 2 })];
		toResumableAgentViews(rows);
		expect(rows.map((r) => r.id)).toEqual(["a", "b"]);
	});
});
