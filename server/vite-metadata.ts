import type { Plugin, ViteDevServer } from "vite";
import { handleLookupRequest } from "./problem-handler";
import hosting from "../hosting.config.json";
export function metadataPlugin(): Plugin {
  const install = (server: Pick<ViteDevServer, "middlewares">) => {
    server.middlewares.use(async (req, res, next) => {
      const url = new URL(req.url ?? "/", "http://localhost");
      if (url.pathname !== `${hosting.base}api/problem.json`) {
        next();
        return;
      }
      try {
        const response = await handleLookupRequest(
          new Request(url, { method: req.method ?? "GET" }),
        );
        res.statusCode = response.status;
        response.headers.forEach((value, key) => res.setHeader(key, value));
        res.end(await response.text());
      } catch {
        res.statusCode = 503;
        res.setHeader("Content-Type", "application/json");
        res.setHeader("Cache-Control", "no-store");
        res.end(
          JSON.stringify({
            error: "Problem lookup is unavailable. Try manual entry.",
          }),
        );
      }
    });
  };
  return {
    name: "leetleitner-metadata",
    configureServer: install,
    configurePreviewServer: install,
  };
}
