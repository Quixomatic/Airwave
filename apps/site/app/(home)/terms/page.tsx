import { LegalPage } from "@/components/marketing";

export const metadata = {
  title: "Terms of Service",
  description: "The terms for using the Airwave software and the getairwave.tv website.",
};

export default function TermsPage() {
  return (
    <LegalPage title="Terms of Service" updated="August 12, 2026">
      <p>
        These terms cover your use of the <strong>Airwave software</strong> and the{" "}
        <strong>getairwave.tv website</strong>. Airwave is a free, open project. By using the software or the
        website, you agree to these terms.
      </p>

      <h2>The software is provided “as is”</h2>
      <p>
        Airwave is provided free of charge, <strong>without warranty of any kind</strong>, express or implied,
        including but not limited to merchantability, fitness for a particular purpose, and non-infringement.
        You run it at your own risk. To the maximum extent permitted by law, the maintainers are{" "}
        <strong>not liable</strong> for any damages arising from your use of, or inability to use, the software
        — including data loss, service interruption, or issues with your media server.
      </p>

      <h2>Your responsibilities</h2>
      <ul>
        <li>
          <strong>Your deployment.</strong> You are responsible for hosting, securing, updating, and backing up
          your own Airwave server and its database.
        </li>
        <li>
          <strong>Your content.</strong> Airwave provides <strong>no media of its own</strong> — it organizes
          and streams the content in <strong>your</strong> Plex library. You are solely responsible for
          ensuring you have the legal right to store, stream, and share that content with your viewers.
        </li>
        <li>
          <strong>Your users.</strong> If you share access with other people, you are responsible for who you
          grant access to and how they use it.
        </li>
      </ul>

      <h2>Not affiliated with Plex</h2>
      <p>
        Airwave is an independent project. It is <strong>not affiliated with, endorsed by, or sponsored by
        Plex, Inc.</strong> “Plex” and related marks are trademarks of Plex, Inc. Airwave interoperates with
        Plex Media Servers that you own and control.
      </p>

      <h2>The website</h2>
      <p>
        The getairwave.tv website is provided for informational purposes, as is, and may change or be
        unavailable at any time.
      </p>

      <h2>Changes to these terms</h2>
      <p>
        We may update these terms as the project evolves; the “Last updated” date above reflects the current
        version. Continued use after a change constitutes acceptance of the updated terms.
      </p>

      <h2>Contact</h2>
      <p>
        Questions? Email <a href="mailto:contact@getairwave.tv">contact@getairwave.tv</a> or reach us on{" "}
        <a href="https://github.com/Quixomatic/Airwave" target="_blank" rel="noreferrer noopener">
          GitHub
        </a>
        .
      </p>
    </LegalPage>
  );
}
