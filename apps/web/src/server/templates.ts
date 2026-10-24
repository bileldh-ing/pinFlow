import "server-only";
import { TEMPLATES } from "@/generated/templates";
import type { TemplateDef } from "@/lib/templates-types";

export function listTemplates(): TemplateDef[] { return TEMPLATES; }
export function getTemplate(id: string): TemplateDef | undefined { return TEMPLATES.find((t) => t.id === id); }
