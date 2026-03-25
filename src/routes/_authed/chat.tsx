import {
	createFileRoute,
	Outlet,
	useNavigate,
	useParams,
} from "@tanstack/react-router";
import {
	createContext,
	useCallback,
	useContext,
	useEffect,
	useState,
} from "react";
import { SessionSidebar } from "#/components/chat/SessionSidebar.tsx";
import {
	Sheet,
	SheetContent,
	SheetHeader,
	SheetTitle,
} from "#/components/ui/sheet.tsx";
import { useIsMobile } from "#/hooks/use-media-query.ts";
import { createSessionsCollection } from "#/lib/collections.ts";
import { createSessionEventsPrefetchManager } from "#/lib/session-events-prefetch.ts";

// React context to share the sessionsCollection between layout and child routes
export type SessionsCollectionType = ReturnType<
	typeof createSessionsCollection
>;

interface ChatLayoutContextValue {
	sessionsCollection: SessionsCollectionType;
	sessionsSyncError: string | null;
	sidebarOpen: boolean;
	setSidebarOpen: (open: boolean) => void;
	isMobile: boolean;
	prefetchSessionEvents: (sessionId: number) => void;
}

export const ChatLayoutContext = createContext<ChatLayoutContextValue | null>(
	null,
);

export function useChatLayoutContext(): ChatLayoutContextValue {
	const ctx = useContext(ChatLayoutContext);
	if (!ctx) {
		// Fallback: create a minimal context (e.g., when route is accessed standalone)
		const collection = createSessionsCollection();
		return {
			sessionsCollection: collection,
			sessionsSyncError: null,
			sidebarOpen: false,
			setSidebarOpen: () => {},
			isMobile: false,
			prefetchSessionEvents: () => {},
		};
	}
	return ctx;
}

export const Route = createFileRoute("/_authed/chat")({
	ssr: false,
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
	const [sessionsSyncError, setSessionsSyncError] = useState<string | null>(
		null,
	);
	const [sessionEventsPrefetchManager] = useState(() =>
		createSessionEventsPrefetchManager({
			maxPrefetchedSessions: 1,
			ttlMs: 45_000,
		}),
	);

	// sessionsCollection lives here — shared by sidebar and all child routes.
	// Created once; never re-created on session switches.
	const [sessionsCollection] = useState(() =>
		createSessionsCollection({
			onError: (error) => {
				setSessionsSyncError(
					error instanceof Error ? error.message : "Failed to sync sessions",
				);
			},
		}),
	);

	// Auto-close the sidebar on mobile when the active session changes
	// biome-ignore lint/suspicious/noExplicitAny: params type resolves after routeTree regen
	const params = useParams({ strict: false }) as any;
	const sessionId = params?.sessionId as string | undefined;
	const activeSessionId = sessionId ? Number(sessionId) : null;
	// biome-ignore lint/correctness/useExhaustiveDependencies: sessionId triggers close-on-navigate; isMobile guards the effect
	useEffect(() => {
		setSessionsSyncError(null);
		sessionEventsPrefetchManager.setActiveSession(
			activeSessionId != null && !Number.isNaN(activeSessionId)
				? activeSessionId
				: null,
		);
		if (isMobile) {
			setSidebarOpen(false);
		}
	}, [activeSessionId, isMobile, sessionId, sessionEventsPrefetchManager]);

	useEffect(() => {
		return () => {
			void sessionEventsPrefetchManager.destroy();
		};
	}, [sessionEventsPrefetchManager]);

	const handleSelectSession = (id: number) =>
		navigate({
			to: "/chat/$sessionId",
			params: { sessionId: String(id) },
		});

	const handleNewSession = () => navigate({ to: "/chat" });
	const handlePrefetchSessionEvents = useCallback(
		(id: number) => {
			void sessionEventsPrefetchManager.prefetch(id, activeSessionId);
		},
		[activeSessionId, sessionEventsPrefetchManager],
	);

	return (
		<ChatLayoutContext.Provider
			value={{
				sessionsCollection,
				sessionsSyncError,
				sidebarOpen,
				setSidebarOpen,
				isMobile,
				prefetchSessionEvents: handlePrefetchSessionEvents,
			}}
		>
			<div className="app-shell flex h-[100dvh] min-h-0 overflow-hidden bg-background text-foreground md:h-screen">
				{/* Desktop sidebar (md+) */}
				<div className="hidden shrink-0 border-r border-border/70 bg-surface-1 md:block md:w-[clamp(16rem,24vw,21rem)]">
					<SessionSidebar
						sessionsCollection={sessionsCollection}
						onSelectSession={handleSelectSession}
						onNewSession={handleNewSession}
						onPrefetchSessionEvents={handlePrefetchSessionEvents}
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
							sessionsCollection={sessionsCollection}
							onSelectSession={handleSelectSession}
							onNewSession={handleNewSession}
							onPrefetchSessionEvents={handlePrefetchSessionEvents}
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
