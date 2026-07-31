"use client";

import { ArrowDown, Mic2 } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import styles from "./yapitalism.module.css";

type ModeKey = "one" | "crew" | "fleet";

const MODES: Record<
	ModeKey,
	{
		label: string;
		title: string;
		description: string;
		voice: string;
		system: string;
		agents: Array<{ name: string; job: string; status: string }>;
	}
> = {
	one: {
		label: "One agent",
		title: "Direct the specialist",
		description:
			"Choose one configured coding agent, launch it in the right workspace, then keep talking into the same live session.",
		voice: "Open checkout. Start Codex on the login bug.",
		system: "Target resolved · Codex session launched · Terminal ready",
		agents: [
			{ name: "CODEX", job: "Fixing checkout login", status: "RUNNING" },
		],
	},
	crew: {
		label: "The crew",
		title: "Run Goblin Mode",
		description:
			"Split work across several live agents. Switch targets, send follow-ups, and ask what changed without leaving the conversation.",
		voice:
			"Codex fixes checkout. Claude reviews tests. Kimi maps the migration.",
		system:
			"3 targets resolved · 3 agent sessions live · Follow-up channel open",
		agents: [
			{ name: "CODEX", job: "Fixing checkout", status: "CODING" },
			{ name: "CLAUDE", job: "Reviewing tests", status: "READING" },
			{ name: "KIMI", job: "Mapping migration", status: "SCANNING" },
		],
	},
	fleet: {
		label: "The fleet",
		title: "Command the runtime",
		description:
			"Resolve hosts and workspaces, operate agent sessions, and run, pause, or resume automations by voice. Risky actions keep their approval gates.",
		voice: "Run the release audit on Studio. Pause nightly after this pass.",
		system:
			"Studio resolved · Audit running · Pause queued behind approval gate",
		agents: [
			{ name: "STUDIO", job: "Release audit", status: "RUNNING" },
			{ name: "NIGHTLY", job: "Automation", status: "GATED" },
		],
	},
};

const STEPS = [
	{
		number: "01",
		title: "You speak",
		copy: "Use the GPT or Codex Voice conversation already in your hand.",
	},
	{
		number: "02",
		title: "Yapitalism resolves",
		copy: "Superset MCP identifies the host, workspace, agent, task, or live terminal you mean.",
	},
	{
		number: "03",
		title: "Agents move",
		copy: "Sessions launch, work splits, terminals receive follow-ups, and automations run.",
	},
	{
		number: "04",
		title: "You stay in control",
		copy: "Redirect the work, inspect state, or stop at an approval gate without changing interfaces.",
	},
];

const WAVEFORM = [
	28, 46, 72, 38, 64, 82, 45, 76, 34, 58, 88, 52, 68, 40, 79, 48, 62, 35, 73,
	55, 84, 43, 66, 31,
].map((height, position) => ({ id: `wave-${position + 1}`, height }));

export function YapitalismPage() {
	const [mode, setMode] = useState<ModeKey>("crew");
	const selected = MODES[mode];

	return (
		<main className={styles.yapitalism}>
			<section className={styles.hero}>
				<div className={styles.heroCopy}>
					<div className={styles.brandLine}>
						<span>YAPITALISM™</span>
						<span>VOICE COMMAND FOR CODING AGENTS</span>
					</div>
					<p className={styles.eyebrow}>
						THE CONTROL SURFACE IS THE CONVERSATION
					</p>
					<h1>
						SAY IT.
						<br />
						THE AGENTS
						<br />
						<em>MOVE.</em>
					</h1>
					<p className={styles.lede}>
						Choose an agent, launch the job, send follow-ups, and command the
						whole fleet from the voice app you already use.
					</p>
					<div className={styles.actions}>
						<a className={styles.primaryAction} href="#control-modes">
							<Mic2 aria-hidden="true" size={20} /> Take the mic
						</a>
						<a className={styles.secondaryAction} href="#voice-loop">
							See the voice loop <ArrowDown aria-hidden="true" size={18} />
						</a>
					</div>
					<p className={styles.punchline}>ONE MIC. INFINITE INTERNS.</p>
				</div>

				<div className={styles.commandStage} id="voice-loop">
					<div className={styles.commandHeader}>
						<span>LIVE VOICE LOOP</span>
						<span className={styles.liveDot}>LIVE</span>
					</div>
					<div className={styles.voiceMessage}>
						<div className={styles.micBadge}>
							<Mic2 aria-hidden="true" size={22} />
						</div>
						<div>
							<span>YOU · VOICE</span>
							<strong>“{selected.voice}”</strong>
						</div>
					</div>
					<div className={styles.waveform} aria-hidden="true">
						{WAVEFORM.map((bar, index) => (
							<i
								key={bar.id}
								style={{
									height: `${bar.height}%`,
									animationDelay: `${index * -45}ms`,
								}}
							/>
						))}
					</div>
					<div className={styles.systemLine}>{selected.system}</div>
					<div className={styles.agentStack}>
						{selected.agents.map((agent, index) => (
							<div className={styles.agentRow} key={agent.name}>
								<span className={styles.agentIndex}>0{index + 1}</span>
								<div>
									<strong>{agent.name}</strong>
									<span>{agent.job}</span>
								</div>
								<b>{agent.status}</b>
							</div>
						))}
					</div>
					<div className={styles.followUp}>
						<span>FOLLOW-UP</span>
						“Tell Codex to keep going. What did Claude find?”
					</div>
				</div>
			</section>

			<section className={styles.modeSection} id="control-modes">
				<div className={styles.sectionIntro}>
					<p>VOICE COMMAND MODES</p>
					<h2>HOW MUCH OF THE CREW DO YOU WANT ON THE MIC?</h2>
				</div>
				<div
					className={styles.modeSelector}
					role="tablist"
					aria-label="Voice command mode"
				>
					{(Object.keys(MODES) as ModeKey[]).map((key, index) => (
						<button
							aria-selected={mode === key}
							className={styles.modeButton}
							data-mode={key}
							key={key}
							onClick={() => setMode(key)}
							role="tab"
							type="button"
						>
							<span>0{index + 1}</span>
							<strong>{MODES[key].label}</strong>
						</button>
					))}
				</div>
				<div className={styles.modeDetail}>
					<div>
						<span>SELECTED · {selected.label.toUpperCase()}</span>
						<h3>{selected.title}</h3>
					</div>
					<p>{selected.description}</p>
				</div>
			</section>

			<section className={styles.stepsSection}>
				<div className={styles.sectionIntro}>
					<p>WHAT HAPPENS WHEN YOU SPEAK</p>
					<h2>VOICE IN. AGENT WORK OUT.</h2>
				</div>
				<div className={styles.steps}>
					{STEPS.map((step) => (
						<article key={step.number}>
							<span>{step.number}</span>
							<h3>{step.title}</h3>
							<p>{step.copy}</p>
						</article>
					))}
				</div>
			</section>

			<section className={styles.stackSection}>
				<div>
					<p className={styles.eyebrow}>
						THE BRAND STACK, WITHOUT THE BULLSHIT
					</p>
					<h2>YAPITALISM IS THE PRODUCT.</h2>
				</div>
				<ul>
					<li>
						<strong>Goblin Mode</strong>
						<span>Multi-agent voice control</span>
					</li>
					<li>
						<strong>Superset MCP</strong>
						<span>The backend adapter</span>
					</li>
					<li>
						<strong>RelayProof</strong>
						<span>Background delivery reliability</span>
					</li>
				</ul>
				<Link className={styles.betaAction} href="/contact">
					Request private beta →
				</Link>
			</section>
		</main>
	);
}
