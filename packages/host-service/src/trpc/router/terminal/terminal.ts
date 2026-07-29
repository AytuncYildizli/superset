import { TRPCError } from "@trpc/server";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { getSupervisor, waitForDaemonReady } from "../../../daemon";
import { terminalSessions, workspaces } from "../../../db/schema";
import {
	createTerminalSessionInternal,
	disposeSessionAndWait,
	disposeSessionsByWorkspaceId,
	disposeSessionsByWorktreePath,
	listWorkspaceTerminalSessions,
	parseThemeType,
	sessionHasRunningProcess,
	snapshotSession,
	writeFramedInputToSession,
	writeInputToSession,
} from "../../../terminal/terminal";
import {
	classifyTerminalDelivery,
	detectTerminalPromptStatus,
	TerminalDeliveryLedger,
	type TerminalDeliveryPhase,
	terminalDeliverySpeak,
} from "../../../terminal/terminal-delivery";
import { buildTerminalOperatorSession } from "../../../terminal-agents/operator-view";
import type { HostServiceContext } from "../../../types";
import { protectedProcedure, router } from "../../index";

function toTerminalIoError(message: string): TRPCError {
	if (message.includes("belong")) {
		return new TRPCError({ code: "FORBIDDEN", message });
	}
	if (
		message.includes("not found") ||
		message.includes("not active") ||
		message.includes("exited")
	) {
		return new TRPCError({ code: "NOT_FOUND", message });
	}
	return new TRPCError({ code: "INTERNAL_SERVER_ERROR", message });
}

const terminalDeliveryLedger = new TerminalDeliveryLedger();

async function readTerminalOperatorState(
	ctx: HostServiceContext,
	workspaceId: string,
	terminalId: string,
) {
	const summaries = await listWorkspaceTerminalSessions(ctx.db, workspaceId);
	const summary = summaries.find(
		(candidate) => candidate.terminalId === terminalId,
	);
	if (!summary) {
		throw new TRPCError({
			code: "NOT_FOUND",
			message: "Terminal session not found",
		});
	}
	const binding = ctx.terminalAgentStore?.get(terminalId);
	const operator = buildTerminalOperatorSession({
		summary,
		binding,
		hasRunningProcess: sessionHasRunningProcess(terminalId, workspaceId),
	});
	return { binding, operator };
}

function deliveryResponse(input: {
	deliveryId: string | null;
	terminalId: string;
	phase: TerminalDeliveryPhase;
	verified: boolean;
	submitSent: boolean;
	duplicate: boolean;
	revisionBefore: number;
	revisionAfter?: number;
	promptStatus: "empty" | "has_text" | "unknown";
	target: ReturnType<typeof buildTerminalOperatorSession>["agent"];
	elapsedMs?: number;
	state?: ReturnType<typeof buildTerminalOperatorSession>["state"];
	lastEventType?: string;
}) {
	return {
		deliveryId: input.deliveryId,
		terminalId: input.terminalId,
		phase: input.phase,
		verified: input.verified,
		submitSent: input.submitSent,
		// Backward compatibility only: this means an Enter was physically written.
		submitted: input.submitSent,
		duplicate: input.duplicate,
		revisionBefore: input.revisionBefore,
		...(input.revisionAfter === undefined
			? {}
			: { revisionAfter: input.revisionAfter }),
		promptStatus: input.promptStatus,
		target: input.target,
		speak: terminalDeliverySpeak(input.phase),
		...(input.elapsedMs === undefined ? {} : { elapsedMs: input.elapsedMs }),
		...(input.state === undefined ? {} : { state: input.state }),
		...(input.lastEventType === undefined
			? {}
			: { lastEventType: input.lastEventType }),
	};
}

const createSessionInputSchema = z.object({
	workspaceId: z.string(),
	terminalId: z.string().optional(),
	initialCommand: z.string().trim().min(1).optional(),
	cwd: z.string().optional(),
	themeType: z.string().optional(),
	cols: z.number().int().positive().optional(),
	rows: z.number().int().positive().optional(),
});

async function createTerminalSessionFromInput({
	ctx,
	input,
}: {
	ctx: HostServiceContext;
	input: z.infer<typeof createSessionInputSchema>;
}) {
	const terminalId = input.terminalId ?? crypto.randomUUID();
	const result = await createTerminalSessionInternal({
		terminalId,
		workspaceId: input.workspaceId,
		themeType: parseThemeType(input.themeType),
		db: ctx.db,
		eventBus: ctx.eventBus,
		initialCommand: input.initialCommand,
		cwd: input.cwd,
		cols: input.cols,
		rows: input.rows,
	});

	if ("error" in result) {
		throw new TRPCError({
			code: "INTERNAL_SERVER_ERROR",
			message: result.error,
		});
	}

	return {
		terminalId: result.terminalId,
		status: "active" as const,
	};
}

// Daemon control surface — sibling to the per-workspace terminal ops above.
// Org-scoped (one daemon per host-service); org id comes from request ctx
// rather than env so this module can be imported in tests where env vars
// aren't set.
// Supervisor lives in this same process so calls go through the in-process
// singleton, not over the wire.
const daemonRouter = router({
	getUpdateStatus: protectedProcedure.query(({ ctx }) =>
		getSupervisor().getUpdateStatus(ctx.organizationId),
	),

	/**
	 * Whether the daemon is still answering, and for how long it hasn't.
	 * Deliberately does not `waitForDaemonReady` — this is polled by the
	 * terminal UI to decide whether a stall is worth surfacing, so it has to
	 * answer immediately rather than block on the thing that may be wedged.
	 */
	getHealth: protectedProcedure.query(({ ctx }) =>
		getSupervisor().getHealth(ctx.organizationId),
	),

	listSessions: protectedProcedure.query(async ({ ctx }) => {
		// Wait for the bootstrap so the supervisor has a socket path.
		await waitForDaemonReady(ctx.organizationId);
		return getSupervisor().listSessions(ctx.organizationId);
	}),

	restart: protectedProcedure.mutation(async ({ ctx }) => {
		await waitForDaemonReady(ctx.organizationId);
		return getSupervisor().restart(ctx.organizationId);
	}),

	/**
	 * Phase 2: hand off live PTYs to a successor daemon binary.
	 *
	 * Sessions survive on success — the kernel master fds are inherited by
	 * the new daemon process via stdio. The renderer surfaces this as the
	 * "Update" path (vs `restart` which kills sessions). On failure, the
	 * UI offers force-restart as a fallback.
	 */
	update: protectedProcedure.mutation(async ({ ctx }) => {
		await waitForDaemonReady(ctx.organizationId);
		return getSupervisor().update(ctx.organizationId);
	}),
});

export const terminalRouter = router({
	createSession: protectedProcedure
		.input(createSessionInputSchema)
		.mutation(createTerminalSessionFromInput),

	launchSession: protectedProcedure
		.input(
			createSessionInputSchema.extend({
				initialCommand: z.string().trim().min(1),
			}),
		)
		.mutation(createTerminalSessionFromInput),

	listSessions: protectedProcedure
		.input(
			z.object({
				workspaceId: z.string(),
			}),
		)
		.query(async ({ ctx, input }) => {
			const summaries = await listWorkspaceTerminalSessions(
				ctx.db,
				input.workspaceId,
			);
			const bindings = new Map(
				ctx.terminalAgentStore
					.listByWorkspace(input.workspaceId)
					.map((binding) => [binding.terminalId, binding]),
			);
			return {
				sessions: summaries.map((summary) =>
					buildTerminalOperatorSession({
						summary,
						binding: bindings.get(summary.terminalId),
						hasRunningProcess: sessionHasRunningProcess(
							summary.terminalId,
							input.workspaceId,
						),
					}),
				),
			};
		}),

	countBackgroundSessions: protectedProcedure
		.input(
			z.object({
				workspaceId: z.string(),
				attachedTerminalIds: z.array(z.string()).default([]),
			}),
		)
		.query(async ({ ctx, input }) => {
			const sessions = await listWorkspaceTerminalSessions(
				ctx.db,
				input.workspaceId,
			);
			const attached = new Set(input.attachedTerminalIds);
			return {
				count: sessions.filter((session) => !attached.has(session.terminalId))
					.length,
			};
		}),

	hasRunningProcess: protectedProcedure
		.input(
			z.object({
				terminalId: z.string(),
				workspaceId: z.string(),
			}),
		)
		.query(({ input }) => ({
			running: sessionHasRunningProcess(input.terminalId, input.workspaceId),
		})),

	writeInput: protectedProcedure
		.input(
			z.object({
				terminalId: z.string(),
				workspaceId: z.string(),
				data: z.string(),
			}),
		)
		.mutation(({ input }) => {
			const result = writeInputToSession(input);
			if ("error" in result) {
				throw new TRPCError({
					code: "NOT_FOUND",
					message: result.error,
				});
			}
			return { success: true as const };
		}),

	// Send a follow-up message into an already-running terminal. This path is
	// fail-closed: it guards an occupied prompt, suppresses retries, and returns
	// an evidence-bearing delivery id instead of treating PTY injection as success.
	send: protectedProcedure
		.input(
			z.object({
				terminalId: z.string(),
				workspaceId: z.string(),
				text: z.string().min(1),
				submit: z.boolean().default(true),
				clientToken: z.string().min(1).max(200).optional(),
				requireEmptyPrompt: z.boolean().default(false),
				allowRepeat: z.boolean().default(false),
				expectRevision: z.number().int().nonnegative().optional(),
			}),
		)
		.mutation(async ({ ctx, input }) => {
			const before = await snapshotSession({
				terminalId: input.terminalId,
				workspaceId: input.workspaceId,
				db: ctx.db,
				eventBus: ctx.eventBus,
			});
			if ("error" in before) throw toTerminalIoError(before.error);
			const { binding, operator } = await readTerminalOperatorState(
				ctx,
				input.workspaceId,
				input.terminalId,
			);
			const promptStatus = detectTerminalPromptStatus(
				before.text,
				operator.agent.runtime,
			);
			const knownAgentRuntime =
				operator.agent.runtime === "claude" ||
				operator.agent.runtime === "codex" ||
				operator.agent.runtime === "kimi";
			if (
				input.requireEmptyPrompt &&
				(promptStatus === "has_text" ||
					(promptStatus === "unknown" && knownAgentRuntime))
			) {
				return deliveryResponse({
					deliveryId: null,
					terminalId: input.terminalId,
					phase:
						promptStatus === "has_text"
							? "rejected_prompt_not_empty"
							: "rejected_prompt_unreadable",
					verified: false,
					submitSent: false,
					duplicate: false,
					revisionBefore: before.revision,
					promptStatus,
					target: operator.agent,
					state: operator.state,
				});
			}

			const prepared = terminalDeliveryLedger.prepare({
				clientToken: input.clientToken ?? crypto.randomUUID(),
				terminalId: input.terminalId,
				workspaceId: input.workspaceId,
				text: input.text,
				now: Date.now(),
				revisionBefore: before.revision,
				submitSent: input.submit,
				runtime: operator.agent.runtime,
				stateBefore: operator.state,
				...(binding?.lastEventAt === undefined
					? {}
					: { lastEventAtBefore: binding.lastEventAt }),
				// Preserve legacy tRPC behavior: content dedupe is opt-in through a
				// caller-supplied idempotency token. MCP always supplies one.
				allowRepeat: input.allowRepeat || input.clientToken === undefined,
			});
			if (prepared.kind === "duplicate") {
				return deliveryResponse({
					deliveryId: prepared.record.deliveryId,
					terminalId: input.terminalId,
					phase: prepared.phase,
					verified: false,
					submitSent: false,
					duplicate: true,
					revisionBefore: before.revision,
					promptStatus,
					target: operator.agent,
					state: operator.state,
				});
			}

			const result = await writeFramedInputToSession({
				terminalId: input.terminalId,
				workspaceId: input.workspaceId,
				text: input.text,
				submit: input.submit,
				expectRevision: input.expectRevision,
				db: ctx.db,
				eventBus: ctx.eventBus,
			});
			if ("error" in result) {
				terminalDeliveryLedger.remove(prepared.record.deliveryId);
				if (result.error.includes("revision changed")) {
					return deliveryResponse({
						deliveryId: null,
						terminalId: input.terminalId,
						phase: "rejected_revision_changed",
						verified: false,
						submitSent: false,
						duplicate: false,
						revisionBefore: before.revision,
						promptStatus,
						target: operator.agent,
						state: operator.state,
					});
				}
				throw toTerminalIoError(result.error);
			}
			terminalDeliveryLedger.markInjected(prepared.record.deliveryId, {
				now: Date.now(),
				revisionAfter: result.revisionAfter,
			});
			return deliveryResponse({
				deliveryId: prepared.record.deliveryId,
				terminalId: input.terminalId,
				phase: "injected",
				verified: false,
				submitSent: result.submitSent,
				duplicate: false,
				revisionBefore: result.revisionBefore,
				revisionAfter: result.revisionAfter,
				promptStatus,
				target: operator.agent,
				state: operator.state,
			});
		}),

	awaitDelivery: protectedProcedure
		.input(
			z.object({
				deliveryId: z.string().uuid(),
				terminalId: z.string(),
				workspaceId: z.string(),
				timeoutMs: z.number().int().min(250).max(30_000).default(8_000),
			}),
		)
		.query(async ({ ctx, input }) => {
			const record = terminalDeliveryLedger.get(input.deliveryId);
			if (
				!record ||
				record.terminalId !== input.terminalId ||
				record.workspaceId !== input.workspaceId
			) {
				return deliveryResponse({
					deliveryId: input.deliveryId,
					terminalId: input.terminalId,
					phase: "unknown_timeout",
					verified: false,
					submitSent: false,
					duplicate: false,
					revisionBefore: 0,
					promptStatus: "unknown",
					target: { runtime: "unknown" },
					state: "idle",
				});
			}
			const startedAt = Date.now();
			let phase: TerminalDeliveryPhase = "unknown_timeout";
			let promptStatus: "empty" | "has_text" | "unknown" = "unknown";
			let revision = record.revisionAfter ?? record.revisionBefore;
			let operatorState = record.stateBefore;
			let lastEventType: string | undefined;
			while (Date.now() - startedAt <= input.timeoutMs) {
				const snapshot = await snapshotSession({
					terminalId: input.terminalId,
					workspaceId: input.workspaceId,
					db: ctx.db,
					eventBus: ctx.eventBus,
				});
				if ("error" in snapshot) {
					phase = "unknown_error";
					break;
				}
				const { binding, operator } = await readTerminalOperatorState(
					ctx,
					input.workspaceId,
					input.terminalId,
				);
				revision = snapshot.revision;
				operatorState = operator.state;
				lastEventType = binding?.lastEventType;
				promptStatus = detectTerminalPromptStatus(
					snapshot.text,
					record.runtime,
				);
				phase = classifyTerminalDelivery(record, {
					now: Date.now(),
					revision,
					promptStatus,
					state: operator.state,
					...(binding?.lastEventAt === undefined
						? {}
						: { lastEventAt: binding.lastEventAt }),
					...(lastEventType === undefined ? {} : { lastEventType }),
				});
				if (
					phase === "working" ||
					phase === "completed" ||
					phase === "needs_input" ||
					phase === "failed" ||
					phase === "unknown_error"
				) {
					break;
				}
				await new Promise((resolve) => setTimeout(resolve, 300));
			}
			terminalDeliveryLedger.markPhase(input.deliveryId, phase);
			return deliveryResponse({
				deliveryId: input.deliveryId,
				terminalId: input.terminalId,
				phase,
				verified:
					phase === "working" ||
					phase === "completed" ||
					phase === "needs_input",
				submitSent: record.submitSent,
				duplicate: false,
				revisionBefore: record.revisionBefore,
				revisionAfter: revision,
				promptStatus,
				target: { runtime: record.runtime },
				elapsedMs: Date.now() - startedAt,
				state: operatorState,
				...(lastEventType === undefined ? {} : { lastEventType }),
			});
		}),

	// Non-destructive snapshot of the terminal's current screen + recent
	// scrollback, read off the per-session headless emulator.
	snapshot: protectedProcedure
		.input(
			z.object({
				terminalId: z.string(),
				workspaceId: z.string(),
				maxLines: z.number().int().positive().optional(),
			}),
		)
		.query(async ({ ctx, input }) => {
			const result = await snapshotSession({
				...input,
				db: ctx.db,
				eventBus: ctx.eventBus,
			});
			if ("error" in result) {
				throw toTerminalIoError(result.error);
			}
			const { success: _success, ...snapshot } = result;
			return { terminalId: input.terminalId, ...snapshot };
		}),

	killSession: protectedProcedure
		.input(
			z.object({
				terminalId: z.string(),
				workspaceId: z.string(),
			}),
		)
		.mutation(async ({ ctx, input }) => {
			const workspace = ctx.db.query.workspaces
				.findFirst({ where: eq(workspaces.id, input.workspaceId) })
				.sync();

			if (!workspace) {
				throw new TRPCError({
					code: "NOT_FOUND",
					message: "Workspace not found",
				});
			}

			const session = ctx.db.query.terminalSessions
				.findFirst({ where: eq(terminalSessions.id, input.terminalId) })
				.sync();

			if (!session) {
				throw new TRPCError({
					code: "NOT_FOUND",
					message: "Terminal session not found",
				});
			}

			if (session.originWorkspaceId !== input.workspaceId) {
				throw new TRPCError({
					code: "FORBIDDEN",
					message: "Terminal session does not belong to this workspace",
				});
			}

			await disposeSessionAndWait(input.terminalId, ctx.db);
			ctx.terminalAgentStore.markTerminalExited(input.terminalId);
			return { terminalId: input.terminalId, status: "disposed" as const };
		}),

	// Kill every session (including backgrounded, renderer-detached ones) for a
	// workspace. Called by delete paths that don't run the full
	// workspaceCleanup.destroy, so their terminals don't leak in the daemon.
	disposeWorkspaceSessions: protectedProcedure
		.input(z.object({ workspaceId: z.string() }))
		.mutation(({ ctx, input }) =>
			disposeSessionsByWorkspaceId(input.workspaceId, ctx.db),
		),

	// Like disposeWorkspaceSessions but for a closed worktree, which no longer
	// has a workspace id — resolve sessions through the shared worktree path.
	disposeWorktreeSessions: protectedProcedure
		.input(z.object({ worktreePath: z.string() }))
		.mutation(({ ctx, input }) =>
			disposeSessionsByWorktreePath(input.worktreePath, ctx.db),
		),

	daemon: daemonRouter,
});
