import { redactSensitiveText } from "@superset/shared/sensitive-text";
import { resumeArgvFor } from "./resume-argv";
import type { AgentTombstoneRow } from "./tombstone-store";

/**
 * Operator-facing view of an agent that has exited and may be restartable.
 *
 * `agentSessionId` is deliberately absent. A resume is requested by
 * `tombstoneId`; the host looks the session handle up itself. Sending the raw
 * handle outward would widen the leak surface for no gain.
 */
export interface ResumableAgentView {
	tombstoneId: string;
	workspaceId: string;
	terminalId: string;
	runtime: string;
	label: string | null;
	presetId: string | null;
	/** Redacted: launch commands can carry flags with sensitive values. */
	launchCommand: string | null;
	exitedAt: string;
	resumable: boolean;
	/**
	 * `exact` when the recorded session id will be used, `last` when the runtime
	 * can only be asked for its most recent session, null when not resumable.
	 * Voice must not promise an exact restore on `last`.
	 */
	fidelity: "exact" | "last" | null;
}

export function toResumableAgentView(
	row: AgentTombstoneRow,
): ResumableAgentView {
	const plan = resumeArgvFor(row);
	return {
		tombstoneId: row.id,
		workspaceId: row.workspaceId,
		terminalId: row.terminalId,
		runtime: row.runtime,
		label: row.label,
		presetId: row.presetId,
		launchCommand:
			row.launchCommand === null
				? null
				: redactSensitiveText(row.launchCommand),
		exitedAt: new Date(row.exitedAt).toISOString(),
		resumable: plan !== null,
		fidelity: plan?.fidelity ?? null,
	};
}

/** Newest exit first — the most recently dead agent is the likely target. */
export function toResumableAgentViews(
	rows: AgentTombstoneRow[],
): ResumableAgentView[] {
	return [...rows]
		.sort((a, b) => b.exitedAt - a.exitedAt)
		.map(toResumableAgentView);
}
