import { rm } from "node:fs/promises";
import { resolve, relative } from "node:path";
import { fileURLToPath } from "node:url";
const root = fileURLToPath(new URL("..", import.meta.url));
const target = resolve(root, "dist");
if (relative(root, target) !== "dist")
  throw Error("Refusing to clean outside the project build directory.");
await rm(target, { recursive: true, force: true });
