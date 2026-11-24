/** Product defaults; the server may lower or raise these with explicit configuration. */
export const TRANSFER_LIMITS = {
  csvBytes: 1024 * 1024,
  csvRows: 10_000,
  csvColumns: 100,
  csvFieldChars: 20_000,
  backupBytes: 16 * 1024 * 1024,
  backupRows: 100_000,
  jsonDepth: 32,
  batchRows: 500,
} as const;

export class TransferInputError extends Error {
  constructor(message: string, public readonly status = 400) { super(message); }
}

/** Bounds nesting before JSON.parse, including ignored/unknown sections. */
export function boundedJson(text: string, bytes: number): unknown {
  if (typeof text !== "string") throw new TransferInputError("Expected JSON text.");
  if (new TextEncoder().encode(text).byteLength > bytes) throw new TransferInputError("The file exceeds the upload limit.", 413);
  let depth = 0, quoted = false, escaped = false;
  for (const character of text) {
    if (quoted) {
      if (escaped) escaped = false;
      else if (character === "\\") escaped = true;
      else if (character === '"') quoted = false;
    } else if (character === '"') quoted = true;
    else if (character === "{" || character === "[") {
      if (++depth > TRANSFER_LIMITS.jsonDepth) throw new TransferInputError("JSON is nested too deeply.");
    } else if (character === "}" || character === "]") depth--;
  }
  try { return JSON.parse(text); }
  catch { throw new TransferInputError("The file isn't valid JSON."); }
}
