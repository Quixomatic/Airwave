import { ServerCodeBlock } from "fumadocs-ui/components/codeblock.rsc";
import { COMPOSE } from "@/app/(home)/compose";
import { ENV_EXAMPLE } from "@/app/(home)/env-example";
import { SelfHostConfig } from "@/components/self-host-config";

/**
 * The full `docker-compose.yml` + `.env.example` in a tabbed, copyable viewer — the same pair the home page
 * shows, packaged as a zero-prop component for docs/MDX (`<DockerConfig />`). Server-rendered highlighting
 * (ServerCodeBlock) with both files mounted; the client `SelfHostConfig` toggles tabs and handles copy.
 * Sources the exact strings the home page uses (`app/(home)/compose.ts`, `env-example.ts`), so the docs and
 * the home page never drift.
 */
const REPO = "https://github.com/Quixomatic/Airwave/blob/main";
// Flatten ServerCodeBlock's own chrome so it sits flush inside SelfHostConfig's bordered card, and cap the
// height so the full file scrolls instead of running the page long.
const FLAT = "!my-0 !rounded-none !border-0 !shadow-none !bg-transparent [&_pre]:max-h-[460px]";

export function DockerConfig() {
  return (
    <div className="not-prose my-6">
      <SelfHostConfig
        files={[
          {
            id: "compose",
            label: "docker-compose.yml",
            url: `${REPO}/docker-compose.yml`,
            code: COMPOSE,
            block: <ServerCodeBlock code={COMPOSE} lang="yaml" codeblock={{ allowCopy: false, className: FLAT }} />,
          },
          {
            id: "env",
            label: ".env.example",
            url: `${REPO}/.env.example`,
            code: ENV_EXAMPLE,
            block: <ServerCodeBlock code={ENV_EXAMPLE} lang="bash" codeblock={{ allowCopy: false, className: FLAT }} />,
          },
        ]}
      />
    </div>
  );
}
