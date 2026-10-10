import { gracefulRouter } from "~/server/api/routers/graceful";
import { postRouter } from "~/server/api/routers/post";
import { createCallerFactory, createTRPCRouter } from "~/server/api/trpc";
export const appRouter = createTRPCRouter({
  post: postRouter,
  graceful: gracefulRouter,
});
export type AppRouter = typeof appRouter;
export const createCaller = createCallerFactory(appRouter);
