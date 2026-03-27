import { Button } from "#/components/ui/button.tsx";
import {
	Dialog,
	DialogClose,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "#/components/ui/dialog.tsx";

interface DeleteSessionDialogProps {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	onConfirm: () => void;
	isDeleting: boolean;
}

export function DeleteSessionDialog({
	open,
	onOpenChange,
	onConfirm,
	isDeleting,
}: DeleteSessionDialogProps) {
	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent showCloseButton={false}>
				<DialogHeader>
					<DialogTitle>Delete session</DialogTitle>
					<DialogDescription>
						This will permanently delete this session and all its data including
						messages, events, and saved git state. This action cannot be undone.
					</DialogDescription>
				</DialogHeader>
				<DialogFooter>
					<DialogClose asChild>
						<Button variant="outline" disabled={isDeleting}>
							Cancel
						</Button>
					</DialogClose>
					<Button
						variant="destructive"
						onClick={onConfirm}
						disabled={isDeleting}
					>
						{isDeleting ? "Deleting..." : "Delete session"}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
