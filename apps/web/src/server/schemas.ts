import { z } from "zod";

export const emailSchema = z.string().trim().toLowerCase().pipe(z.email({ message: "Enter a valid email address" })).refine((s) => s.length <= 254, "Email is too long");
export const passwordSchema = z.string().min(10, "Use at least 10 characters").max(200, "Password is too long");
export const signupSchema = z.object({ email: emailSchema, password: passwordSchema, displayName: z.string().trim().max(80).optional().default("") });
export const loginSchema = z.object({ email: emailSchema, password: z.string().min(1, "Enter your password").max(200) });
export const resetRequestSchema = z.object({ email: emailSchema });
export const resetSchema = z.object({ token: z.string().min(10).max(200), password: passwordSchema });

export const FQBN_RE = /^[a-z0-9_.-]+:[a-z0-9_.-]+:[a-z0-9_.-]+(:[A-Za-z0-9_=,.-]+)?$/i;
export const fqbnSchema = z.string().trim().max(120).regex(FQBN_RE, "Invalid FQBN");
export const titleSchema = z.string().trim().min(1, "Title is required").max(120);
export const fileSchema = z.object({ path: z.string().min(1).max(128), content: z.string().max(512 * 1024) });

export const saveSchema = z.object({
  expectedRevision: z.number().int().min(1),
  files: z.array(fileSchema).min(1).max(32),
  workspace: z.unknown().optional(),
  ir: z.unknown().optional(),
  coverageRatio: z.number().min(0).max(1).nullable().optional(),
  message: z.string().max(200).optional(),
});

export const compileSchema = z.object({ expectedRevision: z.number().int().min(1), fqbn: fqbnSchema.optional() });

export const preferencesSchema = z.object({
  skillLevel: z.enum(["beginner", "intermediate", "advanced"]).optional(),
  preferredBoard: fqbnSchema.optional(),
  layout: z.enum(["side-by-side", "blocks-first", "code-first", "focus"]).optional(),
  theme: z.enum(["dark", "light"]).optional(),
  editorFontSize: z.number().int().min(10).max(24).optional(),
});

export const dependencySchema = z.object({ name: z.string().trim().min(1).max(120), version: z.string().trim().max(40).optional().nullable() });
