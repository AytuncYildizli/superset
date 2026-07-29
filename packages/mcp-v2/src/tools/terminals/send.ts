import { randomUUID } from "node:crypto";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { defineTool } from "../../define-tool";
import { hostServiceCall } from "../../host-service-client";

export function register(server: McpServer): void {
	defineTool(server, {
		name: "terminals_send",
		description: `Send a follow-up message into an existing terminal session using an evidence-bearing delivery receipt.

Call terminals_list first and bind the user's spoken request to one canonical hostId/workspaceId/terminalId. The host fails closed when a known agent prompt already contains text, suppresses duplicate retries, and uses an optimistic terminal revision guard.

The result's phase is authoritative:
- rejected_prompt_not_empty / rejected_revision_changed / duplicate_*: zero PTY writes occurred;
- injected: PTY input was written, but there is NO proof the agent processed it;
- working/completed/needs_input are only produced by terminals_await_delivery from host lifecycle evidence.

The legacy submitted field is deprecated. It means only that an Enter key was physically written; it NEVER means the agent processed or completed the instruction. After an injected receipt, call terminals_await_delivery with the returned deliveryId. Never say "sent", "delivered", "done", "gönderdim", "ilettim", or equivalent success language from submitted/injected alone. Reuse clientToken for transport retries. Set allowRepeat=true for an intentional repeated short answer such as "y", "1", or "devam".`,
		inputSchema: {
			hostId: z.string().describe("Host running the target terminal"),
			workspaceId: z.string().describe("Workspace that owns the terminal"),
			terminalId: z.string().describe("Existing terminal session id"),
			text: z.string().min(1).describe("Follow-up message to send"),
			submit: z
				.boolean()
				.default(true)
				.describe("Whether to press Enter after writing the message"),
			clientToken: z
				.string()
				.min(1)
				.max(200)
				.optional()
				.describe(
					"Stable idempotency token for retries of the same voice turn",
				),
			requireEmptyPrompt: z
				.boolean()
				.default(true)
				.describe(
					"Fail closed when a supported agent TUI already has staged prompt text",
				),
			allowRepeat: z
				.boolean()
				.default(false)
				.describe("Explicitly allow the same content inside the dedupe window"),
			expectRevision: z
				.number()
				.int()
				.nonnegative()
				.optional()
				.describe("Optional terminal revision from terminals_read"),
		},
		handler: async (input, ctx) =>
			hostServiceCall(
				{
					relayUrl: ctx.relayUrl,
					organizationId: ctx.organizationId,
					hostId: input.hostId,
					jwt: ctx.bearerToken,
				},
				"terminal.send",
				"mutation",
				{
					terminalId: input.terminalId,
					workspaceId: input.workspaceId,
					text: input.text,
					submit: input.submit,
					clientToken: input.clientToken ?? randomUUID(),
					requireEmptyPrompt: input.requireEmptyPrompt,
					allowRepeat: input.allowRepeat,
					...(input.expectRevision === undefined
						? {}
						: { expectRevision: input.expectRevision }),
				},
			),
	});
}
