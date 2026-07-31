import type { ResumePlan } from "./resume-argv";

/**
 * A launched process is not a restored context.
 *
 * - `restored`      the recorded session was resumed, confirmed by a banner
 * - `restored_last` a session was resumed, but via the runtime's "most recent"
 *                   form, so it may not be the one the operator meant
 * - `started_empty` the agent came up with no prior context: the dangerous case,
 *                   because every transport-level signal looks like success
 * - `restore_failed` the runtime said so explicitly
 * - `unknown_timeout` no usable evidence; never reported as success
 */
export type ResumePhase =
	| "restored"
	| "restored_last"
	| "started_empty"
	| "restore_failed"
	| "unknown_timeout";

/**
 * Removes terminal decoration before matching, using the same CSI/OSC patterns
 * as `sanitizePromptForPty` in `@superset/shared`. That function is not reused
 * directly because it sanitizes text travelling the other way (into a PTY) and
 * additionally expands tabs and drops all control bytes.
 *
 * OSC removal matters here specifically: agent TUIs set the window title with
 * OSC sequences whose payload is arbitrary text, and that payload could
 * otherwise contribute a false "session" match.
 *
 * The `\x1b` lead byte is load-bearing — a pattern matching `[@-Z]` without it
 * would strip ordinary capital letters and break every banner match.
 */
function stripTerminalDecoration(text: string): string {
	return (
		text
			// biome-ignore lint/suspicious/noControlCharactersInRegex: stripping control chars intentionally
			.replace(/(?:\x1b\[|\x9b)[0-?]*[ -/]*[@-~]/g, "")
			// biome-ignore lint/suspicious/noControlCharactersInRegex: stripping control chars intentionally
			.replace(/(?:\x1b\]|\x9d)[^\x07\x1b\x9c\n]*(?:\x07|\x1b\\|\x9c)/g, "")
	);
}

const RESTORED = [
	/resuming\s+session/i,
	/resumed\s+(conversation|session)/i,
	/continuing\s+(conversation|session)/i,
];
const EMPTY = [
	/no\s+previous\s+conversation/i,
	/starting\s+a\s+new\s+(session|conversation)/i,
	/new\s+session\s+started/i,
];
const FAILED = [
	/session\s+\S+\s+not\s+found/i,
	/could\s+not\s+resume/i,
	/invalid\s+session/i,
];
/** Anchored per line, so it needs text whose line structure is intact. */
const FAILED_LINE_ANCHORED = /^error:/im;

export function classifyResume(input: {
	paneText: string;
	fidelity: ResumePlan["fidelity"];
	timedOut: boolean;
}): ResumePhase {
	if (input.timedOut) return "unknown_timeout";

	const decorated = stripTerminalDecoration(input.paneText);
	// Two normalizations, because the checks want different things: the anchored
	// error pattern needs line structure intact, while phrase matching needs
	// whitespace flattened so a hard wrap at the pane width cannot split a
	// phrase in half.
	const byLine = decorated.replace(/[^\S\n]+/g, " ");
	const flat = decorated.replace(/\s+/g, " ");

	// Failure and empty-start are checked before success: a pane can hold the
	// resume banner and then the error that followed it.
	if (
		FAILED_LINE_ANCHORED.test(byLine) ||
		FAILED.some((pattern) => pattern.test(flat))
	) {
		return "restore_failed";
	}
	if (EMPTY.some((pattern) => pattern.test(flat))) return "started_empty";
	if (RESTORED.some((pattern) => pattern.test(flat))) {
		return input.fidelity === "exact" ? "restored" : "restored_last";
	}
	return "unknown_timeout";
}

/**
 * Compact spoken phrase per phase. Only `restored` may speak without the `SARI`
 * marker; every other outcome is unverified and must sound that way.
 */
export function resumeSpeak(phase: ResumePhase): string {
	switch (phase) {
		case "restored":
			return "Oturum geçmişiyle birlikte geri geldi.";
		case "restored_last":
			return "SARI: Son oturum açıldı; istediğin oturum olduğunu doğrulayamadım.";
		case "started_empty":
			return "SARI: Ajan açıldı ama geçmiş yüklenmedi; boş oturum başladı.";
		case "restore_failed":
			return "SARI: Oturum geri yüklenemedi.";
		case "unknown_timeout":
			return "SARI: Oturumun geri yüklendiğini doğrulayamadım.";
	}
}
