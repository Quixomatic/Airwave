import { createEnv } from "@t3-oss/env-core";
import { z } from "zod";

export const env = createEnv({
  clientPrefix: "VITE_",
  client: {
    // Optional on purpose: the PACKAGED desktop admin ships with NO baked VITE_SERVER_URL — the supervisor
    // resolves a free port every launch and INJECTS the real URL at serve time (window.__AIRWAVE_ENV__, read by
    // runtime-env.ts serverUrl()). If this were required, createEnv would throw "Invalid environment variables"
    // at import and white-screen the admin before the injection is ever read. Vercel/dev still set it explicitly.
    VITE_SERVER_URL: z.url().optional(),
  },
  runtimeEnv: (import.meta as any).env,
  skipValidation: !!process.env.SKIP_ENV_VALIDATION,
  emptyStringAsUndefined: true,
});
