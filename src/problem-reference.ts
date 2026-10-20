import type { Problem } from "./engine";
export type ProblemMetadata = Pick<
  Problem,
  "problemNumber" | "title" | "url" | "difficulty" | "tags"
>;
export type ProblemReference =
  { kind: "number"; number: number } | { kind: "slug"; slug: string };
export const validSlug = (value: unknown): value is string =>
  typeof value === "string" &&
  /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value) &&
  value.length <= 200;
export function parseProblemReference(raw: string): ProblemReference {
  const input = raw.trim();
  if (!input || input.length > 2048)
    throw Error("Enter a LeetCode problem link or a positive problem number.");
  if (/^#?\d+$/.test(input)) {
    const number = Number(input.replace(/^#/, ""));
    if (Number.isSafeInteger(number) && number > 0)
      return { kind: "number", number };
    throw Error("Enter a positive whole problem number.");
  }
  try {
    const url = new URL(
      /^(?:www\.)?leetcode\.com\//i.test(input) ? "https://" + input : input,
    );
    const match = url.pathname.match(/^\/problems\/([^/]+)(?:\/.*)?$/);
    if (
      !["https:", "http:"].includes(url.protocol) ||
      !["leetcode.com", "www.leetcode.com"].includes(url.hostname) ||
      url.port ||
      url.username ||
      url.password ||
      !match ||
      !validSlug(match[1])
    )
      throw Error();
    return { kind: "slug", slug: match[1] };
  } catch {
    throw Error(
      "Use a leetcode.com/problems/… link or a problem number, such as 1.",
    );
  }
}
export function readProblemMetadata(value: unknown): ProblemMetadata {
  const p = value as Partial<ProblemMetadata> | null;
  if (
    !p ||
    typeof p !== "object" ||
    !Number.isSafeInteger(p.problemNumber) ||
    p.problemNumber! <= 0 ||
    typeof p.title !== "string" ||
    !p.title.trim() ||
    p.title.length > 512 ||
    !["Easy", "Medium", "Hard"].includes(p.difficulty ?? "") ||
    !Array.isArray(p.tags) ||
    !p.tags.every(
      (t) => typeof t === "string" && t.trim() && t.length <= 100,
    ) ||
    typeof p.url !== "string"
  )
    throw Error("Invalid problem metadata.");
  const reference = parseProblemReference(p.url);
  if (
    reference.kind !== "slug" ||
    p.url !== `https://leetcode.com/problems/${reference.slug}/`
  )
    throw Error("Invalid problem metadata URL.");
  return {
    problemNumber: p.problemNumber!,
    title: p.title.trim(),
    url: p.url,
    difficulty: p.difficulty!,
    tags: [...new Set(p.tags)],
  };
}
