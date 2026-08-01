import type { Metadata } from "next";
import { YapitalismPage } from "./YapitalismPage";

export const metadata: Metadata = {
	title: "Yapitalism | Control coding agents by voice",
	description:
		"Start and steer coding agents from the GPT or Codex Voice conversation you already use.",
	alternates: { canonical: "/yapitalism" },
	openGraph: {
		title: "Yapitalism for GPT and Codex Voice",
		description:
			"Start Codex, redirect Claude, and ask Kimi what changed without switching tabs.",
		url: "/yapitalism",
	},
	twitter: {
		card: "summary_large_image",
		title: "Yapitalism for GPT and Codex Voice",
		description: "Control live coding-agent sessions from one conversation.",
	},
};

export default function Page() {
	return <YapitalismPage />;
}
