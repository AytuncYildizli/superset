export function GET() {
	return Response.json(
		{
			name: "Yapitalism",
			short_name: "Yapitalism",
			description:
				"Control live coding-agent sessions from GPT or Codex Voice.",
			start_url: "/",
			display: "standalone",
			background_color: "#f4efe6",
			theme_color: "#11150f",
			icons: [
				{
					src: "/yapitalism-icon.svg",
					sizes: "any",
					type: "image/svg+xml",
					purpose: "any maskable",
				},
			],
		},
		{
			headers: {
				"Cache-Control": "public, max-age=3600, stale-while-revalidate=86400",
				"Content-Type": "application/manifest+json",
			},
		},
	);
}
