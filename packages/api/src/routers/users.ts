import { adminProcedure, router } from "../index";

export const usersRouter = router({
  list: adminProcedure.query(async ({ ctx }) => {
    return ctx.prisma.user.findMany({
      orderBy: { createdAt: "asc" },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        image: true,
        createdAt: true,
      },
    });
  }),
});
