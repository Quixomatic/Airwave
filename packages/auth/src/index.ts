import { createPrismaClient } from "@ChannelGuide/db";
import { env } from "@ChannelGuide/env/server";
import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { admin, deviceAuthorization, magicLink } from "better-auth/plugins";

export function createAuth() {
  const prisma = createPrismaClient();

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

    account: {
      // We store users' Plex tokens on their linked account row — encrypt at rest.
      encryptOAuthTokens: true,
      accountLinking: {
        enabled: true,
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
      // "user" as Viewer for now. Custom access-control roles (a named "viewer"
      // + granular permission statements) can be layered later with no schema
      // change. See .docs/architecture.md §10.
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

      // Passwordless email login. Optional in practice — real delivery needs
      // SMTP/Resend configured; dev just logs the link.
      // TODO(email): wire a real sender before relying on this in prod.
      magicLink({
        expiresIn: 300,
        sendMagicLink: async ({ email, url }) => {
          console.log(`🔗 Magic link for ${email}:\n${url}\n`);
        },
      }),

      // TODO(plex): custom "Sign in with Plex" provider implementing the
      // plex.tv/pins PIN flow (Overseerr-style) for admin + TV. Yields the
      // user's Plex identity + token, stored as a linked account (providerId
      // "plex"). Added in the Plex-connection step; see .docs/architecture.md §10.
    ],
  });
}

export const auth = createAuth();
