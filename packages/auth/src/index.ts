import { createPrismaClient } from "@airwave/db";
import { env } from "@airwave/env/server";
import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { apiKey } from "@better-auth/api-key";
import { admin, bearer, deviceAuthorization, genericOAuth, magicLink } from "better-auth/plugins";

import { PLEX_CLIENT_ID, getPinToken, getPlexAccount } from "./lib/plex-login";

export function createAuth() {
  const prisma = createPrismaClient();

  // Social providers are enabled only when BOTH the id + secret are set
  // (matches the BasicTimeTracker pattern). Add a provider = add an if-block.
  // `disableSignUp: true` = login-only. A social sign-in only works if an
  // account with that email already exists (via `accountLinking`); it never
  // creates one. Provisioning happens via "Import Plex Users".
  const socialProviders: Record<
    string,
    { clientId: string; clientSecret: string; disableSignUp: boolean }
  > = {};
  if (env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET) {
    socialProviders.google = {
      clientId: env.GOOGLE_CLIENT_ID,
      clientSecret: env.GOOGLE_CLIENT_SECRET,
      disableSignUp: true,
    };
  }
  if (env.GITHUB_CLIENT_ID && env.GITHUB_CLIENT_SECRET) {
    socialProviders.github = {
      clientId: env.GITHUB_CLIENT_ID,
      clientSecret: env.GITHUB_CLIENT_SECRET,
      disableSignUp: true,
    };
  }

  // Cross-origin admin cookies want sameSite:none;secure — but browsers ONLY honor a
  // Secure cookie over HTTPS (localhost is the one http exception). On a plain-HTTP LAN
  // deploy (http://<host>:port) a Secure cookie is silently dropped, so admin login would
  // fail. Derive the attributes from the scheme: HTTPS → none/secure (also covers cross-site
  // setups); HTTP → lax/insecure, which still works because the admin web and the server
  // share a host, so requests between their ports are same-site. (Admin + server on
  // *different* hosts over plain HTTP is unsupported — put a TLS proxy in front.)
  const httpsAuth = env.BETTER_AUTH_URL.startsWith("https:");

  return betterAuth({
    database: prismaAdapter(prisma, { provider: "postgresql" }),

    secret: env.BETTER_AUTH_SECRET,
    baseURL: env.BETTER_AUTH_URL,
    // Admin web origin + the TV app origin (when set) + any EXTRA_CORS_ORIGINS (comma-separated,
    // e.g. a LAN IP alongside the public domain) — for OAuth/device flows and cross-origin auth.
    // A FUNCTION so we can UNION in the Airwave Cloud subdomains dynamically: when this server is paired,
    // reaching the admin/tv-web at `<subdomain>.<relayHost>` over the tunnel arrives with that Origin, which
    // must be trusted for auth to accept it. The env origins (a self-hosted reverse-proxy setup) keep working
    // unchanged — the cloud subdomains are purely additive.
    trustedOrigins: async () => {
      const origins = [
        env.CORS_ORIGIN,
        ...(env.TV_APP_ORIGIN ? [env.TV_APP_ORIGIN] : []),
        ...(env.EXTRA_CORS_ORIGINS ?? "").split(",").map((o) => o.trim()).filter(Boolean),
      ];
      try {
        const ra = await prisma.remoteAccess.findUnique({
          where: { key: "global" },
          select: { status: true, subdomain: true, tvSubdomain: true, relayHost: true },
        });
        if (ra?.status === "bound" && ra.relayHost) {
          if (ra.subdomain) origins.push(`https://${ra.subdomain}.${ra.relayHost}`);
          if (ra.tvSubdomain) origins.push(`https://${ra.tvSubdomain}.${ra.relayHost}`);
        }
      } catch {
        /* DB hiccup — fall back to the static env origins */
      }
      return origins;
    },

    // Regular email/password login is always available. Linking a personal
    // Plex account is optional (playback falls back to the owner's connection).
    emailAndPassword: {
      enabled: true,
      requireEmailVerification: false,
      // No public sign-up — accounts are admin-created only (the seeded admin, an admin-created
      // viewer via the admin plugin's createUser, or Import Plex Users). Without this, the
      // `/api/auth/sign-up/email` endpoint would let anyone self-provision a viewer account.
      disableSignUp: true,
    },

    ...(Object.keys(socialProviders).length > 0 && { socialProviders }),

    account: {
      // We store users' OAuth/Plex tokens on their linked account row — encrypt.
      encryptOAuthTokens: true,
      accountLinking: {
        enabled: true,
        trustedProviders: ["google", "github"],
      },
    },

    session: {
      expiresIn: 60 * 60 * 24 * 30, // 30 days
      cookieCache: { enabled: true, maxAge: 5 * 60 },
    },

    advanced: {
      defaultCookieAttributes: {
        sameSite: httpsAuth ? "none" : "lax",
        secure: httpsAuth,
        httpOnly: true,
      },
    },

    plugins: [
      // Roles + user management. Built-in roles are "admin"/"user"; we treat
      // "user" as Viewer for now. See .docs/architecture.md §10.
      admin({
        defaultRole: "user",
        adminRoles: ["admin"],
      }),

      // Lets a session be carried as `Authorization: Bearer <token>` instead of a
      // cookie — the auth model for native/TV clients (webOS), where sameSite:none
      // cookies are awkward. The device-code flow (deviceAuthorization) mints a
      // session; bearer makes it a token the TV app sends on every REST call.
      // On sign-in the token comes back in the `set-auth-token` response header.
      bearer(),

      // Long-lived API keys (for the MCP tool surface + any machine client). Keys are minted server-side
      // with an `airwave_` prefix + tied to an admin user, sent as `x-api-key`, and verified via
      // `auth.api.verifyApiKey`. `enableMetadata` lets a key carry flags (e.g. `readOnly`) for the dispatcher.
      // `rateLimit.enabled: false` turns OFF the plugin's built-in per-key rate limiting (default is on at
      // ~10 req/day, which 429s an active MCP client). `evaluateRateLimit` short-circuits on this global flag
      // before any per-key column, so it covers the seeded admin key, UI-created keys, and any future ones.
      // These are trusted admin machine keys on a self-hosted server; we don't want to throttle them.
      apiKey({ enableMetadata: true, rateLimit: { enabled: false } }),

      // RFC 8628 device grant — lets a TV log into an EXISTING Airwave
      // account via a user code approved at /device on a phone/computer. This
      // is the non-Plex TV login path (the Plex path is /api/tv/auth/plex/*).
      // verificationUri is absolute → the web app's /device page (where the
      // user is logged in), so the TV's QR / verification_uri_complete point
      // there: `${CORS_ORIGIN}/device?user_code=XXXX`.
      deviceAuthorization({
        verificationUri: `${env.CORS_ORIGIN}/device`,
        expiresIn: "30m",
        interval: "5s",
        // Short Plex-style code (default is 8). 4 chars from better-auth's
        // unambiguous charset — fine for self-hosted + a 30m expiry.
        userCodeLength: 4,
      }),

      // Passwordless email login. Optional — real delivery needs SMTP/Resend;
      // dev just logs the link. TODO(email): wire a real sender for prod.
      magicLink({
        expiresIn: 300,
        sendMagicLink: async ({ email, url }) => {
          console.log(`🔗 Magic link for ${email}:\n${url}\n`);
        },
      }),

      // Web "Sign in with Plex". genericOAuth drives the standard OAuth machinery
      // (session, email-linking, login-only); the `plex` provider's authorizationUrl
      // points at our /api/plex/authorize proxy, which creates a pin and bounces to
      // Plex, smuggling the pin id back as the `code`. getToken then fetches the real
      // Plex token by that pin id; getUserInfo reads the Plex account (email).
      genericOAuth({
        config: [
          {
            providerId: "plex",
            clientId: PLEX_CLIENT_ID,
            clientSecret: "unused", // Plex issues no client secret
            authorizationUrl: `${env.BETTER_AUTH_URL}/api/plex/authorize`,
            // Required by genericOAuth's config validation, but both are overridden
            // at runtime by getToken / getUserInfo below (Plex isn't standard OAuth2).
            tokenUrl: "https://plex.tv/api/v2/pins",
            userInfoUrl: "https://plex.tv/api/v2/user",
            pkce: false,
            disableSignUp: true, // login-only — provisioning is via Import Plex Users
            getToken: async ({ code }) => {
              const token = await getPinToken(Number(code));
              if (!token) throw new Error("Plex authorization was not completed.");
              return { accessToken: token };
            },
            getUserInfo: async (tokens) => {
              const account = await getPlexAccount(tokens.accessToken as string);
              return {
                id: String(account.id),
                email: account.email,
                name: account.username,
                image: account.thumb ?? undefined,
                emailVerified: true,
              };
            },
          },
        ],
      }),
    ],
  });
}

export const auth = createAuth();
