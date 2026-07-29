import type { TerminalSessionSummary } from "../terminal/terminal";
import type { TerminalAgentBinding } from "./types";

export type TerminalRuntime = "codex" | "claude" | "kimi" | "shell" | "unknown";
export type TerminalOperatorState =
	| "running"
	| "idle"
	| "waiting_input"
	| "exited";

export interface TerminalOperatorAgent {
	runtime: TerminalRuntime;
	presetId?: string;
	label?: string;
}

export interface TerminalOperatorSession extends TerminalSessionSummary {
	agent: TerminalOperatorAgent;
	launchCommand: string | null;
	state: TerminalOperatorState;
	updatedAt: string;
}

const WAITING_INPUT_EVENTS = new Set([
	"PermissionRequest",
	"permission",
	"waiting_input",
	"AskUserQuestion",
]);
const IDLE_EVENTS = new Set(["Stop", "Attached", "SessionEnd", "idle"]);

function runtimeFromBinding(
	binding: TerminalAgentBinding | undefined,
): TerminalRuntime {
	if (!binding) return "shell";
	if (binding.agentId === "codex") return "codex";
	if (binding.agentId === "claude") return "claude";
	if (binding.agentId === "kimi") return "kimi";
	return "unknown";
}

export function buildTerminalOperatorSession({
	summary,
	binding,
	hasRunningProcess,
}: {
	summary: TerminalSessionSummary;
	binding?: TerminalAgentBinding;
	hasRunningProcess: boolean;
}): TerminalOperatorSession {
	let state: TerminalOperatorState;
	if (summary.exited) {
		state = "exited";
	} else if (binding && WAITING_INPUT_EVENTS.has(binding.lastEventType)) {
		state = "waiting_input";
	} else if (binding && IDLE_EVENTS.has(binding.lastEventType)) {
		state = "idle";
	} else {
		state = hasRunningProcess || binding ? "running" : "idle";
	}

	return {
		...summary,
		agent: {
			runtime: runtimeFromBinding(binding),
			...(binding?.presetId ? { presetId: binding.presetId } : {}),
			...(binding?.label ? { label: binding.label } : {}),
		},
		launchCommand: binding?.launchCommand ?? null,
		state,
		updatedAt: new Date(
			binding?.lastEventAt ?? summary.createdAt,
		).toISOString(),
	};
}
