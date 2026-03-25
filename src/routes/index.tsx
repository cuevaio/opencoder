import { createFileRoute, Link } from "@tanstack/react-router";
import { AppHeader } from "#/components/app-header.tsx";
import { authClient } from "#/lib/auth-client.ts";

export const Route = createFileRoute("/")({
	component: HomePage,
});

function HomePage() {
	const { data: session } = authClient.useSession();
	const variant = session ? "authed" : "public";

	return (
		<div className="app-shell flex flex-col bg-background text-foreground">
			<AppHeader variant={variant} />

			{/* Hero */}
			<main className="app-container flex flex-1 flex-col items-center justify-center py-14 text-center sm:py-20">
				<h1 className="text-display-fluid font-bold tracking-tight">
					OpenCoder
				</h1>
				<p className="mt-4 max-w-xl text-base leading-relaxed text-muted-foreground sm:text-lg">
					Run a coding agent on any GitHub repository. Ask questions, fix bugs,
					and ship features — all from your browser.
				</p>
				<div className="mt-8 flex flex-wrap justify-center gap-3">
					{session ? (
						<Link
							to="/chat"
							className="rounded-md bg-foreground px-5 py-3 text-sm font-semibold text-background hover:opacity-90 press-scale"
						>
							Open Chat →
						</Link>
					) : (
						<Link
							to="/sign-in"
							className="rounded-md bg-foreground px-5 py-3 text-sm font-semibold text-background hover:opacity-90 press-scale"
						>
							Get started →
						</Link>
					)}
					<a
						href="https://github.com/cuevaio/coder"
						target="_blank"
						rel="noopener noreferrer"
						className="rounded-md border border-border bg-background/60 px-5 py-3 text-sm font-semibold hover:bg-muted press-scale"
					>
						GitHub
					</a>
				</div>

				{/* Features */}
				<div className="mt-16 grid w-full max-w-4xl grid-cols-1 gap-4 text-left sm:mt-20 sm:grid-cols-3 sm:gap-6">
					{[
						{
							title: "Any GitHub repo",
							description:
								"Connect your GitHub account and point the agent at any repository you have access to.",
						},
						{
							title: "Real-time streaming",
							description:
								"Watch the agent work in real-time — every tool call, file edit, and thought streamed live.",
						},
						{
							title: "Multi-turn sessions",
							description:
								"Continue a session where you left off. Ask follow-up questions and iterate on the agent's work.",
						},
					].map((f) => (
						<div
							key={f.title}
							className="rounded-xl border border-border/80 bg-surface-1 p-5"
						>
							<h3 className="font-semibold">{f.title}</h3>
							<p className="mt-2 text-sm leading-relaxed text-muted-foreground">
								{f.description}
							</p>
						</div>
					))}
				</div>
			</main>

			{/* Footer */}
			<footer className="border-t border-border/80 bg-background/70 py-6 text-xs text-muted-foreground">
				<div className="app-container text-center">
					OpenCoder — built with TanStack Start, Electric SQL, and Trigger.dev
				</div>
			</footer>
		</div>
	);
}
