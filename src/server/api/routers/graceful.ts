import { z } from "zod";
import {
  selectAlgorithm,
  solveGraceful,
  validateTree,
  verifyGraceful,
} from "~/lib/graceful-labeling";
import { createTRPCRouter, publicProcedure } from "~/server/api/trpc";
const adjSchema = z
  .array(z.array(z.number().int().nonnegative()))
  .min(1)
  .max(2000);
export const gracefulRouter = createTRPCRouter({
  algorithmFor: publicProcedure
    .input(z.object({ vertices: z.number().int().min(1).max(2000) }))
    .query(({ input }) => ({ algorithm: selectAlgorithm(input.vertices) })),
  verify: publicProcedure
    .input(
      z.object({
        adj: adjSchema,
        labeling: z.array(z.number().int()).min(1).max(2000),
      }),
    )
    .query(({ input }) => verifyGraceful(input.adj, input.labeling)),
  solve: publicProcedure
    .input(
      z.object({
        adj: adjSchema,
        timeLimitMs: z
          .union([z.number().int().min(500).max(120000), z.literal("infinite")])
          .default(15000),
        algorithm: z
          .enum(["backtracking-mrv", "ac3-cp", "stochastic-local-search"])
          .optional(),
        seed: z.number().int().optional(),
      }),
    )
    .mutation(async ({ input }) => {
      const validity = validateTree(input.adj);
      if (!validity.valid) {
        return {
          labeling: null,
          edgeLabels: null,
          edges: [],
          graceful: false,
          algorithm: selectAlgorithm(input.adj.length),
          timeMs: 0,
          iterations: 0,
          complete: true,
          message: validity.reason ?? "Invalid tree.",
        };
      }
      return solveGraceful(input.adj, {
        timeLimitMs:
          input.timeLimitMs === "infinite" ? Infinity : input.timeLimitMs,
        algorithm: input.algorithm,
        seed: input.seed,
      });
    }),
});
