import { useNavigate } from "@tanstack/react-router";
import type { MouseEvent as ReactMouseEvent } from "react";
import { useCallback, useMemo } from "react";
import type { Components } from "react-markdown";
import ReactMarkdown from "react-markdown";
import rehypeRaw from "rehype-raw";
import remarkGfm from "remark-gfm";
import {
	classifyLinkHref,
	isPrimaryNavigationClick,
} from "#/lib/link-policy.ts";

interface MarkdownRendererProps {
	content: string;
}

export function MarkdownRenderer({ content }: MarkdownRendererProps) {
	const navigate = useNavigate();

	const handleAnchorClick = useCallback(
		(event: ReactMouseEvent<HTMLAnchorElement>, href: string) => {
			if (!isPrimaryNavigationClick(event)) return;
			if (typeof window === "undefined") return;

			const decision = classifyLinkHref(href, window.location.origin);

			if (decision.kind === "blocked") {
				event.preventDefault();
				if (import.meta.env.DEV) {
					console.info("[chat-link] blocked href", { href });
				}
				return;
			}

			if (decision.kind === "internal") {
				event.preventDefault();
				if (import.meta.env.DEV) {
					console.info("[chat-link] internal navigate", { to: decision.to });
				}
				void navigate({ to: decision.to as never });
				return;
			}

			event.preventDefault();
			if (import.meta.env.DEV) {
				console.info("[chat-link] external open", { href: decision.href });
			}
			window.open(decision.href, "_blank", "noopener,noreferrer");
		},
		[navigate],
	);

	const markdownComponents = useMemo<Components>(
		() => ({
			a: ({ href = "", children, ...props }) => (
				<a
					{...props}
					href={href}
					onClick={(event) => {
						props.onClick?.(event);
						if (event.defaultPrevented) return;
						handleAnchorClick(event, href);
					}}
				>
					{children}
				</a>
			),
			form: ({ children, ...props }) => (
				<form
					{...props}
					onSubmit={(event) => {
						event.preventDefault();
						if (import.meta.env.DEV) {
							console.info("[chat-link] blocked raw form submit");
						}
					}}
				>
					{children}
				</form>
			),
		}),
		[handleAnchorClick],
	);

	return (
		<div className="prose prose-sm dark:prose-invert max-w-none prose-pre:bg-bg-surface prose-pre:text-xs prose-code:text-xs prose-code:before:content-none prose-code:after:content-none">
			<ReactMarkdown
				remarkPlugins={[remarkGfm]}
				rehypePlugins={[rehypeRaw]}
				components={markdownComponents}
			>
				{content}
			</ReactMarkdown>
		</div>
	);
}
