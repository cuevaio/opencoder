import { Moon, Sun } from "lucide-react";
import { useTheme } from "#/components/theme-provider.tsx";
import { Switch } from "#/components/ui/switch.tsx";
import { cn } from "#/lib/utils";

interface ThemeToggleProps {
	className?: string;
	showLabel?: boolean;
}

export function ThemeToggle({
	className,
	showLabel = false,
}: ThemeToggleProps) {
	const { theme, setTheme } = useTheme();
	const isDark = theme === "dark";

	return (
		<div className={cn("flex items-center gap-2", className)}>
			{showLabel && (
				<span className="text-sm font-medium text-foreground">Dark mode</span>
			)}
			<Sun className="h-3.5 w-3.5 text-muted-foreground" aria-hidden="true" />
			<Switch
				checked={isDark}
				onCheckedChange={(checked) => setTheme(checked ? "dark" : "light")}
				aria-label="Toggle dark mode"
			/>
			<Moon className="h-3.5 w-3.5 text-muted-foreground" aria-hidden="true" />
		</div>
	);
}
