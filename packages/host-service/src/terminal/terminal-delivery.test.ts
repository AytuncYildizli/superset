import { describe, expect, it } from "bun:test";
import {
	classifyTerminalDelivery,
	detectTerminalPromptStatus,
	TerminalDeliveryLedger,
	type TerminalDeliveryPhase,
	type TerminalDeliveryRecord,
	terminalDeliverySpeak,
} from "./terminal-delivery";

function record(
	overrides: Partial<TerminalDeliveryRecord> = {},
): TerminalDeliveryRecord {
	return {
		deliveryId: "delivery-1",
		clientToken: "token-1",
		terminalId: "terminal-1",
		workspaceId: "workspace-1",
		textHash: "hash",
		createdAt: 1_000,
		injectedAt: 1_100,
		revisionBefore: 10,
		revisionAfter: 20,
		submitSent: true,
		runtime: "claude",
		stateBefore: "idle",
		lastEventAtBefore: 900,
		phase: "injected",
		...overrides,
	};
}

describe("terminal delivery contract", () => {
	it("detects only high-confidence staged agent prompts", () => {
		expect(
			detectTerminalPromptStatus(
				"output\n❯ yarım kalmış komut\nfooter",
				"claude",
			),
		).toBe("has_text");
		expect(detectTerminalPromptStatus("output\n❯   \nfooter", "claude")).toBe(
			"empty",
		);
		expect(
			detectTerminalPromptStatus("╭────╮\n│ ❯   │\n╰────╯", "claude"),
		).toBe("empty");
		expect(
			detectTerminalPromptStatus("╭────╮\n│ ❯ izin ver │\n╰────╯", "claude"),
		).toBe("has_text");
		expect(detectTerminalPromptStatus("$ echo risky", "shell")).toBe("unknown");
	});

	it("requires a lifecycle event newer than injection for working/completed", () => {
		const base = record();
		expect(
			classifyTerminalDelivery(base, {
				now: 2_000,
				revision: 30,
				promptStatus: "empty",
				state: "running",
				lastEventAt: 1_200,
				lastEventType: "Start",
			}),
		).toBe("working");
		expect(
			classifyTerminalDelivery(
				{ ...base, phase: "working" },
				{
					now: 2_000,
					revision: 35,
					promptStatus: "empty",
					state: "idle",
					lastEventAt: 1_300,
					lastEventType: "Stop",
				},
			),
		).toBe("completed");
		expect(
			classifyTerminalDelivery(base, {
				now: 2_000,
				revision: 35,
				promptStatus: "empty",
				state: "idle",
				lastEventAt: 1_300,
				lastEventType: "Stop",
			}),
		).toBe("unknown_timeout");
		expect(
			classifyTerminalDelivery(record({ stateBefore: "running" }), {
				now: 2_000,
				revision: 35,
				promptStatus: "empty",
				state: "idle",
				lastEventAt: 1_300,
				lastEventType: "Stop",
			}),
		).toBe("unknown_timeout");
		expect(
			classifyTerminalDelivery(base, {
				now: 2_000,
				revision: 40,
				promptStatus: "empty",
				state: "running",
				lastEventAt: 900,
				lastEventType: "Start",
			}),
		).toBe("unknown_timeout");
	});

	it("reports staged, needs-input, and exited without fake green", () => {
		const base = record();
		expect(
			classifyTerminalDelivery(base, {
				now: 2_000,
				revision: 20,
				promptStatus: "has_text",
				state: "idle",
			}),
		).toBe("staged");
		expect(
			classifyTerminalDelivery(base, {
				now: 2_000,
				revision: 30,
				promptStatus: "empty",
				state: "waiting_input",
				lastEventAt: 1_200,
				lastEventType: "PermissionRequest",
			}),
		).toBe("needs_input");
		expect(
			classifyTerminalDelivery(base, {
				now: 2_000,
				revision: 30,
				promptStatus: "unknown",
				state: "exited",
			}),
		).toBe("failed");
	});

	it("deduplicates transport tokens and repeated content without a second record", () => {
		const ledger = new TerminalDeliveryLedger();
		const input = {
			clientToken: "turn-1",
			terminalId: "terminal-1",
			workspaceId: "workspace-1",
			text: "same prompt",
			now: 1_000,
			revisionBefore: 10,
			submitSent: true,
			runtime: "claude" as const,
			stateBefore: "idle" as const,
			allowRepeat: false,
		};
		const first = ledger.prepare(input);
		expect(first.kind).toBe("new");
		const tokenRetry = ledger.prepare({ ...input, now: 1_100 });
		expect(tokenRetry.kind).toBe("duplicate");
		if (tokenRetry.kind === "duplicate") {
			expect(tokenRetry.phase).toBe("duplicate_ignored");
		}
		const contentRetry = ledger.prepare({
			...input,
			clientToken: "turn-2",
			now: 1_200,
		});
		expect(contentRetry.kind).toBe("duplicate");
		if (contentRetry.kind === "duplicate") {
			expect(contentRetry.phase).toBe("duplicate_suspected");
		}
		const repeatedAfterNewOutput = ledger.prepare({
			...input,
			clientToken: "turn-after-output",
			now: 1_250,
			revisionBefore: 11,
		});
		expect(repeatedAfterNewOutput.kind).toBe("new");
		const explicitRepeat = ledger.prepare({
			...input,
			clientToken: "turn-3",
			now: 1_300,
			allowRepeat: true,
		});
		expect(explicitRepeat.kind).toBe("new");
	});

	it("never uses success language for an unverified phase", () => {
		const unverified: TerminalDeliveryPhase[] = [
			"injected",
			"staged",
			"failed",
			"unknown_error",
			"unknown_timeout",
			"rejected_prompt_not_empty",
			"rejected_prompt_unreadable",
			"rejected_revision_changed",
			"duplicate_ignored",
			"duplicate_suspected",
		];
		for (const phase of unverified) {
			expect(
				terminalDeliverySpeak(phase).toLocaleLowerCase("tr-TR"),
			).not.toMatch(/gönderildi|iletildi|\bsent\b|delivered|\bbitti\b/u);
		}
	});
});
