import type { BuildExtension } from "@trigger.dev/build";
import { aptGet } from "@trigger.dev/build/extensions/core";
import { defineConfig } from "@trigger.dev/sdk";
import { config } from "dotenv"

config()

const OPENCODE_LATEST_TARBALL_URL =
	"https://github.com/anomalyco/opencode/releases/latest/download/opencode-linux-x64.tar.gz";

function ghCliBinary(): BuildExtension {
	return {
		name: "gh-cli-binary",
		onBuildComplete: async (context) => {
			if (context.target === "dev") return;

			context.addLayer({
				id: "gh-cli-binary",
				image: {
					instructions: [
						`RUN apt-get update && apt-get install -y --no-install-recommends curl ca-certificates ` +
							`&& GH_VERSION=$(curl -fsSI https://github.com/cli/cli/releases/latest | grep -i "^location:" | sed "s|.*/v||" | tr -d "\\r\\n") ` +
							`&& curl -fsSL "https://github.com/cli/cli/releases/download/v\${GH_VERSION}/gh_\${GH_VERSION}_linux_amd64.tar.gz" ` +
							`| tar -xzf - --strip-components=2 -C /usr/local/bin "gh_\${GH_VERSION}_linux_amd64/bin/gh" ` +
							`&& chmod +x /usr/local/bin/gh ` +
							`&& apt-get purge -y curl && apt-get autoremove -y && apt-get clean && rm -rf /var/lib/apt/lists/*`,
					],
				},
			});
		},
	};
}

function opencodeBinary(): BuildExtension {
  return {
    name: "opencode-binary",
    onBuildComplete: async (context) => {
      if (context.target === "dev") return;

      context.addLayer({
        id: "opencode-binary",
        image: {
				instructions: [
					`RUN apt-get update && apt-get install -y --no-install-recommends curl ca-certificates ` +
						`&& curl -fsSL "${OPENCODE_LATEST_TARBALL_URL}" | tar -xzf - -C /usr/local/bin/ ` +
						`&& chmod +x /usr/local/bin/opencode ` +
						`&& apt-get purge -y curl && apt-get autoremove -y && apt-get clean && rm -rf /var/lib/apt/lists/*`,
				],
        },
      });
    },
  };
}

export default defineConfig({
  project: process.env.TRIGGER_PROJECT_ID!,
  runtime: "node",
  logLevel: "log",
  dirs: ["./src/trigger"],
  maxDuration: 3600,
  retries: {
    enabledInDev: false,
    default: {
      maxAttempts: 1,
    },
  },
  build: {
    external: ["@opencode-ai/sdk"],
    extensions: [aptGet({ packages: ["git"] }), opencodeBinary(), ghCliBinary()],
  },
  machine: "small-2x",
});
