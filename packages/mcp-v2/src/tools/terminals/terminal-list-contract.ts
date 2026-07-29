import { redactSensitiveText } from "@superset/shared/sensitive-text";

export interface HostTerminalSummary {
	terminalId: string;
	workspaceId: string;
	createdAt: number;
	exited: boolean;
	exitCode: number;
	attached: boolean;
	title: string | null;
	agent?: {
		runtime: "codex" | "claude" | "kimi" | "shell" | "unknown";
		presetId?: string;
		label?: string;
	};
	launchCommand?: string | null;
	state?: "running" | "idle" | "waiting_input" | "exited" | "unknown";
	stateSource?: "agent_hook" | "process_tree" | "unknown";
	updatedAt?: string;
	revision?: number;
}

export function normalizeTerminalSummary(session: HostTerminalSummary) {
	return {
		...session,
		agent: session.agent ?? { runtime: "unknown" as const },
		launchCommand: session.launchCommand
			? redactSensitiveText(session.launchCommand)
			: null,
		state: session.state ?? (session.exited ? "exited" : "unknown"),
		stateSource: session.stateSource ?? "unknown",
		...(session.updatedAt ? { updatedAt: session.updatedAt } : {}),
	};
}
