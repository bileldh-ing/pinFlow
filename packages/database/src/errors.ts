export class NotFoundError extends Error {
  readonly code = "not_found";
  constructor(what = "Resource") { super(`${what} not found`); this.name = "NotFoundError"; }
}
export class ConflictError extends Error {
  readonly code = "conflict";
  constructor(public readonly currentRevision: number, public readonly expectedRevision: number) {
    super(`Revision conflict: expected ${expectedRevision}, server has ${currentRevision}`);
    this.name = "ConflictError";
  }
}
export class ValidationError extends Error {
  readonly code = "validation";
  constructor(msg: string) { super(msg); this.name = "ValidationError"; }
}
