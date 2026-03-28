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

interface ChatLayoutContextValue {
	sidebarOpen: boolean;
	setSidebarOpen: (open: boolean) => void;
	toggleSidebar: () => void;
	isMobile: boolean;
}

function isEditableTarget(target: EventTarget | null): boolean {
	if (!(target instanceof HTMLElement)) {
		return false;
	}

	if (target.isContentEditable) {
		return true;
	}

	return Boolean(
		target.closest(
			"input, textarea, select, [contenteditable], [role='textbox']",
		),
	);
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
	const [desktopSidebarVisible, setDesktopSidebarVisible] = useState(true);
	const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);

	const sidebarOpen = isMobile ? mobileSidebarOpen : desktopSidebarVisible;

	const setSidebarOpen = useCallback(
		(open: boolean) => {
			if (isMobile) {
				setMobileSidebarOpen(open);
				return;
			}

			setDesktopSidebarVisible(open);
		},
		[isMobile],
	);

	const toggleSidebar = useCallback(() => {
		if (isMobile) {
			setMobileSidebarOpen((prev) => !prev);
			return;
		}

		setDesktopSidebarVisible((prev) => !prev);
	}, [isMobile]);

	// Auto-close the sidebar on mobile when the active session changes
	// biome-ignore lint/suspicious/noExplicitAny: params type resolves after routeTree regen
	const params = useParams({ strict: false }) as any;
	const sessionId = params?.sessionId as string | undefined;
	// biome-ignore lint/correctness/useExhaustiveDependencies: sessionId triggers close-on-navigate; isMobile guards the effect
	useEffect(() => {
		if (isMobile) {
			setMobileSidebarOpen(false);
		}
	}, [isMobile, sessionId]);

	useEffect(() => {
		const handleKeyDown = (event: KeyboardEvent) => {
			if (event.defaultPrevented || event.repeat || event.isComposing) {
				return;
			}

			if (event.key.toLowerCase() !== "b") {
				return;
			}

			const hasPrimaryModifier =
				(event.metaKey || event.ctrlKey) && event.metaKey !== event.ctrlKey;
			if (!hasPrimaryModifier || event.shiftKey || event.altKey) {
				return;
			}

			if (isEditableTarget(event.target)) {
				return;
			}

			event.preventDefault();
			toggleSidebar();
		};

		window.addEventListener("keydown", handleKeyDown);
		return () => window.removeEventListener("keydown", handleKeyDown);
	}, [toggleSidebar]);

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
				toggleSidebar,
				isMobile,
			}}
		>
			<div className="app-shell flex h-[100dvh] min-h-0 overflow-hidden bg-background text-foreground md:h-screen">
				{/* Desktop sidebar (md+) */}
				{desktopSidebarVisible && (
					<div className="hidden shrink-0 border-r border-border/70 bg-surface-1 md:block md:w-[clamp(16rem,24vw,21rem)]">
						<SessionSidebar
							onSelectSession={handleSelectSession}
							onNewSession={handleNewSession}
						/>
					</div>
				)}

				{/* Mobile sidebar (<md) */}
				<Sheet open={mobileSidebarOpen} onOpenChange={setMobileSidebarOpen}>
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
