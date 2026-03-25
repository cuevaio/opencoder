import { Link, useNavigate } from "@tanstack/react-router";
import { Menu, X } from "lucide-react";
import { useState } from "react";
import { authClient } from "#/lib/auth-client.ts";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "./ui/sheet.tsx";

interface AppHeaderProps {
	/** "public" shows sign-in link; "authed" shows Chat/Dashboard/Sign out */
	variant?: "public" | "authed";
}

export function AppHeader({ variant = "public" }: AppHeaderProps) {
	const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
	const navigate = useNavigate();

	const handleSignOut = () => {
		authClient.signOut({
			fetchOptions: {
				onSuccess: () => {
					void navigate({ to: "/" });
				},
			},
		});
	};

	return (
		<header className="border-b border-border/80 bg-background/90 pt-safe backdrop-blur-sm">
			<div className="app-container flex h-16 items-center justify-between">
				{/* Logo */}
				<Link
					to="/"
					className="text-lg font-semibold tracking-tight text-foreground press-scale"
				>
					OpenCoder
				</Link>

				{/* Desktop nav */}
				<nav className="hidden items-center gap-2 md:flex">
					{variant === "authed" ? (
						<>
							<Link
								to="/chat"
								className="rounded-md px-3 py-2 text-sm font-medium text-foreground hover:bg-muted"
							>
								Chat
							</Link>
							<Link
								to="/dashboard"
								className="rounded-md px-3 py-2 text-sm font-medium text-foreground hover:bg-muted"
							>
								Dashboard
							</Link>
							<button
								type="button"
								onClick={handleSignOut}
								className="rounded-md border border-border bg-background px-3 py-2 text-sm font-medium hover:bg-muted press-scale"
							>
								Sign out
							</button>
						</>
					) : (
						<Link
							to="/sign-in"
							className="rounded-md bg-foreground px-4 py-2 text-sm font-medium text-background hover:opacity-90 press-scale"
						>
							Sign in with GitHub
						</Link>
					)}
				</nav>

				{/* Mobile hamburger */}
				<button
					type="button"
					onClick={() => setMobileMenuOpen(true)}
					className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-md text-foreground hover:bg-muted md:hidden press-scale"
					aria-label="Open navigation menu"
				>
					<Menu className="h-5 w-5" />
				</button>
			</div>

			{/* Mobile nav sheet */}
			<Sheet open={mobileMenuOpen} onOpenChange={setMobileMenuOpen}>
				<SheetContent side="right" showCloseButton={false} className="p-0">
					<SheetHeader className="border-b border-border px-4 py-4">
						<div className="flex items-center justify-between">
							<SheetTitle className="text-base font-semibold">
								OpenCoder
							</SheetTitle>
							<button
								type="button"
								onClick={() => setMobileMenuOpen(false)}
								className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-md text-muted-foreground hover:bg-muted press-scale"
								aria-label="Close navigation menu"
							>
								<X className="h-5 w-5" />
							</button>
						</div>
					</SheetHeader>

					<nav className="flex flex-col gap-1 p-3">
						{variant === "authed" ? (
							<>
								<Link
									to="/chat"
									onClick={() => setMobileMenuOpen(false)}
									className="flex min-h-[48px] items-center rounded-lg bg-surface-1 px-4 py-3 text-base font-medium text-foreground hover:bg-muted press-scale"
								>
									Chat
								</Link>
								<Link
									to="/dashboard"
									onClick={() => setMobileMenuOpen(false)}
									className="flex min-h-[48px] items-center rounded-lg bg-surface-1 px-4 py-3 text-base font-medium text-foreground hover:bg-muted press-scale"
								>
									Dashboard
								</Link>
								<div className="my-2 border-t border-border" />
								<button
									type="button"
									onClick={() => {
										setMobileMenuOpen(false);
										handleSignOut();
									}}
									className="flex min-h-[48px] items-center rounded-lg bg-surface-1 px-4 py-3 text-base font-medium text-foreground hover:bg-muted press-scale"
								>
									Sign out
								</button>
							</>
						) : (
							<Link
								to="/sign-in"
								onClick={() => setMobileMenuOpen(false)}
								className="flex min-h-[48px] items-center rounded-lg bg-foreground px-4 py-3 text-base font-medium text-background hover:opacity-90 press-scale"
							>
								Sign in with GitHub
							</Link>
						)}
					</nav>
				</SheetContent>
			</Sheet>
		</header>
	);
}
