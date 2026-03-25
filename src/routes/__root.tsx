import type { QueryClient } from "@tanstack/react-query";
import {
	createRootRouteWithContext,
	HeadContent,
	Link,
	Outlet,
	Scripts,
} from "@tanstack/react-router";
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
			{ title: "OpenCoder" },
			{
				name: "description",
				content: "Run a coding agent on your GitHub repos",
			},
		],
		links: [{ rel: "stylesheet", href: appCss }],
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
				<HeadContent />
			</head>
			<body className="font-sans antialiased">
				{children}
				<Scripts />
			</body>
		</html>
	);
}

function RootLayout() {
	return (
		<TanStackQueryProvider>
			<Outlet />
		</TanStackQueryProvider>
	);
}
