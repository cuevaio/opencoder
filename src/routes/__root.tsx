import type { QueryClient } from "@tanstack/react-query";
import {
	createRootRouteWithContext,
	HeadContent,
	Link,
	Outlet,
	Scripts,
} from "@tanstack/react-router";
import { Analytics } from "@vercel/analytics/react";
import { ThemeProvider } from "#/components/theme-provider.tsx";
import { THEME_INIT_SCRIPT } from "#/lib/theme.ts";
import TanStackQueryProvider from "../integrations/tanstack-query/root-provider";
import appCss from "../styles.css?url";

interface MyRouterContext {
	queryClient: QueryClient;
}

export const Route = createRootRouteWithContext<MyRouterContext>()({
	head: () => ({
		meta: [
			{ charSet: "utf-8" },
			{
				name: "viewport",
				content: "width=device-width, initial-scale=1, viewport-fit=cover",
			},
			{ title: "opencoder" },
			{
				name: "description",
				content: "Run a coding agent on any GitHub repository",
			},
		],
		links: [
			{ rel: "icon", href: "/brand-icon.svg", type: "image/svg+xml" },
			{ rel: "shortcut icon", href: "/brand-icon.svg" },
			{ rel: "preconnect", href: "https://fonts.googleapis.com" },
			{
				rel: "preconnect",
				href: "https://fonts.gstatic.com",
				crossOrigin: "anonymous",
			},
			{
				rel: "stylesheet",
				href: "https://fonts.googleapis.com/css2?family=Fira+Code:wght@400;500;600;700&family=Fira+Sans:ital,wght@0,300;0,400;0,500;0,600;1,400&display=swap",
			},
			{ rel: "stylesheet", href: appCss },
		],
	}),
	notFoundComponent: RootNotFound,
	component: RootLayout,
	shellComponent: RootDocument,
});

function RootNotFound() {
	return (
		<div className="mx-auto flex min-h-[60vh] max-w-xl flex-col items-center justify-center gap-3 px-4 text-center">
			<h1 className="text-3xl font-semibold tracking-tight">Page not found</h1>
			<p className="text-sm text-muted-foreground">
				The page you requested does not exist.
			</p>
			<Link
				to="/"
				className="inline-flex h-9 items-center rounded-md bg-foreground px-4 text-sm font-medium text-background transition-opacity hover:opacity-90"
			>
				Go home
			</Link>
		</div>
	);
}

function RootDocument({ children }: { children: React.ReactNode }) {
	return (
		<html lang="en" suppressHydrationWarning>
			<head>
				<script>{THEME_INIT_SCRIPT}</script>
				<HeadContent />
			</head>
			<body className="font-sans antialiased">
				{children}
				<Analytics />
				<Scripts />
			</body>
		</html>
	);
}

function RootLayout() {
	return (
		<TanStackQueryProvider>
			<ThemeProvider>
				<Outlet />
			</ThemeProvider>
		</TanStackQueryProvider>
	);
}
