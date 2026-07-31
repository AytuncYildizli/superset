import type { Metadata } from "next";
import { YapitalismPage } from "./YapitalismPage";

export const metadata: Metadata = {
	title: "Yapitalism — Control coding agents by voice",
	description:
		"Choose, launch, redirect, and monitor coding agents from the GPT or Codex Voice conversation you already use.",
	alternates: { canonical: "/yapitalism" },
	openGraph: {
		title: "Yapitalism — Say it. The agents move.",
		description:
			"One voice conversation becomes the command layer for your coding-agent fleet.",
		url: "/yapitalism",
	},
	twitter: {
		card: "summary_large_image",
		title: "Yapitalism — Control coding agents by voice",
		description: "One mic. Your whole coding-agent fleet.",
	},
};

export default function Page() {
	return <YapitalismPage />;
}
