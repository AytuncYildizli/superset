import { describe, expect, it } from "bun:test";
import { resumeArgvFor } from "./resume-argv";

// Flags verified against the installed CLIs on 2026-07-31:
//   codex resume [SESSION_ID] | codex resume --last
//   claude -r/--resume [value] | claude -c/--continue
//   kimi -S/--session [id]     | kimi -c/--continue
describe("resumeArgvFor", () => {
	it("resumes an exact codex session by id", () => {
		const plan = resumeArgvFor({ runtime: "codex", agentSessionId: "abc123" });
		expect(plan?.argv).toEqual(["codex", "resume", "abc123"]);
		expect(plan?.fidelity).toBe("exact");
	});

	it("falls back to the most recent codex session when no id was recorded", () => {
		const plan = resumeArgvFor({ runtime: "codex", agentSessionId: null });
		expect(plan?.argv).toEqual(["codex", "resume", "--last"]);
		expect(plan?.fidelity).toBe("last");
	});

	it("resumes an exact claude session by id", () => {
		const plan = resumeArgvFor({ runtime: "claude", agentSessionId: "sid-9" });
		expect(plan?.argv).toEqual(["claude", "--resume", "sid-9"]);
		expect(plan?.fidelity).toBe("exact");
	});

	it("continues the most recent claude conversation when no id was recorded", () => {
		const plan = resumeArgvFor({ runtime: "claude", agentSessionId: null });
		expect(plan?.argv).toEqual(["claude", "--continue"]);
		expect(plan?.fidelity).toBe("last");
	});

	it("resumes an exact kimi session by id", () => {
		const plan = resumeArgvFor({ runtime: "kimi", agentSessionId: "k-1" });
		expect(plan?.argv).toEqual(["kimi", "--session", "k-1"]);
		expect(plan?.fidelity).toBe("exact");
	});

	it("continues the previous kimi session when no id was recorded", () => {
		const plan = resumeArgvFor({ runtime: "kimi", agentSessionId: null });
		expect(plan?.argv).toEqual(["kimi", "--continue"]);
		expect(plan?.fidelity).toBe("last");
	});

	it("never resumes a plain shell", () => {
		expect(resumeArgvFor({ runtime: "shell", agentSessionId: "x" })).toBe(null);
	});

	it("never resumes an unknown runtime", () => {
		expect(resumeArgvFor({ runtime: "unknown", agentSessionId: "x" })).toBe(
			null,
		);
	});

	it("refuses a malformed session id instead of silently resuming the last session", () => {
		// Degrading "resume THIS session" to "resume whatever was last" would be a
		// fidelity lie, so a present-but-unusable id is a refusal, not a fallback.
		expect(
			resumeArgvFor({ runtime: "claude", agentSessionId: "a; rm -rf /" }),
		).toBe(null);
		expect(resumeArgvFor({ runtime: "codex", agentSessionId: "a b" })).toBe(
			null,
		);
		expect(resumeArgvFor({ runtime: "kimi", agentSessionId: "" })).toBe(null);
	});

	it("accepts the id shapes the agents actually emit", () => {
		const uuid = "3f8c1d20-1c2b-4a5e-9f00-9a1b2c3d4e5f";
		expect(
			resumeArgvFor({ runtime: "codex", agentSessionId: uuid })?.argv,
		).toEqual(["codex", "resume", uuid]);
		expect(
			resumeArgvFor({ runtime: "codex", agentSessionId: "my_session.2" })
				?.fidelity,
		).toBe("exact");
	});
});
