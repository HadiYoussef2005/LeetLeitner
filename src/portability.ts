import {
  serializeExport,
  MAX_IMPORT_BYTES,
  type ExportFile,
} from "./export-format";
import type { Store } from "./engine";
export * from "./export-format";
export function downloadExport(
  state: Store,
  kind: "export" | "backup" = "export",
  backupCreatedAt?: string,
) {
  const now = new Date();
  const url = URL.createObjectURL(
    new Blob([serializeExport(state, now, backupCreatedAt)], {
      type: "text/plain;charset=utf-8",
    }),
  );
  const a = document.createElement("a");
  a.href = url;
  a.download = `leetleitner-${kind}-${now
    .toISOString()
    .replace(/[-:]/g, "")
    .replace(/\.\d+Z$/, "Z")}.txt`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export function validateFile(
  file: File,
  signal: AbortSignal,
): Promise<ExportFile> {
  if (file.size > MAX_IMPORT_BYTES)
    return Promise.reject(Error("File exceeds the 10 MiB import limit."));
  if (signal.aborted)
    return Promise.reject(new DOMException("Canceled", "AbortError"));
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL("./import.worker.ts", import.meta.url), {
      type: "module",
    });
    function cleanup() {
      worker.terminate();
      signal.removeEventListener("abort", abort);
    }
    function abort() {
      cleanup();
      reject(new DOMException("Canceled", "AbortError"));
    }
    signal.addEventListener("abort", abort, { once: true });
    worker.onmessage = (e) => {
      cleanup();
      if (e.data.error) reject(Error(e.data.error));
      else resolve(e.data.result as ExportFile);
    };
    worker.onerror = () => {
      cleanup();
      reject(Error("Could not validate this file. Try selecting it again."));
    };
    worker.postMessage(file);
  });
}
