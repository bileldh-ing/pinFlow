export interface TemplateDef {
  id: string;
  title: string;
  category: string;
  boardFqbn: string;
  description: string;
  dependencies: Array<{ name: string; version?: string }>;
  origin: string;
  files: Array<{ path: string; content: string }>;
}
