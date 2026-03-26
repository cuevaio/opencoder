/**
 * opencoder logo primitives
 *
 * Wordmark: "█penc█der" — both 'o's replaced with x-height solid blocks
 * Mark:     "██" — two blocks side by side, used as app icon / favicon mark
 *
 * Fira Code 700 metrics:
 *   x-height = 0.548em   (top of 'o' from baseline)
 *   1ch       = 0.600em   (character cell width)
 */

import { cn } from "#/lib/utils.ts";

interface WordmarkProps {
	className?: string;
	/** px font-size; defaults to 24 */
	size?: number;
	/**
	 * dark = white ink, light = dark ink, auto = inherit current text color
	 */
	variant?: "dark" | "light" | "auto";
}

export function Wordmark({
	className,
	size = 24,
	variant = "auto",
}: WordmarkProps) {
	const color =
		variant === "light"
			? "#0d0d0d"
			: variant === "dark"
				? "white"
				: "currentColor";

	return (
		<span
			className={cn("inline-flex items-baseline leading-none", className)}
			style={
				{
					fontFamily: "'Fira Code', 'SF Mono', monospace",
					fontWeight: 700,
					fontSize: size,
					color,
					letterSpacing: "-0.01em",
					// CSS custom props for block sizing
					"--x": "0.548",
					"--ch": "0.600",
				} as React.CSSProperties
			}
		>
			{/* First 'o' → block */}
			<span
				style={{
					display: "inline-block",
					width: "calc(0.600 * 1em)",
					height: "calc(0.548 * 1em)",
					verticalAlign: 0,
					background: "currentColor",
					flexShrink: 0,
				}}
			/>
			penc
			{/* Second 'o' → block */}
			<span
				style={{
					display: "inline-block",
					width: "calc(0.600 * 1em)",
					height: "calc(0.548 * 1em)",
					verticalAlign: 0,
					background: "currentColor",
					flexShrink: 0,
				}}
			/>
			der
		</span>
	);
}

interface MarkProps {
	className?: string;
	/** px font-size controlling block proportions; defaults to 24 */
	size?: number;
	/**
	 * dark = white ink, light = dark ink, auto = inherit current text color
	 */
	variant?: "dark" | "light" | "auto";
}

export function Mark({ className, size = 24, variant = "auto" }: MarkProps) {
	const color =
		variant === "light"
			? "#0d0d0d"
			: variant === "dark"
				? "white"
				: "currentColor";
	const blockW = 0.6 * size;
	const blockH = 0.548 * size;
	const gap = 0.08 * size;

	return (
		<span
			className={cn("inline-flex items-baseline leading-none", className)}
			style={{ gap, color }}
		>
			<span
				style={{
					display: "inline-block",
					width: blockW,
					height: blockH,
					verticalAlign: 0,
					background: "currentColor",
					flexShrink: 0,
				}}
			/>
			<span
				style={{
					display: "inline-block",
					width: blockW,
					height: blockH,
					verticalAlign: 0,
					background: "currentColor",
					flexShrink: 0,
				}}
			/>
		</span>
	);
}
