import type { Metadata } from "next";
import { YapitalismPage } from "./YapitalismPage";

export const metadata: Metadata = {
	title: { absolute: "Yapitalism | Control coding agents by voice" },
	description:
		"Start and steer coding agents from the GPT or Codex Voice conversation you already use.",
	alternates: { canonical: "/yapitalism" },
	manifest: "/yapitalism/manifest.webmanifest",
	icons: { icon: "/yapitalism-icon.svg" },
	openGraph: {
		title: "Yapitalism for GPT and Codex Voice",
		description:
			"Start Codex, redirect Claude, and ask Kimi what changed without switching tabs.",
		url: "/yapitalism",
		images: ["/yapitalism/opengraph-image"],
	},
	twitter: {
		card: "summary_large_image",
		title: "Yapitalism for GPT and Codex Voice",
		description: "Control live coding-agent sessions from one conversation.",
		images: ["/yapitalism/opengraph-image"],
	},
};

export default function Page() {
	return <YapitalismPage />;
}
