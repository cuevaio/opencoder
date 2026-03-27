import { useNavigate } from "@tanstack/react-router";
import type { MouseEvent as ReactMouseEvent } from "react";
import { memo, useCallback, useMemo } from "react";
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

export const MarkdownRenderer = memo(function MarkdownRenderer({
	content,
}: MarkdownRendererProps) {
	const navigate = useNavigate();

	const handleAnchorClick = useCallback(
		(event: ReactMouseEvent<HTMLAnchorElement>, href: string) => {
			if (!isPrimaryNavigationClick(event)) return;
			if (typeof window === "undefined") return;

			const decision = classifyLinkHref(href, window.location.origin);

			if (decision.kind === "blocked") {
				event.preventDefault();
				return;
			}

			if (decision.kind === "internal") {
				event.preventDefault();
				void navigate({ to: decision.to as never });
				return;
			}

			event.preventDefault();
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
					}}
				>
					{children}
				</form>
			),
		}),
		[handleAnchorClick],
	);

	return (
		<div className="markdown-safe prose prose-sm max-w-none dark:prose-invert prose-pre:bg-surface-1 prose-pre:text-xs prose-code:text-xs prose-code:before:content-none prose-code:after:content-none [&_pre]:max-w-full [&_pre]:overflow-x-auto [&_table]:block [&_table]:max-w-full [&_table]:overflow-x-auto">
			<ReactMarkdown
				remarkPlugins={[remarkGfm]}
				rehypePlugins={[rehypeRaw]}
				components={markdownComponents}
			>
				{content}
			</ReactMarkdown>
		</div>
	);
});
