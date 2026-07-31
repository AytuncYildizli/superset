import { randomUUID } from "node:crypto";
import type { AgentDefinitionId } from "@superset/shared/agent-catalog";
import { eq, inArray } from "drizzle-orm";
import type { HostDb } from "../db";
import { terminalAgentTombstones } from "../db/schema";
import { runtimeFromBinding } from "./operator-view";
import { selectExpiredTombstoneIds } from "./tombstone-retention";
import type { TerminalAgentBinding, TerminalAgentId } from "./types";

/**
 * The last-known state of an agent binding, captured immediately before the
 * binding is deleted on exit. `agentSessionId` and `launchCommand` are the
 * resume-critical fields: once the binding row is gone they cannot be
 * reconstructed from anywhere else.
 */
export interface AgentTombstoneRow {
	id: string;
	workspaceId: string;
	terminalId: string;
	agentId: TerminalAgentId;
	agentSessionId: string | null;
	definitionId: AgentDefinitionId | null;
	presetId: string | null;
	label: string | null;
	launchCommand: string | null;
	runtime: string;
	startedAt: number;
	exitedAt: number;
}

/**
 * Projects a live binding onto a tombstone row. Optional binding fields are
 * `undefined`; the database columns are nullable, so they are normalised to
 * `null` here rather than at each call site.
 */
export function tombstoneFromBinding(
	binding: TerminalAgentBinding,
	runtime: string,
	exitedAt: number,
	id: string,
): AgentTombstoneRow {
	return {
		id,
		workspaceId: binding.workspaceId,
		terminalId: binding.terminalId,
		agentId: binding.agentId,
		agentSessionId: binding.agentSessionId ?? null,
		definitionId: binding.definitionId ?? null,
		presetId: binding.presetId ?? null,
		label: binding.label ?? null,
		launchCommand: binding.launchCommand ?? null,
		runtime,
		startedAt: binding.startedAt,
		exitedAt,
	};
}

/**
 * The narrow surface `TerminalAgentStore` depends on. Keeping it to a single
 * binding-shaped method means the store needs no id generation, no clock, and
 * no runtime-mapping import — so it stays free of a dependency on
 * `operator-view` (which type-imports the terminal module).
 */
export interface AgentTombstoneSink {
	recordExit(binding: TerminalAgentBinding, exitedAt: number): void;
}

export interface AgentTombstonePersistence extends AgentTombstoneSink {
	record(row: AgentTombstoneRow): void;
	listByWorkspace(workspaceId: string): AgentTombstoneRow[];
	get(id: string): AgentTombstoneRow | null;
	prune(now: number): number;
}

export class SqliteAgentTombstoneStore implements AgentTombstonePersistence {
	#db: HostDb;

	constructor(db: HostDb) {
		this.#db = db;
	}

	recordExit(binding: TerminalAgentBinding, exitedAt: number): void {
		this.record(
			tombstoneFromBinding(
				binding,
				runtimeFromBinding(binding),
				exitedAt,
				randomUUID(),
			),
		);
	}

	record(row: AgentTombstoneRow): void {
		// A tombstone is written once per exit. Re-recording the same id is a
		// no-op rather than an error so a retried exit path cannot throw.
		this.#db
			.insert(terminalAgentTombstones)
			.values(row)
			.onConflictDoNothing()
			.run();
	}

	listByWorkspace(workspaceId: string): AgentTombstoneRow[] {
		return this.#db
			.select()
			.from(terminalAgentTombstones)
			.where(eq(terminalAgentTombstones.workspaceId, workspaceId))
			.all() as AgentTombstoneRow[];
	}

	get(id: string): AgentTombstoneRow | null {
		const rows = this.#db
			.select()
			.from(terminalAgentTombstones)
			.where(eq(terminalAgentTombstones.id, id))
			.all() as AgentTombstoneRow[];
		return rows[0] ?? null;
	}

	prune(now: number): number {
		const rows = this.#db
			.select({
				id: terminalAgentTombstones.id,
				workspaceId: terminalAgentTombstones.workspaceId,
				exitedAt: terminalAgentTombstones.exitedAt,
			})
			.from(terminalAgentTombstones)
			.all();
		const doomed = selectExpiredTombstoneIds(rows, now);
		if (doomed.length === 0) return 0;
		this.#db
			.delete(terminalAgentTombstones)
			.where(inArray(terminalAgentTombstones.id, doomed))
			.run();
		return doomed.length;
	}
}
