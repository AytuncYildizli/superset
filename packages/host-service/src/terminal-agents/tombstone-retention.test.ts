import { expect, test } from "bun:test";
import {
	selectExpiredTombstoneIds,
	TOMBSTONE_MAX_PER_WORKSPACE,
	TOMBSTONE_TTL_MS,
} from "./tombstone-retention";

const NOW = 1_800_000_000_000;

test("rows inside the ttl and under the cap are kept", () => {
	const rows = [{ id: "a", workspaceId: "w1", exitedAt: NOW - 1000 }];
	expect(selectExpiredTombstoneIds(rows, NOW)).toEqual([]);
});

test("rows older than the ttl are selected for pruning", () => {
	const rows = [
		{ id: "old", workspaceId: "w1", exitedAt: NOW - TOMBSTONE_TTL_MS - 1 },
		{ id: "new", workspaceId: "w1", exitedAt: NOW - 1000 },
	];
	expect(selectExpiredTombstoneIds(rows, NOW)).toEqual(["old"]);
});

test("beyond the per-workspace cap the oldest rows are pruned first", () => {
	const rows = Array.from(
		{ length: TOMBSTONE_MAX_PER_WORKSPACE + 3 },
		(_, i) => ({
			id: `r${i}`,
			workspaceId: "w1",
			exitedAt: NOW - (i + 1) * 1000,
		}),
	);
	const pruned = selectExpiredTombstoneIds(rows, NOW);
	expect(pruned.length).toBe(3);
	// Highest index == oldest exitedAt.
	expect(pruned).toContain(`r${TOMBSTONE_MAX_PER_WORKSPACE + 2}`);
	expect(pruned).not.toContain("r0");
});

test("the cap is applied per workspace, not globally", () => {
	const rows = [
		...Array.from({ length: TOMBSTONE_MAX_PER_WORKSPACE }, (_, i) => ({
			id: `w1-${i}`,
			workspaceId: "w1",
			exitedAt: NOW - (i + 1) * 1000,
		})),
		...Array.from({ length: TOMBSTONE_MAX_PER_WORKSPACE }, (_, i) => ({
			id: `w2-${i}`,
			workspaceId: "w2",
			exitedAt: NOW - (i + 1) * 1000,
		})),
	];
	expect(selectExpiredTombstoneIds(rows, NOW)).toEqual([]);
});

test("a row is reported once even when both expired and over the cap", () => {
	const rows = Array.from(
		{ length: TOMBSTONE_MAX_PER_WORKSPACE + 2 },
		(_, i) => ({
			id: `r${i}`,
			workspaceId: "w1",
			exitedAt: NOW - TOMBSTONE_TTL_MS - (i + 1),
		}),
	);
	const pruned = selectExpiredTombstoneIds(rows, NOW);
	expect(new Set(pruned).size).toBe(pruned.length);
});
