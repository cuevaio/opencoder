import {
	createFileRoute,
	Outlet,
	useNavigate,
	useParams,
} from "@tanstack/react-router";
import { createContext, useContext, useEffect, useState } from "react";
import { SessionSidebar } from "#/components/chat/SessionSidebar.tsx";
import {
	Sheet,
	SheetContent,
	SheetHeader,
	SheetTitle,
} from "#/components/ui/sheet.tsx";
import { useIsMobile } from "#/hooks/use-media-query.ts";

interface ChatLayoutContextValue {
	sidebarOpen: boolean;
	setSidebarOpen: (open: boolean) => void;
	isMobile: boolean;
}

export const ChatLayoutContext = createContext<ChatLayoutContextValue | null>(
	null,
);

export function useChatLayoutContext(): ChatLayoutContextValue {
	const ctx = useContext(ChatLayoutContext);
	if (!ctx) {
		throw new Error(
			"useChatLayoutContext must be used within ChatLayoutContext.Provider",
		);
	}
	return ctx;
}

export const Route = createFileRoute("/_authed/chat")({
	ssr: false,
	head: () => ({ meta: [{ title: "opencoder — chat" }] }),
	// Prevent TanStack Router from re-evaluating this route when Electric
	// delivers data changes — there is no loader to re-run, but without this
	// the router may still trigger unnecessary component re-renders.
	staleTime: Infinity,
	component: ChatLayout,
});

function ChatLayout() {
	const navigate = useNavigate();
	const isMobile = useIsMobile();
	const [sidebarOpen, setSidebarOpen] = useState(false);

	// Auto-close the sidebar on mobile when the active session changes
	// biome-ignore lint/suspicious/noExplicitAny: params type resolves after routeTree regen
	const params = useParams({ strict: false }) as any;
	const sessionId = params?.sessionId as string | undefined;
	// biome-ignore lint/correctness/useExhaustiveDependencies: sessionId triggers close-on-navigate; isMobile guards the effect
	useEffect(() => {
		if (isMobile) {
			setSidebarOpen(false);
		}
	}, [isMobile, sessionId]);

	const handleSelectSession = (id: number) =>
		navigate({
			to: "/chat/$sessionId",
			params: { sessionId: String(id) },
		});

	const handleNewSession = () => navigate({ to: "/chat" });

	return (
		<ChatLayoutContext.Provider
			value={{
				sidebarOpen,
				setSidebarOpen,
				isMobile,
			}}
		>
			<div className="app-shell flex h-[100dvh] min-h-0 overflow-hidden bg-background text-foreground md:h-screen">
				{/* Desktop sidebar (md+) */}
				<div className="hidden shrink-0 border-r border-border/70 bg-surface-1 md:block md:w-[clamp(16rem,24vw,21rem)]">
					<SessionSidebar
						onSelectSession={handleSelectSession}
						onNewSession={handleNewSession}
					/>
				</div>

				{/* Mobile sidebar (<md) */}
				<Sheet open={sidebarOpen} onOpenChange={setSidebarOpen}>
					<SheetContent
						side="left"
						showCloseButton={false}
						className="p-0 md:hidden"
					>
						<SheetHeader className="sr-only">
							<SheetTitle>Sessions</SheetTitle>
						</SheetHeader>
						<SessionSidebar
							onSelectSession={handleSelectSession}
							onNewSession={handleNewSession}
						/>
					</SheetContent>
				</Sheet>

				{/* Single routed child subtree */}
				<div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
					<Outlet />
				</div>
			</div>
		</ChatLayoutContext.Provider>
	);
}
