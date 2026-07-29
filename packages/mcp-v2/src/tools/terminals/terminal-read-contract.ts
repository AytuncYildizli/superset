import { redactSensitiveText } from "@superset/shared/sensitive-text";
import { HostServiceError } from "../../host-service-client";

export const TERMINAL_SNAPSHOT_REQUIRED_VERSION = "1.17.1";

export type TerminalRuntime = "codex" | "claude" | "kimi" | "shell" | "unknown";
export type TerminalState = "running" | "idle" | "waiting_input" | "exited";

export interface TerminalAgent {
	runtime: TerminalRuntime;
	presetId?: string;
	label?: string;
}

export interface TerminalSummary {
	terminalId: string;
	workspaceId: string;
	state?: TerminalState;
	agent?: TerminalAgent;
	updatedAt?: string;
}

export interface HostTerminalSnapshot {
	terminalId: string;
	cols: number;
	rows: number;
	text: string;
}

export interface TerminalReadResult {
	terminalId: string;
	workspaceId: string;
	state: TerminalState;
	agent?: TerminalAgent;
	updatedAt: string;
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
	now = new Date(),
}: {
	workspaceId: string;
	snapshot: HostTerminalSnapshot;
	summary?: TerminalSummary;
	now?: Date;
}): TerminalReadResult {
	return {
		terminalId: snapshot.terminalId,
		workspaceId,
		state: summary?.state ?? "running",
		...(summary?.agent ? { agent: summary.agent } : {}),
		updatedAt: summary?.updatedAt ?? now.toISOString(),
		output: redactSensitiveText(snapshot.text),
		cols: snapshot.cols,
		rows: snapshot.rows,
	};
}
