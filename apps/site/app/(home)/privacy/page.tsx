import { LegalPage } from "@/components/marketing";

export const metadata = {
  title: "Privacy Policy",
  description: "How the getairwave.tv website and the Airwave software handle your data.",
};

export default function PrivacyPage() {
  return (
    <LegalPage title="Privacy Policy" updated="August 12, 2026">
      <p>
        Airwave is free, open, self-hostable software. This policy explains what data the{" "}
        <strong>getairwave.tv website</strong> and the <strong>Airwave software</strong> do — and do not —
        collect. The short version: the website does not track you, and the software runs entirely on your own
        server and phones nothing home.
      </p>

      <h2>The website (getairwave.tv)</h2>
      <p>
        This site is a static documentation and marketing site. It has <strong>no user accounts</strong>, sets{" "}
        <strong>no advertising or tracking cookies</strong>, and includes <strong>no analytics or
        advertising SDKs</strong>. A theme preference (light/dark) may be stored locally in your browser; it
        never leaves your device.
      </p>
      <p>
        The site is hosted on Vercel, which — like any web host — processes standard server request logs (such
        as IP address, user-agent, and timestamps) to serve and secure the site. That processing is governed by{" "}
        <a href="https://vercel.com/legal/privacy-policy" target="_blank" rel="noreferrer noopener">
          Vercel&apos;s privacy policy
        </a>
        . If we ever add privacy-respecting analytics, we will update this page first.
      </p>

      <h2>The Airwave software (self-hosted)</h2>
      <p>
        When you self-host Airwave, it runs entirely on <strong>your</strong> server. Your data — your Plex
        library metadata cache, viewer accounts, watch history, and settings — is stored in{" "}
        <strong>your</strong> database on <strong>your</strong> infrastructure. Airwave sends{" "}
        <strong>no telemetry, analytics, or usage data</strong> to the project maintainers or any third party.
        We never receive it, because it never leaves your deployment.
      </p>
      <p>The software connects only to services you control or configure:</p>
      <ul>
        <li>
          <strong>Your Plex Media Server and plex.tv</strong> — for signing in with Plex, discovering your
          servers, and streaming your media.
        </li>
        <li>
          <strong>An optional AI provider</strong> — only if you add one, using your own API key, to draft
          channel lineups. Nothing is sent to it until you configure it.
        </li>
      </ul>
      <p>
        Your Plex owner token is stored <strong>encrypted at rest</strong> in your database, and clients never
        receive it. Admin sessions use a standard session cookie on your own server.
      </p>

      <h2>Children</h2>
      <p>
        The website is not directed to children. What content a self-hosted Airwave instance makes available,
        and to whom, is entirely under the control of the person operating that instance.
      </p>

      <h2>Changes</h2>
      <p>
        We may update this policy as the project evolves. Material changes will be reflected by the “Last
        updated” date above.
      </p>

      <h2>Contact</h2>
      <p>
        Questions? Email <a href="mailto:contact@getairwave.tv">contact@getairwave.tv</a> or open a discussion
        on{" "}
        <a href="https://github.com/Quixomatic/Airwave/discussions" target="_blank" rel="noreferrer noopener">
          GitHub
        </a>
        .
      </p>
    </LegalPage>
  );
}
