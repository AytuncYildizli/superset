import { createHash, randomUUID } from "node:crypto";
import type { TerminalRuntime } from "../terminal-agents/operator-view";

export type TerminalPromptStatus = "empty" | "has_text" | "unknown";
export type TerminalDeliveryPhase =
	| "injected"
	| "staged"
	| "working"
	| "needs_input"
	| "completed"
	| "failed"
	| "unknown_error"
	| "unknown_timeout"
	| "rejected_prompt_not_empty"
	| "rejected_prompt_unreadable"
	| "rejected_revision_changed"
	| "duplicate_ignored"
	| "duplicate_suspected";

export interface TerminalDeliveryRecord {
	deliveryId: string;
	clientToken: string;
	terminalId: string;
	workspaceId: string;
	textHash: string;
	createdAt: number;
	injectedAt?: number;
	revisionBefore: number;
	revisionAfter?: number;
	submitSent: boolean;
	runtime: TerminalRuntime;
	stateBefore: "running" | "idle" | "waiting_input" | "exited";
	lastEventAtBefore?: number;
	phase: TerminalDeliveryPhase;
}

export interface TerminalDeliveryObservation {
	now: number;
	revision: number;
	promptStatus: TerminalPromptStatus;
	state: "running" | "idle" | "waiting_input" | "exited";
	lastEventAt?: number;
	lastEventType?: string;
}

const WAITING_INPUT_EVENTS = new Set([
	"PermissionRequest",
	"permission",
	"waiting_input",
	"AskUserQuestion",
]);
const COMPLETED_EVENTS = new Set(["Stop", "SessionEnd", "idle"]);
function cleanLine(line: string): string {
	return line
		.replace(/\u00a0/g, " ")
		.replace(/^\s*[│┃|]\s*/u, "")
		.replace(/\s*[│┃|]\s*$/u, "")
		.trimEnd();
}

export function detectTerminalPromptStatus(
	text: string,
	runtime: TerminalRuntime,
): TerminalPromptStatus {
	if (runtime !== "claude" && runtime !== "codex" && runtime !== "kimi") {
		return "unknown";
	}
	const promptPattern =
		runtime === "claude"
			? /^\s*❯\s*(.*)$/u
			: runtime === "codex"
				? /^\s*[›>]\s*(.*)$/u
				: /^\s*>\s*(.*)$/u;
	const lines = text.split("\n").map(cleanLine);
	for (
		let index = lines.length - 1;
		index >= Math.max(0, lines.length - 16);
		index--
	) {
		const match = lines[index]?.match(promptPattern);
		if (!match) continue;
		const body = match[1]?.trim();
		if (!body) return "empty";
		// An agent's own placeholder suggestion is not staged input. Codex renders a
		// rotating hint inside an EMPTY composer, and treating it as text made every
		// such terminal permanently unwritable: `terminal.send` refused
		// rejected_prompt_not_empty, and clearing the prompt could not help because
		// there was nothing in it to clear.
		//
		// Measured 2026-08-05 on an idle pane showing "Improve documentation in
		// @filename": the line survived a kill-line untouched, and a client that
		// judged it empty delivered successfully with the agent echoing a canary.
		if (isPlaceholderSuggestion(body, runtime)) return "empty";
		return "has_text";
	}
	return "unknown";
}

/**
 * Placeholder text a runtime draws inside an empty composer.
 *
 * Matched whole, case-insensitively, so a prompt that merely STARTS with one of
 * these - somebody typing over the hint - is still `has_text`. Erring toward
 * `has_text` is the safe direction: a false `empty` lets a write append to real
 * staged input and submit the merge.
 */
function isPlaceholderSuggestion(
	body: string,
	runtime: TerminalRuntime,
): boolean {
	const placeholders = PROMPT_PLACEHOLDERS[runtime];
	if (!placeholders) return false;
	const lowered = body.toLowerCase();
	return placeholders.some((placeholder) => placeholder === lowered);
}

const PROMPT_PLACEHOLDERS: Partial<Record<TerminalRuntime, string[]>> = {
	codex: [
		"use /skills to list available skills",
		"explain this codebase",
		// The @filename suggestions rotate; the token is literal on screen.
		"improve documentation in @filename",
		"find and fix a bug in @filename",
		"write tests for @filename",
	],
	// Empty because nothing has been observed, not because these draw none. An
	// unobserved hint reads as `has_text` and over-refuses, which is the direction
	// that cannot corrupt anybody's text.
	claude: [],
	kimi: [],
};

export function hashTerminalPrompt(text: string): string {
	return createHash("sha256").update(text.trim()).digest("hex");
}

export function classifyTerminalDelivery(
	record: TerminalDeliveryRecord,
	observation: TerminalDeliveryObservation,
): TerminalDeliveryPhase {
	if (observation.state === "exited") return "failed";
	// A lifecycle event observed after injecting into an already-running agent may
	// belong to the previous turn. Without a correlated hook event id, fail closed.
	if (record.stateBefore === "running") return "unknown_timeout";
	const hasNewLifecycleEvent =
		record.injectedAt !== undefined &&
		observation.lastEventAt !== undefined &&
		observation.lastEventAt > record.injectedAt &&
		observation.lastEventAt !== record.lastEventAtBefore;
	if (hasNewLifecycleEvent) {
		if (
			observation.lastEventType &&
			WAITING_INPUT_EVENTS.has(observation.lastEventType)
		) {
			return "needs_input";
		}
		if (
			observation.lastEventType &&
			COMPLETED_EVENTS.has(observation.lastEventType)
		) {
			// A direct idle→completed jump can be a stale Stop hook. Require a prior
			// await call to have observed and recorded working for this delivery.
			return record.phase === "working" ? "completed" : "unknown_timeout";
		}
		return "working";
	}
	if (observation.promptStatus === "has_text") return "staged";
	return "unknown_timeout";
}

export function terminalDeliverySpeak(phase: TerminalDeliveryPhase): string {
	switch (phase) {
		case "working":
			return "Ajan aldı, çalışıyor.";
		case "completed":
			return "Ajan tamamladı.";
		case "needs_input":
			return "Ajan kullanıcı girdisi veya izin bekliyor.";
		case "staged":
			return "SARI: Metin prompt alanında kaldı; ajan işlemedi.";
		case "rejected_prompt_not_empty":
			return "Prompt alanında bekleyen metin var; hiçbir şey yazmadım.";
		case "rejected_prompt_unreadable":
			return "Prompt alanını güvenle okuyamadım; hiçbir şey yazmadım.";
		case "duplicate_ignored":
		case "duplicate_suspected":
			return "Aynı mesajın tekrarını engelledim; ikinci kez yazmadım.";
		case "failed":
			return "Terminal kapandı; işlem doğrulanmadı.";
		case "unknown_error":
			return "SARI: Terminal kanıtı okunamadı; işlem doğrulanmadı.";
		case "rejected_revision_changed":
			return "Terminal değişti; körlemesine yazmadım.";
		case "injected":
			return "PTY girdisi yazıldı; ajan işleme kanıtı henüz yok.";
		case "unknown_timeout":
			return "SARI: Ajanın işlediğini doğrulayamadım.";
	}
}

export class TerminalDeliveryLedger {
	private readonly records = new Map<string, TerminalDeliveryRecord>();
	private readonly byToken = new Map<string, string>();
	private readonly recentContent = new Map<string, string>();

	constructor(
		private readonly ttlMs = 10 * 60_000,
		private readonly contentDedupeMs = 20_000,
		private readonly maxPerTerminal = 64,
	) {}

	prepare(input: {
		clientToken: string;
		terminalId: string;
		workspaceId: string;
		text: string;
		now: number;
		revisionBefore: number;
		submitSent: boolean;
		runtime: TerminalRuntime;
		stateBefore: TerminalDeliveryRecord["stateBefore"];
		lastEventAtBefore?: number;
		allowRepeat: boolean;
	}):
		| { kind: "new"; record: TerminalDeliveryRecord }
		| {
				kind: "duplicate";
				record: TerminalDeliveryRecord;
				phase: "duplicate_ignored" | "duplicate_suspected";
		  } {
		this.prune(input.now);
		const tokenKey = `${input.terminalId}:${input.clientToken}`;
		const existingId = this.byToken.get(tokenKey);
		const existing = existingId ? this.records.get(existingId) : undefined;
		if (existing) {
			return {
				kind: "duplicate",
				record: existing,
				phase: "duplicate_ignored",
			};
		}
		const textHash = hashTerminalPrompt(input.text);
		const contentKey = `${input.terminalId}:${textHash}`;
		const recentId = this.recentContent.get(contentKey);
		const recent = recentId ? this.records.get(recentId) : undefined;
		if (
			recent &&
			!input.allowRepeat &&
			recent.revisionBefore === input.revisionBefore &&
			input.now - recent.createdAt <= this.contentDedupeMs
		) {
			return {
				kind: "duplicate",
				record: recent,
				phase: "duplicate_suspected",
			};
		}
		const record: TerminalDeliveryRecord = {
			deliveryId: randomUUID(),
			clientToken: input.clientToken,
			terminalId: input.terminalId,
			workspaceId: input.workspaceId,
			textHash,
			createdAt: input.now,
			revisionBefore: input.revisionBefore,
			submitSent: input.submitSent,
			runtime: input.runtime,
			stateBefore: input.stateBefore,
			...(input.lastEventAtBefore === undefined
				? {}
				: { lastEventAtBefore: input.lastEventAtBefore }),
			phase: "injected",
		};
		this.records.set(record.deliveryId, record);
		this.byToken.set(tokenKey, record.deliveryId);
		this.recentContent.set(contentKey, record.deliveryId);
		this.enforceTerminalCap(input.terminalId);
		return { kind: "new", record };
	}

	markInjected(
		deliveryId: string,
		input: { now: number; revisionAfter: number },
	): void {
		const record = this.records.get(deliveryId);
		if (!record) return;
		record.injectedAt = input.now;
		record.revisionAfter = input.revisionAfter;
		record.phase = "injected";
	}

	markPhase(deliveryId: string, phase: TerminalDeliveryPhase): void {
		const record = this.records.get(deliveryId);
		if (record) record.phase = phase;
	}

	remove(deliveryId: string): void {
		const record = this.records.get(deliveryId);
		if (!record) return;
		this.records.delete(deliveryId);
		this.byToken.delete(`${record.terminalId}:${record.clientToken}`);
		const contentKey = `${record.terminalId}:${record.textHash}`;
		if (this.recentContent.get(contentKey) === deliveryId) {
			this.recentContent.delete(contentKey);
		}
	}

	get(deliveryId: string): TerminalDeliveryRecord | undefined {
		return this.records.get(deliveryId);
	}

	private prune(now: number): void {
		for (const record of this.records.values()) {
			if (now - record.createdAt > this.ttlMs) this.remove(record.deliveryId);
		}
	}

	private enforceTerminalCap(terminalId: string): void {
		const records = [...this.records.values()]
			.filter((record) => record.terminalId === terminalId)
			.sort((left, right) => left.createdAt - right.createdAt);
		while (records.length > this.maxPerTerminal) {
			const oldest = records.shift();
			if (oldest) this.remove(oldest.deliveryId);
		}
	}
}
