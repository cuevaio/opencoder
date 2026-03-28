import { createFileRoute, Link } from "@tanstack/react-router";
import {
	ArrowRight,
	CheckCircle2,
	Clock3,
	GitBranch,
	Github,
	Sparkles,
	Terminal,
} from "lucide-react";
import { AppHeader } from "#/components/app-header.tsx";
import { Wordmark } from "#/components/logo.tsx";
import { authClient } from "#/lib/auth-client.ts";

const heroStats = [
	{
		label: "Context",
		value: "Repository-aware answers",
	},
	{
		label: "Visibility",
		value: "Live tool and edit stream",
	},
	{
		label: "Continuity",
		value: "Persistent multi-turn sessions",
	},
] as const;

const featureHighlights = [
	{
		icon: GitBranch,
		title: "Repository-aware context",
		description:
			"Point the agent at any repository you can access and keep work scoped to your branch.",
	},
	{
		icon: Terminal,
		title: "Transparent execution",
		description:
			"See each tool call, file edit, and reasoning update as it happens in the browser.",
	},
	{
		icon: Clock3,
		title: "Session continuity",
		description:
			"Resume conversations later, ask follow-ups, and iterate until the change is ready to ship.",
	},
] as const;

const workflowSteps = [
	{
		icon: Github,
		title: "Connect GitHub",
		description: "Choose the repository and branch you want to work on.",
	},
	{
		icon: Sparkles,
		title: "Describe the task",
		description:
			"Ask for bug fixes, feature work, refactors, or codebase walkthroughs.",
	},
	{
		icon: CheckCircle2,
		title: "Review and ship",
		description:
			"Inspect streamed output, verify changes, and move forward with confidence.",
	},
] as const;

type TimelineState = "done" | "running" | "queued";

const timelineDotClass: Record<TimelineState, string> = {
	done: "bg-emerald-500/80",
	running: "bg-amber-500 animate-pulse",
	queued: "bg-muted-foreground/35",
};

const liveSessionTimeline: Array<{
	label: string;
	time: string;
	state: TimelineState;
}> = [
	{
		label: "Map repository structure",
		time: "00:03",
		state: "done",
	},
	{
		label: "Update worker retry strategy",
		time: "00:11",
		state: "running",
	},
	{
		label: "Run targeted tests",
		time: "queued",
		state: "queued",
	},
];

const liveSessionTags = [
	"bun run test -- src/lib/session-converter.test.ts",
	"edit src/trigger/session-runner.ts",
	"prepare PR summary",
] as const;

export const Route = createFileRoute("/")({
	component: HomePage,
});

function HomePage() {
	const { data: session } = authClient.useSession();
	const variant = session ? "authed" : "public";

	return (
		<div className="app-shell flex flex-col bg-background text-foreground">
			<AppHeader variant={variant} />

			<main className="relative flex-1 overflow-hidden">
				<div
					className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-[34rem]"
					style={{
						background:
							"radial-gradient(120% 70% at 18% 6%, color-mix(in oklab, var(--accent) 42%, transparent), transparent 62%), radial-gradient(70% 55% at 85% 10%, color-mix(in oklab, var(--foreground) 8%, transparent), transparent 64%)",
					}}
				/>

				<section className="app-container grid gap-10 py-14 sm:py-20 lg:grid-cols-[1.1fr_0.9fr] lg:items-center lg:py-24">
					<div className="animate-in fade-in-0 slide-in-from-bottom-5 duration-700">
						<p className="inline-flex w-fit items-center gap-2 rounded-full border border-border/80 bg-background/80 px-3 py-1 text-[11px] font-medium tracking-[0.17em] text-muted-foreground uppercase">
							<Sparkles className="h-3.5 w-3.5" />
							AI coding sessions for GitHub repositories
						</p>
						<div className="mt-5 space-y-5">
							<Wordmark size={34} />
							<h1 className="max-w-2xl text-[clamp(2.15rem,5.2vw,4.1rem)] font-semibold leading-[1.02] tracking-tight">
								From prompt to pull request, with every file change streamed in
								real time.
							</h1>
							<p className="max-w-xl text-base leading-relaxed text-muted-foreground sm:text-lg">
								Ask questions, fix bugs, and ship features without leaving your
								browser. opencoder keeps repository context, tool output, and
								session history in one place.
							</p>
						</div>

						<div className="mt-8 flex flex-wrap items-center gap-3">
							{session ? (
								<Link
									to="/chat"
									className="group inline-flex min-h-[48px] items-center gap-2 rounded-md bg-foreground px-5 py-3 text-sm font-semibold text-background transition-opacity hover:opacity-90 press-scale"
								>
									Open Chat
									<ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
								</Link>
							) : (
								<Link
									to="/sign-in"
									className="group inline-flex min-h-[48px] items-center gap-2 rounded-md bg-foreground px-5 py-3 text-sm font-semibold text-background transition-opacity hover:opacity-90 press-scale"
								>
									Start with GitHub
									<ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
								</Link>
							)}
							<a
								href="https://github.com/cuevaio/opencoder"
								target="_blank"
								rel="noopener noreferrer"
								className="inline-flex min-h-[48px] items-center gap-2 rounded-md border border-border bg-background/70 px-5 py-3 text-sm font-semibold text-foreground transition-colors hover:bg-muted press-scale"
							>
								<Github className="h-4 w-4" />
								View GitHub
							</a>
						</div>

						<dl className="mt-8 grid gap-3 sm:grid-cols-3">
							{heroStats.map((stat) => (
								<div
									key={stat.label}
									className="rounded-xl border border-border/80 bg-background/70 p-3 backdrop-blur"
								>
									<dt className="text-[11px] font-medium tracking-[0.14em] text-muted-foreground uppercase">
										{stat.label}
									</dt>
									<dd className="mt-1 text-sm font-medium leading-snug">
										{stat.value}
									</dd>
								</div>
							))}
						</dl>
					</div>

					<div className="animate-in fade-in-0 slide-in-from-bottom-7 duration-700 lg:justify-self-end">
						<div className="surface-panel relative overflow-hidden rounded-2xl p-4 sm:p-6">
							<div className="pointer-events-none absolute inset-x-0 top-0 h-28 bg-gradient-to-b from-accent/30 to-transparent" />
							<div className="relative">
								<div className="flex items-start justify-between gap-3">
									<div>
										<p className="font-mono text-[11px] tracking-[0.18em] text-muted-foreground uppercase">
											Live Session
										</p>
										<p className="mt-1 text-sm font-semibold">
											Add retry logic to GitHub sync worker
										</p>
									</div>
									<span className="inline-flex items-center gap-1.5 rounded-full border border-border/75 bg-background/85 px-2.5 py-1 text-[11px] font-medium text-muted-foreground">
										<span className="h-2 w-2 rounded-full bg-emerald-500/80" />
										streaming
									</span>
								</div>

								<ul className="mt-5 space-y-2">
									{liveSessionTimeline.map((item) => (
										<li
											key={item.label}
											className="flex items-center justify-between rounded-lg border border-border/70 bg-background/60 px-3 py-2"
										>
											<div className="flex min-w-0 items-center gap-2.5">
												<span
													className={`h-2.5 w-2.5 shrink-0 rounded-full ${timelineDotClass[item.state]}`}
												/>
												<span className="truncate text-sm">{item.label}</span>
											</div>
											<span className="pl-3 font-mono text-[11px] text-muted-foreground">
												{item.time}
											</span>
										</li>
									))}
								</ul>

								<div className="mt-5 flex flex-wrap gap-2">
									{liveSessionTags.map((tag) => (
										<span
											key={tag}
											className="rounded-md border border-border/70 bg-background/80 px-2 py-1 font-mono text-[11px] text-muted-foreground"
										>
											{tag}
										</span>
									))}
								</div>
							</div>
						</div>
					</div>
				</section>

				<section className="app-container pb-16 sm:pb-24">
					<div className="max-w-2xl animate-in fade-in-0 slide-in-from-bottom-3 duration-700">
						<p className="text-[11px] font-medium tracking-[0.16em] text-muted-foreground uppercase">
							Built for real coding work
						</p>
						<h2 className="mt-3 text-2xl font-semibold tracking-tight sm:text-3xl">
							The context, feedback, and control loop your team expects.
						</h2>
					</div>

					<div className="mt-8 grid gap-4 md:grid-cols-3">
						{featureHighlights.map((feature) => (
							<div
								key={feature.title}
								className="rounded-2xl border border-border/80 bg-surface-1/70 p-5"
							>
								<feature.icon className="h-5 w-5 text-foreground" />
								<h3 className="mt-4 text-base font-semibold">
									{feature.title}
								</h3>
								<p className="mt-2 text-sm leading-relaxed text-muted-foreground">
									{feature.description}
								</p>
							</div>
						))}
					</div>

					<div className="mt-10 rounded-2xl border border-border/80 bg-surface-1/80 p-5 sm:p-8">
						<div className="flex flex-wrap items-center justify-between gap-3">
							<h3 className="text-xl font-semibold tracking-tight">
								How teams ship with opencoder
							</h3>
							{session ? (
								<Link
									to="/chat"
									className="inline-flex items-center gap-2 rounded-md border border-border bg-background px-3 py-2 text-sm font-medium hover:bg-muted press-scale"
								>
									Continue session
									<ArrowRight className="h-4 w-4" />
								</Link>
							) : (
								<Link
									to="/sign-in"
									className="inline-flex items-center gap-2 rounded-md border border-border bg-background px-3 py-2 text-sm font-medium hover:bg-muted press-scale"
								>
									Sign in to start
									<ArrowRight className="h-4 w-4" />
								</Link>
							)}
						</div>

						<div className="mt-6 grid gap-3 md:grid-cols-3">
							{workflowSteps.map((step, index) => (
								<div
									key={step.title}
									className="rounded-xl border border-border/70 bg-background/65 p-4"
								>
									<div className="flex items-center gap-2 text-sm font-medium">
										<span className="inline-flex h-6 min-w-6 items-center justify-center rounded-full bg-foreground px-2 text-background">
											{index + 1}
										</span>
										<step.icon className="h-4 w-4 text-muted-foreground" />
										{step.title}
									</div>
									<p className="mt-3 text-sm leading-relaxed text-muted-foreground">
										{step.description}
									</p>
								</div>
							))}
						</div>
					</div>
				</section>
			</main>

			<footer className="border-t border-border/80 bg-background/70 text-xs text-muted-foreground">
				<div className="app-container flex flex-col items-center justify-between gap-3 py-6 sm:flex-row">
					<p className="font-mono">
						opencoder - built with TanStack Start, Electric SQL, and Trigger.dev
					</p>
					<a
						href="https://github.com/cuevaio/opencoder"
						target="_blank"
						rel="noopener noreferrer"
						className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-muted-foreground hover:bg-muted hover:text-foreground press-scale"
					>
						Star on GitHub
						<ArrowRight className="h-3.5 w-3.5" />
					</a>
				</div>
			</footer>
		</div>
	);
}
