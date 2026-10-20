import {
  parseProblemReference,
  readProblemMetadata,
  validSlug,
  type ProblemMetadata,
} from "../src/problem-reference.js";
export class LookupError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
const unavailable = () =>
  new LookupError(
    503,
    "LeetCode metadata is unavailable right now. Try again or enter the problem manually.",
  );
const TTL = 60 * 60 * 1000;
const QUERY =
  "query questionData($titleSlug: String!) { question(titleSlug: $titleSlug) { questionFrontendId title titleSlug difficulty topicTags { name } } }";
export function createProblemService(
  fetcher: typeof fetch = fetch,
  clock: () => number = Date.now,
) {
  let catalog: { expires: number; numbers: Map<number, string> } | undefined;
  let catalogPending: Promise<Map<number, string>> | undefined;
  const cache = new Map<
    string,
    { expires: number; problem: ProblemMetadata }
  >();
  const pending = new Map<string, Promise<ProblemMetadata>>();
  async function json(url: URL | string, limit: number): Promise<unknown> {
    try {
      const response = await fetcher(url, {
        method: "GET",
        headers: { Accept: "application/json" },
        redirect: "error",
        signal: AbortSignal.timeout(8000),
      });
      if (!response.ok) throw unavailable();
      if (Number(response.headers.get("content-length")) > limit) {
        await response.body?.cancel();
        throw unavailable();
      }
      const reader = response.body?.getReader();
      if (!reader) throw unavailable();
      let length = 0;
      const chunks: Uint8Array[] = [];
      try {
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          length += value.byteLength;
          if (length > limit) {
            await reader.cancel();
            throw unavailable();
          }
          chunks.push(value);
        }
      } finally {
        reader.releaseLock();
      }
      const bytes = new Uint8Array(length);
      let offset = 0;
      for (const chunk of chunks) {
        bytes.set(chunk, offset);
        offset += chunk.length;
      }
      return JSON.parse(new TextDecoder().decode(bytes));
    } catch {
      throw unavailable();
    }
  }
  async function numbers() {
    if (catalog && catalog.expires > clock()) return catalog.numbers;
    if (catalogPending) return catalogPending;
    catalogPending = (async () => {
      const data = (await json(
        "https://leetcode.com/api/problems/all/",
        6 * 1024 * 1024,
      )) as {
        stat_status_pairs?: {
          stat?: {
            frontend_question_id?: unknown;
            question__title_slug?: unknown;
          };
        }[];
      };
      if (!data || !Array.isArray(data.stat_status_pairs)) throw unavailable();
      const result = new Map<number, string>();
      for (const row of data.stat_status_pairs) {
        const id = row?.stat?.frontend_question_id,
          slug = row?.stat?.question__title_slug;
        const number =
          typeof id === "number"
            ? id
            : typeof id === "string" && /^\d+$/.test(id)
              ? Number(id)
              : NaN;
        if (Number.isSafeInteger(number) && number > 0 && validSlug(slug))
          result.set(number, slug);
      }
      if (!result.size) throw unavailable();
      catalog = { numbers: result, expires: clock() + TTL };
      return result;
    })();
    try {
      return await catalogPending;
    } finally {
      catalogPending = undefined;
    }
  }
  function cached(key: string) {
    const entry = cache.get(key);
    if (entry && entry.expires > clock()) return structuredClone(entry.problem);
    if (entry) cache.delete(key);
  }
  async function detail(slug: string): Promise<ProblemMetadata> {
    const key = "slug:" + slug;
    const found = cached(key);
    if (found) return found;
    if (pending.has(key)) return structuredClone(await pending.get(key)!);
    const task = (async () => {
      const url = new URL("https://leetcode.com/graphql/");
      url.searchParams.set("query", QUERY);
      url.searchParams.set("variables", JSON.stringify({ titleSlug: slug }));
      const data = (await json(url, 256 * 1024)) as {
        errors?: unknown;
        data?: {
          question?: {
            questionFrontendId?: string;
            title?: string;
            titleSlug?: string;
            difficulty?: string;
            topicTags?: { name?: string }[];
          } | null;
        };
      };
      if (!data || data.errors || !data.data || !("question" in data.data))
        throw unavailable();
      const question = data.data.question;
      if (question === null)
        throw new LookupError(
          404,
          "Problem not found on LeetCode. Check the link or enter it manually.",
        );
      if (
        !question ||
        question.titleSlug !== slug ||
        !/^\d+$/.test(String(question.questionFrontendId)) ||
        !Array.isArray(question.topicTags)
      )
        throw unavailable();
      let problem: ProblemMetadata;
      try {
        problem = readProblemMetadata({
          problemNumber: Number(question.questionFrontendId),
          title: question.title,
          url: `https://leetcode.com/problems/${slug}/`,
          difficulty: question.difficulty,
          tags: question.topicTags.map((t) => t?.name),
        });
      } catch {
        throw unavailable();
      }
      if (cache.size >= 1000) cache.clear();
      const entry = { problem, expires: clock() + TTL };
      cache.set(key, entry);
      cache.set("number:" + problem.problemNumber, entry);
      return problem;
    })();
    pending.set(key, task);
    try {
      return structuredClone(await task);
    } finally {
      pending.delete(key);
    }
  }
  return async (input: string): Promise<ProblemMetadata> => {
    let reference;
    try {
      reference = parseProblemReference(input);
    } catch (e) {
      throw new LookupError(400, (e as Error).message);
    }
    if (reference.kind === "slug") return detail(reference.slug);
    const found = cached("number:" + reference.number);
    if (found) return found;
    const slug = (await numbers()).get(reference.number);
    if (!slug)
      throw new LookupError(
        404,
        `LeetCode problem #${reference.number} was not found. Check the number or enter it manually.`,
      );
    const problem = await detail(slug);
    if (problem.problemNumber !== reference.number) throw unavailable();
    return problem;
  };
}
export const lookupProblem = createProblemService();
