import { redactSensitiveText } from "@superset/shared/sensitive-text";
import { HostServiceError } from "../../host-service-client";

export const TERMINAL_SNAPSHOT_REQUIRED_VERSION = "1.17.1";

export type TerminalRuntime = "codex" | "claude" | "kimi" | "shell" | "unknown";
export type TerminalState =
	| "running"
	| "idle"
	| "waiting_input"
	| "exited"
	| "unknown";

export interface TerminalAgent {
	runtime: TerminalRuntime;
	presetId?: string;
	label?: string;
}

export interface TerminalSummary {
	terminalId: string;
	workspaceId: string;
	state?: TerminalState;
	stateSource?: "agent_hook" | "process_tree" | "unknown";
	agent?: TerminalAgent;
	updatedAt?: string;
	revision?: number;
}

export interface HostTerminalSnapshot {
	terminalId: string;
	cols: number;
	rows: number;
	revision: number;
	updatedAt?: number;
	text: string;
}

export interface TerminalReadResult {
	terminalId: string;
	workspaceId: string;
	state: TerminalState;
	stateSource: "agent_hook" | "process_tree" | "unknown";
	agent?: TerminalAgent;
	updatedAt?: string;
	revision: number;
	promptStatus: "empty" | "has_text" | "unknown";
	output: string;
	cols: number;
	rows: number;
}

export interface HostCapabilityMissing {
	code: "HOST_CAPABILITY_MISSING";
	capability: "terminal.snapshot";
	hostVersion: string;
	requiredVersion: string;
}

export function isMissingTerminalSnapshot(error: unknown): boolean {
	return (
		error instanceof HostServiceError &&
		error.status === 404 &&
		error.procedure === "terminal.snapshot"
	);
}

export function buildHostCapabilityMissing(
	hostVersion: string,
): HostCapabilityMissing {
	return {
		code: "HOST_CAPABILITY_MISSING",
		capability: "terminal.snapshot",
		hostVersion,
		requiredVersion: TERMINAL_SNAPSHOT_REQUIRED_VERSION,
	};
}

export function buildTerminalReadResult({
	workspaceId,
	snapshot,
	summary,
}: {
	workspaceId: string;
	snapshot: HostTerminalSnapshot;
	summary?: TerminalSummary;
}): TerminalReadResult {
	return {
		terminalId: snapshot.terminalId,
		workspaceId,
		state: summary?.state ?? "unknown",
		stateSource: summary?.stateSource ?? "unknown",
		...(summary?.agent ? { agent: summary.agent } : {}),
		...(summary?.updatedAt ? { updatedAt: summary.updatedAt } : {}),
		revision: snapshot.revision,
		promptStatus: detectPromptStatus(snapshot.text, summary?.agent?.runtime),
		output: redactSensitiveText(snapshot.text),
		cols: snapshot.cols,
		rows: snapshot.rows,
	};
}

function detectPromptStatus(
	text: string,
	runtime: TerminalRuntime | undefined,
): "empty" | "has_text" | "unknown" {
	if (runtime !== "claude" && runtime !== "codex" && runtime !== "kimi") {
		return "unknown";
	}
	const pattern =
		runtime === "claude"
			? /^\s*❯\s*(.*)$/u
			: runtime === "codex"
				? /^\s*[›>]\s*(.*)$/u
				: /^\s*>\s*(.*)$/u;
	const lines = text.split("\n");
	for (
		let index = lines.length - 1;
		index >= Math.max(0, lines.length - 16);
		index--
	) {
		const match = lines[index]?.match(pattern);
		if (match) return match[1]?.trim() ? "has_text" : "empty";
	}
	return "unknown";
}
