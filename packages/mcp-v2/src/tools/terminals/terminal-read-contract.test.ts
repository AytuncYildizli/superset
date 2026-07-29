import { describe, expect, it } from "bun:test";
import { HostServiceError } from "../../host-service-client";
import {
	buildHostCapabilityMissing,
	buildTerminalReadResult,
	isMissingTerminalSnapshot,
} from "./terminal-read-contract";

describe("terminal read contract", () => {
	it("returns a stable enriched snapshot and redacts terminal secrets", () => {
		const result = buildTerminalReadResult({
			workspaceId: "workspace-1",
			snapshot: {
				terminalId: "terminal-1",
				cols: 120,
				rows: 40,
				text: "working\nAPI_KEY=do-not-leak\nAuthorization: Bearer abc.def",
			},
			summary: {
				terminalId: "terminal-1",
				workspaceId: "workspace-1",
				state: "waiting_input",
				agent: { runtime: "claude", presetId: "claude", label: "Claude" },
				updatedAt: "2026-07-29T00:00:00.000Z",
			},
		});

		expect(result.state).toBe("waiting_input");
		expect(result.agent?.runtime).toBe("claude");
		expect(result.output).toContain("working");
		expect(result.output).not.toContain("do-not-leak");
		expect(result.output).not.toContain("abc.def");
	});

	it("classifies only terminal.snapshot 404 as a capability mismatch", () => {
		const missing = new HostServiceError({
			hostId: "host-1",
			procedure: "terminal.snapshot",
			status: 404,
			responseBody: "not found",
		});
		expect(isMissingTerminalSnapshot(missing)).toBe(true);
		expect(
			isMissingTerminalSnapshot(
				new HostServiceError({
					hostId: "host-1",
					procedure: "terminal.snapshot",
					status: 403,
					responseBody: "forbidden",
				}),
			),
		).toBe(false);
	});

	it("builds the actionable compatibility payload", () => {
		expect(buildHostCapabilityMissing("1.17.0")).toEqual({
			code: "HOST_CAPABILITY_MISSING",
			capability: "terminal.snapshot",
			hostVersion: "1.17.0",
			requiredVersion: "1.17.1",
		});
	});
});
