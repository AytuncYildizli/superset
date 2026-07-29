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
	stateSource: "agent_hook" | "process_tree" | "unknown";
	updatedAt?: string;
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
	let stateSource: TerminalOperatorSession["stateSource"];
	if (summary.exited) {
		state = "exited";
		stateSource = "process_tree";
	} else if (binding && WAITING_INPUT_EVENTS.has(binding.lastEventType)) {
		state = "waiting_input";
		stateSource = "agent_hook";
	} else if (binding && IDLE_EVENTS.has(binding.lastEventType)) {
		state = "idle";
		stateSource = "agent_hook";
	} else if (binding) {
		state = "running";
		stateSource = "agent_hook";
	} else if (hasRunningProcess) {
		state = "running";
		stateSource = "process_tree";
	} else {
		state = "idle";
		stateSource = "unknown";
	}

	const updatedAtMs = Math.max(
		binding?.lastEventAt ?? 0,
		summary.lastOutputAt ?? 0,
	);
	return {
		...summary,
		agent: {
			runtime: runtimeFromBinding(binding),
			...(binding?.presetId ? { presetId: binding.presetId } : {}),
			...(binding?.label ? { label: binding.label } : {}),
		},
		launchCommand: binding?.launchCommand ?? null,
		state,
		stateSource,
		...(updatedAtMs === 0
			? {}
			: { updatedAt: new Date(updatedAtMs).toISOString() }),
	};
}
