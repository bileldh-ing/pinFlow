import { z } from "zod";
import { DEFAULT_LIMITS } from "./paths.js";

const id = z
  .string()
  .min(1)
  .max(128)
  .regex(/^[A-Za-z0-9_.:-]+$/, "must be an opaque id ([A-Za-z0-9_.:-])");

/** Opaque id; integer ids (e.g. DB revision numbers) are accepted and normalised to strings. */
const idOrInt = z.union([id, z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER)]).transform((v) => String(v));

export const submitJobSchema = z
  .object({
    projectId: idOrInt,
    revisionId: idOrInt,
    fqbn: z.string().min(3).max(128).regex(/^[a-z0-9_-]+:[a-z0-9_-]+:[a-z0-9_-]+$/i, "invalid FQBN"),
    files: z
      .array(
        z
          .object({
            path: z.string().min(1).max(DEFAULT_LIMITS.maxPathLength),
            content: z.string().max(DEFAULT_LIMITS.maxFileBytes),
          })
          .strict(),
      )
      .min(1)
      .max(DEFAULT_LIMITS.maxFiles),
    sourceHash: z.string().min(1).max(128).regex(/^[A-Za-z0-9:_-]+$/, "invalid sourceHash"),
    sketchName: z.string().min(1).max(63).optional(),
  })
  .strict();

export type SubmitJobInput = z.infer<typeof submitJobSchema>;
