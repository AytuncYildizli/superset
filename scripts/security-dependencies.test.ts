import { expect, test } from "bun:test";
import { createRequire } from "node:module";

const root = new URL("../", import.meta.url);
const lock = Bun.JSONC.parse(
	await Bun.file(new URL("bun.lock", root)).text(),
) as {
	packages: Record<string, [string, ...unknown[]]>;
};

// Inspect package descriptors, not just keys: Bun stores nested dependencies
// under aliases such as @react-email/preview-server/next and miniflare/sharp.
test("security lockfile: every Next and sharp resolution meets the patch floor", () => {
	const versions = Object.entries(lock.packages).flatMap(
		([alias, [descriptor]]) => {
			const match = /^(next|sharp)@(\d+)\.(\d+)\.(\d+)$/.exec(descriptor);
			if (!match) return [];
			const [, name, major, minor, patch] = match;
			return [
				{
					alias,
					name,
					major: Number(major),
					minor: Number(minor),
					patch: Number(patch),
				},
			];
		},
	);
	expect(versions.some((entry) => entry.name === "next")).toBe(true);
	expect(versions.some((entry) => entry.name === "sharp")).toBe(true);
	for (const entry of versions) {
		if (entry.name === "next") {
			expect(entry.major, entry.alias).toBe(16);
			expect(
				entry.minor > 4 || (entry.minor === 4 && entry.patch >= 1),
				entry.alias,
			).toBe(true);
		} else {
			expect(
				entry.major > 0 ||
					entry.minor > 35 ||
					(entry.minor === 35 && entry.patch >= 5),
				entry.alias,
			).toBe(true);
		}
	}
});

test("email preview resolves the patched Next runtime", () => {
	const email = createRequire(new URL("packages/email/package.json", root));
	const preview = createRequire(email.resolve("@react-email/preview-server"));
	expect(preview("next/package.json").version).toBe("16.4.1");
	// Load the actual server entry, not only its manifest.
	expect(typeof preview("next")).toBe("function");
});

test("patched sharp runs native resize and PNG/JPEG/WebP codecs", async () => {
	const web = createRequire(new URL("apps/web/package.json", root));
	const sharp = web("sharp");
	expect(web("sharp/package.json").version).toBe("0.35.5");
	for (const format of ["png", "jpeg", "webp"] as const) {
		const image = await sharp({
			create: {
				width: 8,
				height: 8,
				channels: 3,
				background: { r: 10, g: 20, b: 30 },
			},
		})
			.resize(4, 4)
			.toFormat(format)
			.toBuffer();
		const metadata = await sharp(image).metadata();
		expect(metadata.width).toBe(4);
		expect(metadata.height).toBe(4);
		expect(metadata.format).toBe(format);
	}
});
