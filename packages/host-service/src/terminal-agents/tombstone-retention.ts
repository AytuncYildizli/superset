/**
 * Retention policy for agent tombstones.
 *
 * Tombstones exist so a dead agent can be restarted with its prior context.
 * That is a short-lived affordance, not an audit log, so rows are bounded both
 * by age and by per-workspace count. The policy is a pure function so it can be
 * reviewed and tested without a database.
 */

export const TOMBSTONE_TTL_MS = 7 * 24 * 60 * 60 * 1000;
export const TOMBSTONE_MAX_PER_WORKSPACE = 20;

interface RetentionRow {
	id: string;
	workspaceId: string;
	exitedAt: number;
}

/**
 * Returns the ids of tombstones that should be deleted: anything past the TTL,
 * plus the oldest rows in any workspace holding more than the cap.
 *
 * Ids are de-duplicated, so a row that is both expired and over the cap is
 * reported once.
 */
export function selectExpiredTombstoneIds(
	rows: RetentionRow[],
	now: number,
): string[] {
	const doomed = new Set<string>();
	const byWorkspace = new Map<string, RetentionRow[]>();

	for (const row of rows) {
		if (now - row.exitedAt > TOMBSTONE_TTL_MS) {
			doomed.add(row.id);
			continue;
		}
		const bucket = byWorkspace.get(row.workspaceId);
		if (bucket) bucket.push(row);
		else byWorkspace.set(row.workspaceId, [row]);
	}

	for (const bucket of byWorkspace.values()) {
		if (bucket.length <= TOMBSTONE_MAX_PER_WORKSPACE) continue;
		// Newest first, then everything past the cap is dropped.
		bucket.sort((a, b) => b.exitedAt - a.exitedAt);
		for (const row of bucket.slice(TOMBSTONE_MAX_PER_WORKSPACE)) {
			doomed.add(row.id);
		}
	}

	return [...doomed];
}
