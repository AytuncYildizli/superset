import { Database } from "bun:sqlite";
import { describe, expect, it } from "bun:test";
import { resolve } from "node:path";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/bun-sqlite";
import { migrate } from "drizzle-orm/bun-sqlite/migrator";
import type { HostDb } from "../db";
import * as schema from "../db/schema";
import {
	terminalAgentBindings,
	terminalAgentTombstones,
	terminalSessions,
} from "../db/schema";
import { TerminalAgentStore } from "./store";
import {
	type AgentTombstoneSink,
	SqliteAgentTombstoneStore,
	tombstoneFromBinding,
} from "./tombstone-store";
import type { TerminalAgentBinding } from "./types";

const MIGRATIONS_FOLDER = resolve(import.meta.dir, "../../drizzle");

function createTestDb(): HostDb {
	const sqlite = new Database(":memory:");
	// Foreign keys are OFF by default in SQLite. They must be ON here or the
	// cascade this table exists to escape would never fire, making the
	// survives-deletion test below vacuous.
	sqlite.run("PRAGMA foreign_keys = ON");
	const db = drizzle(sqlite, { schema });
	migrate(db, { migrationsFolder: MIGRATIONS_FOLDER });
	// bun:sqlite's drizzle type differs from the better-sqlite3-based HostDb,
	// but the query surface used here is identical (same cast as other tests).
	return db as unknown as HostDb;
}

const BINDING: TerminalAgentBinding = {
	terminalId: "term-1",
	workspaceId: "w1",
	agentId: "kimi" as TerminalAgentBinding["agentId"],
	agentSessionId: "sess-abc",
	presetId: "preset-1",
	label: "kimi ana",
	launchCommand: "kimi -m kimi-code/k3",
	startedAt: 1_700_000_000_000,
	lastEventAt: 1_700_000_100_000,
	lastEventType: "Exited",
};

function seedBoundSession(db: HostDb): void {
	// originWorkspaceId is left null on purpose: it is a FK to `workspaces`, and
	// foreign keys are ON in this test. The cascade under test is
	// terminal_agent_bindings.terminal_id -> terminal_sessions.id, which does not
	// need an origin workspace. The binding's own workspaceId is plain text.
	db.insert(terminalSessions)
		.values({
			id: "term-1",
			status: "running",
			originWorkspaceId: null,
			createdAt: 1,
		})
		.run();
	db.insert(terminalAgentBindings)
		.values({
			terminalId: BINDING.terminalId,
			workspaceId: BINDING.workspaceId,
			agentId: BINDING.agentId,
			agentSessionId: BINDING.agentSessionId,
			presetId: BINDING.presetId,
			label: BINDING.label,
			launchCommand: BINDING.launchCommand,
			startedAt: BINDING.startedAt,
			lastEventAt: BINDING.lastEventAt,
			lastEventType: BINDING.lastEventType,
		})
		.run();
}

describe("tombstoneFromBinding", () => {
	it("preserves the resume-critical fields", () => {
		const row = tombstoneFromBinding(
			BINDING,
			"kimi",
			1_700_000_200_000,
			"tomb-1",
		);
		expect(row.agentSessionId).toBe("sess-abc");
		expect(row.launchCommand).toBe("kimi -m kimi-code/k3");
		expect(row.runtime).toBe("kimi");
		expect(row.exitedAt).toBe(1_700_000_200_000);
		expect(row.terminalId).toBe("term-1");
	});

	it("maps absent optional fields to null rather than undefined", () => {
		const bare: TerminalAgentBinding = {
			terminalId: "term-2",
			workspaceId: "w1",
			agentId: BINDING.agentId,
			startedAt: 1,
			lastEventAt: 2,
			lastEventType: "Exited",
		};
		const row = tombstoneFromBinding(bare, "shell", 3, "tomb-2");
		expect(row.agentSessionId).toBe(null);
		expect(row.launchCommand).toBe(null);
		expect(row.presetId).toBe(null);
	});
});

describe("SqliteAgentTombstoneStore", () => {
	it("reads back a recorded tombstone by workspace", () => {
		const store = new SqliteAgentTombstoneStore(createTestDb());
		store.record(
			tombstoneFromBinding(BINDING, "kimi", 1_700_000_200_000, "tomb-1"),
		);
		const rows = store.listByWorkspace("w1");
		expect(rows).toHaveLength(1);
		expect(rows[0]?.agentSessionId).toBe("sess-abc");
		expect(rows[0]?.launchCommand).toBe("kimi -m kimi-code/k3");
	});

	it("reads back a recorded tombstone by id", () => {
		const store = new SqliteAgentTombstoneStore(createTestDb());
		store.record(
			tombstoneFromBinding(BINDING, "kimi", 1_700_000_200_000, "tomb-1"),
		);
		expect(store.get("tomb-1")?.runtime).toBe("kimi");
		expect(store.get("missing")).toBe(null);
	});

	it("survives the cascade that deletes the binding with its terminal session", () => {
		const db = createTestDb();
		const store = new SqliteAgentTombstoneStore(db);
		seedBoundSession(db);
		store.record(
			tombstoneFromBinding(BINDING, "kimi", 1_700_000_200_000, "tomb-1"),
		);

		db.delete(terminalSessions).where(eq(terminalSessions.id, "term-1")).run();

		// The binding is cascade-deleted; this is exactly why the tombstone table
		// carries no foreign key to terminal_sessions.
		const bindings = db
			.select()
			.from(terminalAgentBindings)
			.where(eq(terminalAgentBindings.terminalId, "term-1"))
			.all();
		expect(bindings).toHaveLength(0);
		expect(store.listByWorkspace("w1")).toHaveLength(1);
		expect(store.get("tomb-1")?.agentSessionId).toBe("sess-abc");
	});

	it("recording the same id twice does not throw or duplicate", () => {
		const store = new SqliteAgentTombstoneStore(createTestDb());
		const row = tombstoneFromBinding(
			BINDING,
			"kimi",
			1_700_000_200_000,
			"tomb-1",
		);
		store.record(row);
		store.record(row);
		expect(store.listByWorkspace("w1")).toHaveLength(1);
	});

	it("prune removes rows past the ttl and reports the count", () => {
		const db = createTestDb();
		const store = new SqliteAgentTombstoneStore(db);
		store.record(tombstoneFromBinding(BINDING, "kimi", 1_000, "old"));
		expect(store.prune(1_000 + 8 * 24 * 60 * 60 * 1000)).toBe(1);
		expect(store.listByWorkspace("w1")).toHaveLength(0);
	});

	it("prune keeps rows inside the ttl and reports zero", () => {
		const db = createTestDb();
		const store = new SqliteAgentTombstoneStore(db);
		store.record(tombstoneFromBinding(BINDING, "kimi", 1_000, "fresh"));
		expect(store.prune(2_000)).toBe(0);
		expect(db.select().from(terminalAgentTombstones).all()).toHaveLength(1);
	});
});

describe("TerminalAgentStore tombstone capture", () => {
	function attachKimi(store: TerminalAgentStore): void {
		store.recordEvent({
			terminalId: "t1",
			workspaceId: "w1",
			eventType: "Attached",
			agentId: "kimi" as TerminalAgentBinding["agentId"],
			agentSessionId: "s1",
			launchCommand: "kimi -m kimi-code/k3",
			occurredAt: 100,
		});
	}

	it("captures a tombstone when the agent exits", () => {
		const tombstones = new SqliteAgentTombstoneStore(createTestDb());
		const store = new TerminalAgentStore(undefined, tombstones);
		attachKimi(store);
		store.recordEvent({
			terminalId: "t1",
			workspaceId: "w1",
			eventType: "exit",
			occurredAt: 200,
		});

		const rows = tombstones.listByWorkspace("w1");
		expect(rows).toHaveLength(1);
		expect(rows[0]?.agentSessionId).toBe("s1");
		expect(rows[0]?.launchCommand).toBe("kimi -m kimi-code/k3");
		expect(rows[0]?.runtime).toBe("kimi");
		// The binding itself is gone; only the tombstone remains.
		expect(store.get("t1")).toBeUndefined();
	});

	it("captures a tombstone via markTerminalExited", () => {
		const tombstones = new SqliteAgentTombstoneStore(createTestDb());
		const store = new TerminalAgentStore(undefined, tombstones);
		attachKimi(store);
		store.markTerminalExited("t1");
		expect(tombstones.listByWorkspace("w1")).toHaveLength(1);
	});

	it("records nothing for a terminal that never had a binding", () => {
		const tombstones = new SqliteAgentTombstoneStore(createTestDb());
		const store = new TerminalAgentStore(undefined, tombstones);
		store.markTerminalExited("never-existed");
		expect(tombstones.listByWorkspace("w1")).toHaveLength(0);
	});

	it("works with no sink configured", () => {
		const store = new TerminalAgentStore();
		attachKimi(store);
		expect(() => store.markTerminalExited("t1")).not.toThrow();
		expect(store.get("t1")).toBeUndefined();
	});

	it("a throwing sink does not block terminal teardown", () => {
		const exploding: AgentTombstoneSink = {
			recordExit() {
				throw new Error("disk on fire");
			},
		};
		const store = new TerminalAgentStore(undefined, exploding);
		attachKimi(store);
		expect(() => store.markTerminalExited("t1")).not.toThrow();
		expect(store.get("t1")).toBeUndefined();
	});
});
