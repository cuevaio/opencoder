type LinkDecision =
	| { kind: "internal"; to: string }
	| { kind: "external"; href: string }
	| { kind: "blocked" };

const blockedProtocols = new Set([
	"javascript:",
	"data:",
	"file:",
	"vbscript:",
]);
const allowedProtocols = new Set(["http:", "https:", "mailto:", "tel:"]);

export function classifyLinkHref(
	rawHref: string,
	currentOrigin: string,
): LinkDecision {
	const href = rawHref.trim();
	if (!href) {
		return { kind: "blocked" };
	}

	let url: URL;
	try {
		url = new URL(href, currentOrigin);
	} catch {
		return { kind: "blocked" };
	}

	if (blockedProtocols.has(url.protocol)) {
		return { kind: "blocked" };
	}

	if (!allowedProtocols.has(url.protocol)) {
		return { kind: "blocked" };
	}

	const isWebProtocol = url.protocol === "http:" || url.protocol === "https:";
	if (isWebProtocol && url.origin === currentOrigin) {
		const to = `${url.pathname}${url.search}${url.hash}`;
		return { kind: "internal", to: to || "/" };
	}

	return { kind: "external", href: url.href };
}

export function isPrimaryNavigationClick(
	event: Pick<
		MouseEvent,
		| "button"
		| "metaKey"
		| "ctrlKey"
		| "shiftKey"
		| "altKey"
		| "defaultPrevented"
	>,
): boolean {
	if (event.defaultPrevented) return false;
	if (event.button !== 0) return false;
	if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey)
		return false;
	return true;
}
