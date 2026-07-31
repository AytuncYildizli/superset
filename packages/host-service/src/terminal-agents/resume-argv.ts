import type { TerminalRuntime } from "./operator-view";

/**
 * `exact` means the recorded session id was used. `last` means the runtime was
 * asked for its most recent session, which is *not* a guarantee it is the one
 * the operator meant — the receipt layer must be able to say so out loud.
 */
export interface ResumePlan {
	argv: string[];
	fidelity: "exact" | "last";
}

/**
 * Session ids are passed as argv, never through a shell, but they also reach
 * logs and spoken confirmations. Constrain them to the shapes the agents
 * actually emit (UUIDs and slug-ish names).
 */
const SAFE_SESSION_ID = /^[A-Za-z0-9._-]{1,128}$/;

/**
 * Resume argv per runtime. Verified against the installed CLIs on 2026-07-31:
 *
 * - `codex resume [SESSION_ID]` / `codex resume --last`
 * - `claude -r, --resume [value]` / `claude -c, --continue`
 * - `kimi -S, --session [id]` / `kimi -c, --continue`
 *
 * Long flags are used deliberately: they survive a CLI reshuffling short
 * options, and they are readable in a spoken or logged confirmation.
 *
 * Returns null when the runtime cannot be resumed at all, and also when a
 * session id was recorded but is unusable. The second case is a refusal rather
 * than a fallback: quietly turning "resume this session" into "resume whatever
 * ran last" is the false-success this project exists to prevent.
 */
export function resumeArgvFor(row: {
	runtime: TerminalRuntime | string;
	agentSessionId: string | null;
}): ResumePlan | null {
	const recorded = row.agentSessionId;
	if (recorded !== null && !SAFE_SESSION_ID.test(recorded)) return null;

	switch (row.runtime) {
		case "codex":
			return recorded !== null
				? { argv: ["codex", "resume", recorded], fidelity: "exact" }
				: { argv: ["codex", "resume", "--last"], fidelity: "last" };
		case "claude":
			return recorded !== null
				? { argv: ["claude", "--resume", recorded], fidelity: "exact" }
				: { argv: ["claude", "--continue"], fidelity: "last" };
		case "kimi":
			return recorded !== null
				? { argv: ["kimi", "--session", recorded], fidelity: "exact" }
				: { argv: ["kimi", "--continue"], fidelity: "last" };
		default:
			return null;
	}
}
