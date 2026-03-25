import { Moon, Sun } from "lucide-react";
import { useTheme } from "#/components/theme-provider.tsx";
import { Switch } from "#/components/ui/switch.tsx";
import type { Theme } from "#/lib/theme.ts";
import { cn } from "#/lib/utils";

interface ThemeToggleProps {
	className?: string;
	showLabel?: boolean;
	onThemeChange?: (nextTheme: Theme, applyTheme: () => void) => void;
}

export function ThemeToggle({
	className,
	showLabel = false,
	onThemeChange,
}: ThemeToggleProps) {
	const { theme, setTheme } = useTheme();
	const isDark = theme === "dark";

	const handleCheckedChange = (checked: boolean) => {
		const nextTheme: Theme = checked ? "dark" : "light";
		const applyTheme = () => setTheme(nextTheme);
		if (onThemeChange) {
			onThemeChange(nextTheme, applyTheme);
			return;
		}

		applyTheme();
	};

	return (
		<div className={cn("flex items-center gap-2", className)}>
			{showLabel && (
				<span className="text-sm font-medium text-foreground">Dark mode</span>
			)}
			<Sun className="h-3.5 w-3.5 text-muted-foreground" aria-hidden="true" />
			<Switch
				checked={isDark}
				onCheckedChange={handleCheckedChange}
				aria-label="Toggle dark mode"
			/>
			<Moon className="h-3.5 w-3.5 text-muted-foreground" aria-hidden="true" />
		</div>
	);
}
