import { parseExport, MAX_IMPORT_BYTES } from "./export-format";
self.onmessage = async (e: MessageEvent<File>) => {
  try {
    if (e.data.size > MAX_IMPORT_BYTES)
      throw Error("File exceeds the 10 MiB import limit.");
    self.postMessage({ result: parseExport(await e.data.text()) });
  } catch (error) {
    self.postMessage({
      error: error instanceof Error ? error.message : "File validation failed.",
    });
  }
};
