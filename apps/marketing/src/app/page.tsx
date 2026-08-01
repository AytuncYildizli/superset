import type { Metadata } from "next";
import { YapitalismPage } from "./yapitalism/YapitalismPage";

export const metadata: Metadata = {
	title: { absolute: "Yapitalism | Control coding agents by voice" },
	description:
		"Start and steer Codex, Claude, Kimi, and the rest of your coding-agent fleet from GPT or Codex Voice.",
	alternates: { canonical: "/" },
	manifest: "/yapitalism/manifest.webmanifest",
	icons: { icon: "/yapitalism-icon.svg" },
	openGraph: {
		title: "Yapitalism for GPT and Codex Voice",
		description:
			"Tell coding agents what to do, redirect them, and ask what changed without switching tabs.",
		url: "/",
		images: ["/yapitalism/opengraph-image"],
	},
	twitter: {
		card: "summary_large_image",
		title: "Yapitalism for GPT and Codex Voice",
		description: "Control live coding-agent sessions from one conversation.",
		images: ["/yapitalism/opengraph-image"],
	},
};

export default function Home() {
	return <YapitalismPage />;
}
