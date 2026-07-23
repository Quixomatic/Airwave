import { useRouter } from "expo-router";

import { Diagnostic } from "@/features/diagnostic/diagnostic";

/** /diagnostic — the capability onboarding; on exit, into the guide. */
export default function DiagnosticRoute() {
  const router = useRouter();
  return <Diagnostic onExit={() => router.replace("/guide")} />;
}
