import { describe, expect, it } from "bun:test";
import {
	classifyResume,
	type ResumePhase,
	resumeSpeak,
} from "./resume-evidence";

// Escape sequences are written as \x1b rather than pasted as literal ESC bytes:
// literal bytes are invisible in a diff and cannot be edited reliably.
const ESC = "\x1b";

describe("classifyResume", () => {
	it("treats a resume banner with an exact id as restored", () => {
		expect(
			classifyResume({
				paneText: "Resuming session abc123\n> ",
				fidelity: "exact",
				timedOut: false,
			}),
		).toBe("restored");
	});

	it("reports a resume banner reached via --last separately", () => {
		expect(
			classifyResume({
				paneText: "Resuming session zzz\n> ",
				fidelity: "last",
				timedOut: false,
			}),
		).toBe("restored_last");
	});

	it("detects a fresh-session banner as a silently empty start", () => {
		expect(
			classifyResume({
				paneText: "Welcome to Claude Code\nNo previous conversation found\n> ",
				fidelity: "exact",
				timedOut: false,
			}),
		).toBe("started_empty");
	});

	it("treats an explicit resume error as a failure", () => {
		expect(
			classifyResume({
				paneText: "Error: session sid-9 not found",
				fidelity: "exact",
				timedOut: false,
			}),
		).toBe("restore_failed");
	});

	it("prefers failure over a resume banner when both appear", () => {
		// A pane can show the attempt and then the error; the error wins.
		expect(
			classifyResume({
				paneText: "Resuming session sid-9\nError: could not resume session",
				fidelity: "exact",
				timedOut: false,
			}),
		).toBe("restore_failed");
	});

	it("prefers an empty-start banner over a resume banner", () => {
		expect(
			classifyResume({
				paneText: "Resuming session sid-9\nStarting a new session instead\n> ",
				fidelity: "exact",
				timedOut: false,
			}),
		).toBe("started_empty");
	});

	it("reports a timeout as unknown, never as success", () => {
		expect(
			classifyResume({ paneText: "", fidelity: "exact", timedOut: true }),
		).toBe("unknown_timeout");
	});

	it("reports unrecognised output as unknown rather than optimistic", () => {
		expect(
			classifyResume({
				paneText: `${ESC}[32m???${ESC}[0m`,
				fidelity: "exact",
				timedOut: false,
			}),
		).toBe("unknown_timeout");
	});

	it("matches a banner interrupted mid-phrase by ANSI escapes", () => {
		expect(
			classifyResume({
				paneText: `${ESC}[1mResuming ${ESC}[0m${ESC}[4msession${ESC}[0m abc123`,
				fidelity: "exact",
				timedOut: false,
			}),
		).toBe("restored");
	});

	it("stripping ANSI must not consume ordinary uppercase letters", () => {
		// Guard against an ANSI pattern missing its \x1B prefix: [@-Z] would then
		// eat capitals and silently break every banner match.
		expect(
			classifyResume({
				paneText: "ERROR: session ABC not found",
				fidelity: "exact",
				timedOut: false,
			}),
		).toBe("restore_failed");
	});
});

describe("resumeSpeak", () => {
	it("marks every phase except restored as unverified", () => {
		const unverified: ResumePhase[] = [
			"restored_last",
			"started_empty",
			"restore_failed",
			"unknown_timeout",
		];
		for (const phase of unverified) {
			expect(resumeSpeak(phase)).toContain("SARI");
		}
	});

	it("speaks restored without a warning marker", () => {
		expect(resumeSpeak("restored")).not.toContain("SARI");
	});

	it("uses proper Turkish characters in every phrase", () => {
		const all: ResumePhase[] = [
			"restored",
			"restored_last",
			"started_empty",
			"restore_failed",
			"unknown_timeout",
		];
		for (const phase of all) {
			const text = resumeSpeak(phase);
			expect(text.length).toBeGreaterThan(0);
			// No mojibake or ASCII-folded Turkish in operator-facing speech.
			expect(text).not.toMatch(/[?�]/);
		}
	});
});
