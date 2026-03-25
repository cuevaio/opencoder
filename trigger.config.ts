import type { BuildExtension } from "@trigger.dev/build";
import { aptGet } from "@trigger.dev/build/extensions/core";
import { defineConfig } from "@trigger.dev/sdk";

const OPENCODE_VERSION = "1.1.53";

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
              `&& curl -fsSL "https://github.com/anomalyco/opencode/releases/download/v${OPENCODE_VERSION}/opencode-linux-x64.tar.gz" | tar -xzf - -C /usr/local/bin/ ` +
              `&& chmod +x /usr/local/bin/opencode ` +
              `&& apt-get purge -y curl && apt-get autoremove -y && apt-get clean && rm -rf /var/lib/apt/lists/*`,
          ],
        },
      });
    },
  };
}

export default defineConfig({
  project: "proj_cmuxmxkeawsvygzunxxi",
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
    extensions: [aptGet({ packages: ["git"] }), opencodeBinary()],
  },
  machine: "small-2x",
});
