import { createPrismaClient } from "@ChannelGuide/db";
import { env } from "@ChannelGuide/env/server";
import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { admin, deviceAuthorization, magicLink } from "better-auth/plugins";

export function createAuth() {
  const prisma = createPrismaClient();

  // Social providers are enabled only when BOTH the id + secret are set
  // (matches the BasicTimeTracker pattern). Add a provider = add an if-block.
  const socialProviders: Record<string, { clientId: string; clientSecret: string }> = {};
  if (env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET) {
    socialProviders.google = {
      clientId: env.GOOGLE_CLIENT_ID,
      clientSecret: env.GOOGLE_CLIENT_SECRET,
    };
  }
  if (env.GITHUB_CLIENT_ID && env.GITHUB_CLIENT_SECRET) {
    socialProviders.github = {
      clientId: env.GITHUB_CLIENT_ID,
      clientSecret: env.GITHUB_CLIENT_SECRET,
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

      // TODO(plex): web Plex sign-in via a custom redirect flow (create pin →
      // app.plex.tv/auth?forwardUrl=... → callback fetches the token by pin id →
      // create/link user + session). The PIN/poll variant is TV-only, separate.
    ],
  });
}

export const auth = createAuth();
