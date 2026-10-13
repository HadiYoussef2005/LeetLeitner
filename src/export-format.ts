import { timestamp, validateState } from "./storage";
import type { Store } from "./engine";
export const MAX_IMPORT_BYTES = 10 * 1024 * 1024;
export interface ExportFile {
  format: "leetleitner-state";
  exportVersion: 1;
  exportedAt: string;
  state: Store;
  backupCreatedAt?: string;
}
export function serializeExport(
  state: Store,
  now = new Date(),
  backupCreatedAt?: string,
): string {
  const exported: ExportFile = {
    format: "leetleitner-state",
    exportVersion: 1,
    exportedAt: now.toISOString(),
    state,
  };
  if (backupCreatedAt) exported.backupCreatedAt = backupCreatedAt;
  return JSON.stringify(exported, null, 2);
}
export function parseExport(raw: string): ExportFile {
  if (new TextEncoder().encode(raw).byteLength > MAX_IMPORT_BYTES)
    throw Error("File exceeds the 10 MiB import limit.");
  let value;
  try {
    value = JSON.parse(raw.replace(/^\uFEFF/, ""));
  } catch {
    throw Error(
      "This file is not valid JSON. Choose a LeetLeitner .txt export.",
    );
  }
  if (
    !value ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    value.format !== "leetleitner-state"
  )
    throw Error("This is not a LeetLeitner state export.");
  if (value.exportVersion !== 1)
    throw Error("Unsupported export version. Choose an export version 1 file.");
  const result: ExportFile = {
    format: "leetleitner-state",
    exportVersion: 1,
    exportedAt: timestamp(value.exportedAt, "Export timestamp"),
    state: validateState(value.state),
  };
  if (value.backupCreatedAt !== undefined)
    result.backupCreatedAt = timestamp(
      value.backupCreatedAt,
      "Backup creation timestamp",
    );
  return result;
}
