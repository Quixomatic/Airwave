import { createPrismaClient } from "@ChannelGuide/db";
import { env } from "@ChannelGuide/env/server";
import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { admin, deviceAuthorization, genericOAuth, magicLink } from "better-auth/plugins";

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

  return betterAuth({
    database: prismaAdapter(prisma, { provider: "postgresql" }),

    secret: env.BETTER_AUTH_SECRET,
    baseURL: env.BETTER_AUTH_URL,
    trustedOrigins: [env.CORS_ORIGIN],

    // Regular email/password login is always available. Linking a personal
    // Plex account is optional (playback falls back to the owner's connection).
    emailAndPassword: {
      enabled: true,
      requireEmailVerification: false,
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
        sameSite: "none",
        secure: true,
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

      // RFC 8628 device grant — lets a TV log into an EXISTING ChannelGuide
      // account via a user code approved at /device on a phone/computer.
      deviceAuthorization({
        verificationUri: "/device",
        expiresIn: "30m",
        interval: "5s",
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
