import { describe, expect, it } from "bun:test";
import { redactSensitiveText } from "./sensitive-text";

describe("redactSensitiveText", () => {
	it("redacts assignments, CLI flags, bearer tokens, provider keys, and JWTs", () => {
		const input = [
			"API_KEY=super-secret-value",
			"--token tok_123456789012345",
			"Authorization: Bearer abc.def-123",
			"sk-abcdefghijklmnop",
			"eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjMifQ.signature_value",
		].join("\n");

		const redacted = redactSensitiveText(input);
		expect(redacted).not.toContain("super-secret-value");
		expect(redacted).not.toContain("tok_123456789012345");
		expect(redacted).not.toContain("abc.def-123");
		expect(redacted).not.toContain("abcdefghijklmnop");
		expect(redacted).not.toContain("eyJhbGciOiJIUzI1NiJ9");
		expect(redacted).toContain("[REDACTED]");
	});

	it("leaves ordinary terminal output intact", () => {
		expect(redactSensitiveText("tests passed: 42\nclaude is idle")).toBe(
			"tests passed: 42\nclaude is idle",
		);
	});
});
