import { Link, useNavigate } from "@tanstack/react-router";
import { Menu, X } from "lucide-react";
import { useState } from "react";
import {
	Sheet,
	SheetContent,
	SheetHeader,
	SheetTitle,
} from "#/components/ui/sheet.tsx";
import { authClient } from "#/lib/auth-client.ts";

export function ChatMobileMenu() {
	const [open, setOpen] = useState(false);
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
		<>
			<button
				type="button"
				onClick={() => setOpen(true)}
				className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-md text-foreground hover:bg-muted md:hidden press-scale"
				aria-label="Open navigation menu"
			>
				<Menu className="h-5 w-5" />
			</button>

			<Sheet open={open} onOpenChange={setOpen}>
				<SheetContent
					side="right"
					showCloseButton={false}
					className="w-[280px] p-0"
				>
					<SheetHeader className="border-b border-border px-4 py-4">
						<div className="flex items-center justify-between">
							<SheetTitle className="font-semibold">OpenCoder</SheetTitle>
							<button
								type="button"
								onClick={() => setOpen(false)}
								className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-md text-muted-foreground hover:bg-muted press-scale"
								aria-label="Close navigation menu"
							>
								<X className="h-5 w-5" />
							</button>
						</div>
					</SheetHeader>

					<nav className="flex flex-col gap-1 p-3">
						<Link
							to="/"
							onClick={() => setOpen(false)}
							className="flex min-h-[44px] items-center rounded-lg px-4 py-3 text-base font-medium text-foreground hover:bg-muted press-scale"
						>
							Home
						</Link>
						<Link
							to="/chat"
							onClick={() => setOpen(false)}
							className="flex min-h-[44px] items-center rounded-lg px-4 py-3 text-base font-medium text-foreground hover:bg-muted press-scale"
						>
							Chat
						</Link>
						<Link
							to="/dashboard"
							onClick={() => setOpen(false)}
							className="flex min-h-[44px] items-center rounded-lg px-4 py-3 text-base font-medium text-foreground hover:bg-muted press-scale"
						>
							Dashboard
						</Link>
						<div className="my-2 border-t border-border" />
						<button
							type="button"
							onClick={() => {
								setOpen(false);
								handleSignOut();
							}}
							className="flex min-h-[44px] items-center rounded-lg px-4 py-3 text-base font-medium text-foreground hover:bg-muted press-scale"
						>
							Sign out
						</button>
					</nav>
				</SheetContent>
			</Sheet>
		</>
	);
}
