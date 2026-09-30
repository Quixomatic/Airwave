import { ButtonLink, Container } from "@/components/marketing";

/**
 * The 404 body, WITHOUT any layout chrome. Shared by the two not-found boundaries so the markup lives once:
 * the root `app/not-found.tsx` wraps this in HomeLayout (for top-level / docs 404s, which only get the bare
 * root layout), and `app/(home)/not-found.tsx` renders it directly (the group layout already supplies the
 * header/footer). That split is what keeps the header from doubling on blog pages while still showing on the
 * rest of the site.
 */
export function NotFoundContent() {
  return (
    <div className="relative">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 -top-16 -z-10 mx-auto h-64 max-w-3xl opacity-40 blur-3xl"
        style={{
          background:
            "radial-gradient(closest-side, color-mix(in oklab, var(--color-fd-primary) 35%, transparent), transparent)",
        }}
      />
      <Container className="py-24 text-center sm:py-32">
        <div className="mx-auto max-w-xl">
          <p className="font-display text-[clamp(5rem,18vw,11rem)] leading-none font-bold tracking-[-0.045em] text-fd-foreground">
            404
          </p>
          <h1 className="mt-6 text-balance text-2xl font-semibold tracking-tight text-fd-foreground sm:text-3xl">
            This channel's off the air
          </h1>
          <p className="mx-auto mt-4 max-w-md text-balance text-lg text-fd-muted-foreground">
            The page you're looking for doesn't exist or has moved.
          </p>
          <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
            <ButtonLink href="/">Back home</ButtonLink>
            <ButtonLink href="/docs" variant="secondary">
              Read the docs
            </ButtonLink>
          </div>
        </div>
      </Container>
    </div>
  );
}
