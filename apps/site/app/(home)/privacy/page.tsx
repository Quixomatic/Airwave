import { LegalPage } from "@/components/marketing";

export const metadata = {
  title: "Privacy Policy",
  description: "How the getairwave.tv website and the Airwave software handle your data — short version: they don't track you, and the software runs entirely on your own server.",
};

export default function PrivacyPage() {
  return (
    <LegalPage title="Privacy Policy" updated="August 12, 2026">
      <p>
        Airwave is free, open, self-hostable software, operated as a project from Virginia, USA. This policy
        explains what data the <strong>getairwave.tv website</strong> and the <strong>Airwave software</strong>{" "}
        do — and do not — collect. The short version: the website does not track you, and the software runs
        entirely on <strong>your</strong> own server and phones nothing home to us.
      </p>

      <h2>The website (getairwave.tv)</h2>
      <p>
        This site is a static documentation and marketing site. It has <strong>no user accounts</strong>, sets{" "}
        <strong>no advertising or tracking cookies</strong>, and includes <strong>no analytics or advertising
        SDKs</strong>. A theme preference (light/dark) may be stored locally in your browser; it never leaves
        your device.
      </p>
      <p>
        The site is hosted on Vercel, which — like any web host — processes standard server request logs (such
        as IP address, user-agent, and timestamps) to serve and secure the site. That processing is governed by{" "}
        <a href="https://vercel.com/legal/privacy-policy" target="_blank" rel="noreferrer noopener">
          Vercel&apos;s privacy policy
        </a>
        . If we ever add privacy-respecting, cookie-free analytics, we will update this page first.
      </p>

      <h2>The Airwave software (self-hosted)</h2>
      <p>
        When you self-host Airwave, it runs entirely on <strong>your</strong> server. Your data — the Plex
        library metadata cache, viewer accounts, watch history, channel definitions, and settings — is stored in{" "}
        <strong>your</strong> database on <strong>your</strong> infrastructure. Airwave sends{" "}
        <strong>no telemetry, analytics, crash reports, or usage data</strong> to the project maintainers or any
        third party. We never receive it, because it never leaves your deployment.
      </p>
      <p>
        Because of this, <strong>you are the data controller</strong> for your own Airwave instance. If you
        share access with other people (family, friends), you are responsible for the data of the accounts you
        create and the content you make available to them.
      </p>

      <h2>What the software connects to</h2>
      <p>Airwave only connects to services you control or explicitly configure:</p>
      <ul>
        <li>
          <strong>Your Plex Media Server and plex.tv</strong> — to sign in with Plex, discover your servers, and
          stream your media. Sign-in uses Plex&apos;s official flow; Plex handles your credentials, and Airwave
          stores only the resulting token — <strong>encrypted at rest</strong> in your database.
        </li>
        <li>
          <strong>An optional AI provider</strong> — only if <em>you</em> add one, using <em>your own</em> API
          key, to help draft channel lineups. Nothing is sent to it until you configure it, and it is governed
          by that provider&apos;s terms.
        </li>
      </ul>
      <p>
        Airwave does <strong>not</strong> use any third-party metadata, caching, or analytics services of its
        own — it reads metadata directly from your Plex library.
      </p>

      <h2>On your devices (the apps)</h2>
      <p>
        The TV and browser apps store a little configuration locally on each device — your Airwave server
        address and a session token — so you stay signed in. That stays on the device until you sign out or
        remove the app. The prebuilt App Store / Google Play apps are a paid convenience; those purchases are
        processed by <strong>Apple and Google</strong> under their own terms, and Airwave never sees your
        payment details.
      </p>

      <h2>Analytics &amp; tracking</h2>
      <p>
        None. No analytics, no cross-app tracking, no advertising, and nothing is sold or rented. Not on the
        website, not in the software.
      </p>

      <h2>Children&apos;s privacy</h2>
      <p>
        The website and app-store purchases are not directed to children under 13, and we do not knowingly
        collect personal information from children. Airwave supports family use (per-user access and kids&apos;
        channels), but what a self-hosted instance makes available, and to whom, is entirely under the control
        of the person operating that instance.
      </p>

      <h2>Data retention</h2>
      <p>
        We (the project) retain nothing about you, because we collect nothing. Data in your self-hosted instance
        stays on your server until you delete it. If you email us, we keep that correspondence only as long as
        needed to respond.
      </p>

      <h2>Your rights</h2>
      <p>
        Depending on where you live — including under the Virginia Consumer Data Protection Act (VCDPA) and
        similar laws — you may have rights to access, correct, or delete personal data a business holds about
        you. Since Airwave collects no personal data centrally and never sells or shares it, there is little for
        us to act on; and for your own self-hosted instance, you already have direct control over all of it. If
        you have a request or question, contact us below.
      </p>

      <h2>Security</h2>
      <p>
        Your Plex owner token is stored <strong>encrypted at rest</strong> in your database and is used
        server-side to broker playback. That said, no transmission or storage system is completely secure —
        please secure your own server, network, and accounts. A server or relay you configure may use plain
        HTTP rather than HTTPS on your own network; that choice is yours.
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
        </a>{" "}
        — note that GitHub activity is public, so please don&apos;t include passwords, tokens, or other
        sensitive information there. Airwave is operated from Virginia, USA.
      </p>
    </LegalPage>
  );
}
