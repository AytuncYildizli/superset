export interface VoiceTargetCandidate {
	hostId: string;
	workspaceId: string;
	workspaceName: string;
	terminalId?: string;
	runtime?: string;
	label?: string;
}

export interface RankedVoiceTarget extends VoiceTargetCandidate {
	canonicalName: string;
	score: number;
}

const PHRASE_ALIASES: Array<[RegExp, string]> = [
	[/\bsuper\s*set\b/gu, "superset"],
	[/\bkahve\s*tabela\b/gu, "kahvetabela"],
	[/\b(?:cloud|clod|klaud)\b/gu, "claude"],
	[/\b(?:kodeks|code\s*x)\b/gu, "codex"],
	[/\bkimmy\b/gu, "kimi"],
	[/\bglamma\b/gu, "glama"],
	[/\bm\s*c\s*p\b/gu, "mcp"],
];

export function normalizeVoiceTarget(value: string): string {
	let normalized = value
		.normalize("NFKD")
		.replace(/\p{M}/gu, "")
		.toLocaleLowerCase("tr-TR")
		.replace(/ı/gu, "i")
		.replace(/[^a-z0-9]+/gu, " ")
		.trim();
	for (const [pattern, replacement] of PHRASE_ALIASES) {
		normalized = normalized.replace(pattern, replacement);
	}
	return normalized.replace(/\s+/gu, " ").trim();
}

function levenshtein(left: string, right: string): number {
	const previous = Array.from(
		{ length: right.length + 1 },
		(_, index) => index,
	);
	for (let leftIndex = 1; leftIndex <= left.length; leftIndex++) {
		let diagonal = previous[0] ?? 0;
		previous[0] = leftIndex;
		for (let rightIndex = 1; rightIndex <= right.length; rightIndex++) {
			const above = previous[rightIndex] ?? rightIndex;
			previous[rightIndex] = Math.min(
				(previous[rightIndex] ?? rightIndex) + 1,
				(previous[rightIndex - 1] ?? leftIndex) + 1,
				diagonal + (left[leftIndex - 1] === right[rightIndex - 1] ? 0 : 1),
			);
			diagonal = above;
		}
	}
	return previous[right.length] ?? 0;
}

function scoreText(query: string, candidate: string): number {
	if (!query || !candidate) return 0;
	if (query === candidate) return 1;
	if (candidate.includes(query) || query.includes(candidate)) return 0.9;
	const queryTokens = new Set(query.split(" "));
	const candidateTokens = new Set(candidate.split(" "));
	const intersection = [...queryTokens].filter((token) =>
		candidateTokens.has(token),
	);
	const union = new Set([...queryTokens, ...candidateTokens]);
	const tokenScore = union.size === 0 ? 0 : intersection.length / union.size;
	const maxLength = Math.max(query.length, candidate.length);
	const editScore =
		maxLength === 0 ? 1 : 1 - levenshtein(query, candidate) / maxLength;
	return Math.max(tokenScore, editScore * 0.8);
}

export function rankVoiceTargets(
	query: string,
	candidates: VoiceTargetCandidate[],
): { candidates: RankedVoiceTarget[]; ambiguous: boolean } {
	const normalizedQuery = normalizeVoiceTarget(query);
	const ranked = candidates
		.map((candidate) => {
			const canonicalName = candidate.terminalId
				? `${candidate.workspaceName} > ${candidate.label ?? candidate.runtime ?? "terminal"}`
				: candidate.workspaceName;
			const workspaceName = normalizeVoiceTarget(candidate.workspaceName);
			const descriptor = normalizeVoiceTarget(
				candidate.label ?? candidate.runtime ?? "",
			);
			const canonical = normalizeVoiceTarget(canonicalName);
			const score = candidate.terminalId
				? Math.max(
						scoreText(normalizedQuery, canonical),
						scoreText(normalizedQuery, descriptor) * 0.92,
						scoreText(normalizedQuery, workspaceName) * 0.88,
					)
				: scoreText(normalizedQuery, workspaceName);
			return {
				...candidate,
				canonicalName,
				score: Number(score.toFixed(4)),
			};
		})
		.sort((left, right) => right.score - left.score);
	const top = ranked[0]?.score ?? 0;
	const second = ranked[1]?.score ?? 0;
	return {
		candidates: ranked,
		ambiguous: top < 0.45 || (ranked.length > 1 && top - second < 0.08),
	};
}
