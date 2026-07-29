import { describe, expect, it } from "bun:test";
import {
	normalizeVoiceTarget,
	rankVoiceTargets,
} from "./target-resolver-contract";

const candidates = [
	{
		hostId: "host-1",
		workspaceId: "workspace-kahve",
		workspaceName: "Kahvetabela",
		terminalId: "terminal-claude",
		runtime: "claude",
		label: "Claude Fix GSC",
	},
	{
		hostId: "host-1",
		workspaceId: "workspace-kahve",
		workspaceName: "Kahvetabela",
		terminalId: "terminal-codex",
		runtime: "codex",
		label: "Codex Review",
	},
	{
		hostId: "host-1",
		workspaceId: "workspace-superset",
		workspaceName: "Superset MCP",
	},
];

describe("voice target resolver", () => {
	it("normalizes observed Turkish/English ASR confusions", () => {
		expect(normalizeVoiceTarget("Kahve Tabela'daki Cloud")).toBe(
			"kahvetabela daki claude",
		);
		expect(normalizeVoiceTarget("Super Set M C P")).toBe("superset mcp");
		expect(normalizeVoiceTarget("Kodeks ve Kimmy")).toBe("codex ve kimi");
	});

	it("ranks the live canonical Claude terminal for a mangled utterance", () => {
		const result = rankVoiceTargets("kahve tabela cloud fix gsc", candidates);
		expect(result.candidates[0]?.terminalId).toBe("terminal-claude");
		expect(result.candidates[0]?.canonicalName).toBe(
			"Kahvetabela > Claude Fix GSC",
		);
		expect(result.ambiguous).toBe(false);
	});

	it("returns ambiguity instead of inventing a terminal when identity is weak", () => {
		const result = rankVoiceTargets("kahvetabela ajan", candidates);
		expect(result.ambiguous).toBe(true);
	});

	it("prefers an exact workspace and an exact qualified terminal without parent ties", () => {
		const workspace = rankVoiceTargets("superset mcp", candidates);
		expect(workspace.ambiguous).toBe(false);
		expect(workspace.candidates[0]?.terminalId).toBeUndefined();
		const terminal = rankVoiceTargets("kahvetabela claude", candidates);
		expect(terminal.ambiguous).toBe(false);
		expect(terminal.candidates[0]?.runtime).toBe("claude");
	});

	it("preserves Turkish dotted and dotless I in agent names", () => {
		expect(normalizeVoiceTarget("İzzy IŞIK")).toBe("izzy isik");
	});

	it("passes a 20-utterance bilingual ASR target matrix", () => {
		const fixtures = [
			["kahve tabela cloud fix gsc", "terminal-claude"],
			["kahvetabela clod fix gsc", "terminal-claude"],
			["kahve tabela klaud", "terminal-claude"],
			["kahvetabela claude", "terminal-claude"],
			["kahve tabela cloud agent", "terminal-claude"],
			["kahvetabela cloud terminal", "terminal-claude"],
			["kahve tabela kodeks review", "terminal-codex"],
			["kahvetabela code x review", "terminal-codex"],
			["kahve tabela codex", "terminal-codex"],
			["kahvetabela kodeks", "terminal-codex"],
			["kahve tabela codex review", "terminal-codex"],
			["kahvetabela code x", "terminal-codex"],
			["super set m c p", "workspace-superset"],
			["superset mc p", "workspace-superset"],
			["super-set mcp", "workspace-superset"],
			["superset mcp workspace", "workspace-superset"],
			["süper set mcp", "workspace-superset"],
			["superset m c p", "workspace-superset"],
			["super set mc p", "workspace-superset"],
			["superset mcp", "workspace-superset"],
		] as const;
		for (const [utterance, expectedId] of fixtures) {
			const top = rankVoiceTargets(utterance, candidates).candidates[0];
			expect(top?.terminalId ?? top?.workspaceId, utterance).toBe(expectedId);
		}
	});
});
