import tailwindcss from "@tailwindcss/vite";
import { devtools } from "@tanstack/devtools-vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import viteReact from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import tsconfigPaths from "vite-tsconfig-paths";

const disableTanStackDevtools =
	process.env.VITE_DISABLE_TANSTACK_DEVTOOLS_VITE === "1";
const enableEnhancedLogs = process.env.VITE_TSD_ENHANCED_LOGS === "1";
const enableConsolePiping = process.env.VITE_TSD_CONSOLE_PIPING === "1";

const config = defineConfig({
	server: {
		watch: {
			ignored: ["**/.trigger/**"],
		},
	},
	plugins: [
		disableTanStackDevtools
			? undefined
			: devtools({
					enhancedLogs: { enabled: enableEnhancedLogs },
					consolePiping: { enabled: enableConsolePiping },
				}),
		tsconfigPaths({ projects: ["./tsconfig.json"] }),
		tailwindcss(),
		tanstackStart(),
		viteReact({
			babel: {
				plugins: ["babel-plugin-react-compiler"],
			},
		}),
	],
});

export default config;
