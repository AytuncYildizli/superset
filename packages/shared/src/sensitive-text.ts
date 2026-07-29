const SENSITIVE_NAME =
	"(?:api[_-]?key|access[_-]?key|private[_-]?key|token|refresh[_-]?token|secret|password|passwd|authorization|auth)";

const ASSIGNMENT_RE = new RegExp(
	`\\b(${SENSITIVE_NAME})\\s*[:=]\\s*(?:["']?)[^\\s,"';}]+(?:["']?)`,
	"gi",
);
const FLAG_RE = new RegExp(
	`(?:["']?)(--${SENSITIVE_NAME})(?:["']?)(?:=|\\s+)(?:["']?)[^\\s"']+(?:["']?)`,
	"gi",
);

/**
 * Best-effort redaction for operator-facing terminal text. This is deliberately
 * conservative: terminal snapshots are untrusted free text, so values that
 * look like credentials are removed before crossing the MCP boundary.
 */
export function redactSensitiveText(input: string): string {
	return input
		.replace(FLAG_RE, "$1 [REDACTED]")
		.replace(/\bBearer\s+[A-Za-z0-9._~+/=-]+/gi, "Bearer [REDACTED]")
		.replace(ASSIGNMENT_RE, "$1=[REDACTED]")
		.replace(
			/\b(?:sk|pk|rk|gh[pousr]|xox[baprs])[-_][A-Za-z0-9_-]{12,}\b/g,
			"[REDACTED]",
		)
		.replace(
			/\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g,
			"[REDACTED]",
		);
}
