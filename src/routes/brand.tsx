import { createFileRoute } from "@tanstack/react-router";
import { Download } from "lucide-react";
import { Mark, Wordmark } from "#/components/logo.tsx";

export const Route = createFileRoute("/brand")({
	component: BrandPage,
});

// ── Download helper ──────────────────────────────────────────────────────────

function svgToBlob(svgString: string): Blob {
	return new Blob([svgString], { type: "image/svg+xml" });
}

function downloadBlob(blob: Blob, filename: string) {
	const url = URL.createObjectURL(blob);
	const a = document.createElement("a");
	a.href = url;
	a.download = filename;
	a.click();
	URL.revokeObjectURL(url);
}

/**
 * Build wordmark SVG string.
 * Fira Code 700 @ 52px:  1ch=31.2px, x-height=28.5px, baseline y=44
 */
function buildWordmarkSvg(color: string): string {
	return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 296 52" width="296" height="52">
  <defs><style>@import url('https://fonts.googleapis.com/css2?family=Fira+Code:wght@700&amp;display=swap');</style></defs>
  <rect x="8" y="15.5" width="31" height="28.5" fill="${color}"/>
  <text x="39.2" y="44" font-family="'Fira Code','Courier New',monospace" font-size="52" font-weight="700" fill="${color}" letter-spacing="-0.52">penc</text>
  <rect x="164" y="15.5" width="31" height="28.5" fill="${color}"/>
  <text x="195.2" y="44" font-family="'Fira Code','Courier New',monospace" font-size="52" font-weight="700" fill="${color}" letter-spacing="-0.52">der</text>
</svg>`;
}

/** Build two-block mark SVG. */
function buildMarkSvg(color: string, size = 72): string {
	// Two rects: each 0.6*size wide, 0.548*size tall, gap 0.08*size
	const bw = Math.round(0.6 * size);
	const bh = Math.round(0.548 * size);
	const gap = Math.round(0.08 * size);
	const totalW = bw * 2 + gap;
	const padX = Math.round((size - totalW) / 2);
	const padY = Math.round((size - bh) / 2);
	return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" width="${size}" height="${size}">
  <rect x="${padX}" y="${padY}" width="${bw}" height="${bh}" fill="${color}"/>
  <rect x="${padX + bw + gap}" y="${padY}" width="${bw}" height="${bh}" fill="${color}"/>
</svg>`;
}

// ── Downloadable asset wrapper ───────────────────────────────────────────────

interface AssetCardProps {
	label: string;
	onDownload: () => void;
	children: React.ReactNode;
	className?: string;
}

function AssetCard({ label, onDownload, children, className }: AssetCardProps) {
	return (
		<div className="group flex flex-col items-center gap-3">
			<div className={`relative ${className ?? ""}`}>
				{children}
				{/* Download overlay — button covers the asset on hover */}
				<button
					type="button"
					onClick={onDownload}
					aria-label={`Download ${label}`}
					className="absolute inset-0 flex items-center justify-center rounded-[inherit] opacity-0 transition-opacity duration-150 group-hover:opacity-100"
					style={{ background: "rgba(0,0,0,0.55)" }}
				>
					<Download
						className="h-5 w-5 text-white drop-shadow"
						strokeWidth={1.5}
					/>
				</button>
			</div>
			<span
				style={{
					fontFamily: "'Fira Code', monospace",
					fontSize: 10,
					letterSpacing: "0.14em",
					textTransform: "uppercase",
					color: "#2a2a2a",
				}}
			>
				{label}
			</span>
		</div>
	);
}

// ── Page ─────────────────────────────────────────────────────────────────────

function BrandPage() {
	return (
		<div
			style={{
				background: "#111",
				color: "#fff",
				minHeight: "100vh",
				display: "flex",
				flexDirection: "column",
				alignItems: "center",
				gap: 56,
				padding: "72px 32px 96px",
				fontFamily: "'Fira Sans', system-ui, sans-serif",
			}}
		>
			{/* Title */}
			<span
				style={{
					fontFamily: "'Fira Code', monospace",
					fontSize: 10,
					fontWeight: 400,
					letterSpacing: "0.18em",
					color: "#2a2a2a",
					textTransform: "uppercase",
				}}
			>
				opencoder — logo system
			</span>

			{/* ── Wordmark dark ── */}
			<Section label="Wordmark — dark">
				<AssetCard
					label="Download SVG"
					className="w-full"
					onDownload={() =>
						downloadBlob(
							svgToBlob(buildWordmarkSvg("white")),
							"opencoder-wordmark.svg",
						)
					}
				>
					<div style={darkBox}>
						<Wordmark size={52} variant="dark" />
					</div>
				</AssetCard>
			</Section>

			{/* ── Wordmark light ── */}
			<Section label="Wordmark — light">
				<AssetCard
					label="Download SVG"
					className="w-full"
					onDownload={() =>
						downloadBlob(
							svgToBlob(buildWordmarkSvg("#0d0d0d")),
							"opencoder-wordmark-light.svg",
						)
					}
				>
					<div style={lightBox}>
						<Wordmark size={52} variant="light" />
					</div>
				</AssetCard>
			</Section>

			<Divider />

			{/* ── Scale ── */}
			<Section label="Scale">
				<div style={scaleRow}>
					{([48, 28, 18, 13] as const).map((sz) => (
						<div
							key={sz}
							style={{
								display: "flex",
								flexDirection: "column",
								alignItems: "flex-start",
								gap: 10,
							}}
						>
							<Wordmark size={sz} variant="dark" />
							<Mono>{sz}px</Mono>
						</div>
					))}
				</div>
			</Section>

			<Divider />

			{/* ── App icons ── */}
			<Section label="App icon">
				<div style={iconsRow}>
					{(
						[
							{ size: 180, radius: 40, markSize: 52 },
							{ size: 96, radius: 21, markSize: 28 },
							{ size: 64, radius: 14, markSize: 18 },
							{ size: 32, radius: 4, markSize: 9 },
							{ size: 16, radius: 2, markSize: 4.5 },
						] as const
					).map(({ size, radius, markSize }) => (
						<AssetCard
							key={size}
							label={`${size}px`}
							onDownload={() =>
								downloadBlob(
									svgToBlob(buildMarkSvg("white", size)),
									`opencoder-icon-${size}.svg`,
								)
							}
						>
							<div
								style={{
									width: size,
									height: size,
									borderRadius: radius,
									background: "#161616",
									border: "1px solid #282828",
									display: "flex",
									alignItems: "center",
									justifyContent: "center",
									flexShrink: 0,
								}}
							>
								<Mark size={markSize} variant="dark" />
							</div>
						</AssetCard>
					))}
				</div>
			</Section>
		</div>
	);
}

// ── Sub-components ───────────────────────────────────────────────────────────

function Section({
	label,
	children,
}: {
	label: string;
	children: React.ReactNode;
}) {
	return (
		<div
			style={{
				display: "flex",
				flexDirection: "column",
				alignItems: "center",
				gap: 16,
				width: "100%",
				maxWidth: 900,
			}}
		>
			<Mono style={{ color: "#282828" }}>{label}</Mono>
			{children}
		</div>
	);
}

function Divider() {
	return (
		<hr
			style={{
				width: "100%",
				maxWidth: 780,
				border: "none",
				borderTop: "1px solid #181818",
			}}
		/>
	);
}

function Mono({
	children,
	style,
}: {
	children: React.ReactNode;
	style?: React.CSSProperties;
}) {
	return (
		<span
			style={{
				fontFamily: "'Fira Code', monospace",
				fontSize: 10,
				fontWeight: 400,
				letterSpacing: "0.14em",
				textTransform: "uppercase",
				color: "#2a2a2a",
				...style,
			}}
		>
			{children}
		</span>
	);
}

const darkBox: React.CSSProperties = {
	background: "#0d0d0d",
	border: "1px solid #1c1c1c",
	borderRadius: 3,
	padding: "52px 80px",
	display: "flex",
	alignItems: "center",
	justifyContent: "center",
	width: "100%",
};

const lightBox: React.CSSProperties = {
	background: "#f5f5f5",
	border: "1px solid #e2e2e2",
	borderRadius: 3,
	padding: "52px 80px",
	display: "flex",
	alignItems: "center",
	justifyContent: "center",
	width: "100%",
};

const scaleRow: React.CSSProperties = {
	display: "flex",
	alignItems: "flex-end",
	gap: 44,
	background: "#0d0d0d",
	border: "1px solid #1c1c1c",
	borderRadius: 3,
	padding: "36px 52px",
	width: "100%",
};

const iconsRow: React.CSSProperties = {
	display: "flex",
	flexDirection: "row",
	alignItems: "flex-end",
	gap: 28,
	background: "#090909",
	border: "1px solid #181818",
	borderRadius: 3,
	padding: "36px 48px",
	width: "100%",
};
