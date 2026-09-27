import { OpenAPIHono, createRoute, z } from "@hono/zod-openapi";

import { listActivePackages } from "@airwave/api/services/packages";
import prisma from "@airwave/db";

import type { PublicVars } from "../context";
import { apiKeySecurity, errorResponses } from "../dtos";
import { ChannelDTO, channelSelect, toChannelDTO } from "./channels";

const packageShape = z.object({
  id: z.string(),
  key: z.string().nullable(),
  name: z.string(),
  icon: z.string().nullable(),
  tint: z.string().nullable(),
  channelCount: z.number().int().describe("Channels in this package that you can access."),
});

const pkgExample = {
  id: "clx9pkg01",
  key: "comedy",
  name: "Comedy & Fun",
  icon: "lucide:Laugh",
  tint: "amber",
  channelCount: 6,
};

const PackageDTO = packageShape.openapi("Package", { example: pkgExample });
const PackageDetailDTO = packageShape
  .extend({ channels: z.array(ChannelDTO) })
  .openapi("PackageDetail", { example: { ...pkgExample, channels: [] } });

export const packageRoutes = new OpenAPIHono<{ Variables: PublicVars }>();

packageRoutes.openapi(
  createRoute({
    method: "get",
    path: "/packages",
    tags: ["Packages"],
    summary: "List packages",
    description: "Packages that contain at least one channel you can access.",
    security: apiKeySecurity,
    responses: {
      200: {
        description: "Packages.",
        content: { "application/json": { schema: z.object({ packages: z.array(PackageDTO) }) } },
      },
      401: errorResponses[401],
    },
  }),
  async (c) => {
    const pkgs = await listActivePackages(prisma, c.get("access"));
    return c.json(
      {
        packages: pkgs.map((p) => ({
          id: p.id,
          key: p.key ?? null,
          name: p.name,
          icon: p.icon ?? null,
          tint: p.tint ?? null,
          channelCount: p.channelCount,
        })),
      },
      200,
    );
  },
);

packageRoutes.openapi(
  createRoute({
    method: "get",
    path: "/packages/{id}",
    tags: ["Packages"],
    summary: "Get a package and its channels",
    security: apiKeySecurity,
    request: { params: z.object({ id: z.string() }) },
    responses: {
      200: { description: "Package.", content: { "application/json": { schema: PackageDetailDTO } } },
      401: errorResponses[401],
      404: errorResponses[404],
    },
  }),
  async (c) => {
    const access = c.get("access");
    const { id } = c.req.valid("param");
    const pkg = await prisma.channelPackage.findUnique({
      where: { id },
      select: { id: true, key: true, name: true, icon: true, tint: true },
    });
    if (!pkg) return c.json({ error: { code: "not_found", message: "Package not found." } }, 404);
    const rows = await prisma.channel.findMany({
      where: { enabled: true, packageId: id, ...(access !== "all" ? { id: { in: [...access] } } : {}) },
      orderBy: { number: "asc" },
      select: channelSelect(false),
    });
    const channels = rows.map((r) => toChannelDTO(r, false));
    return c.json(
      {
        id: pkg.id,
        key: pkg.key ?? null,
        name: pkg.name,
        icon: pkg.icon ?? null,
        tint: pkg.tint ?? null,
        channelCount: channels.length,
        channels,
      },
      200,
    );
  },
);
