import { describe, it, expect, vi } from "vitest";
import { createProblemService, LookupError } from "./problem-service";
import { createLookupHandler } from "./problem-handler";
const question = {
  questionFrontendId: "1",
  title: "Two Sum",
  titleSlug: "two-sum",
  difficulty: "Easy",
  topicTags: [{ name: "Array" }, { name: "Hash Table" }],
};
const catalog = {
  stat_status_pairs: [
    {
      stat: {
        question_id: 999,
        frontend_question_id: 1,
        question__title_slug: "two-sum",
      },
    },
    {
      stat: {
        frontend_question_id: "LCR 1",
        question__title_slug: "other-problem",
      },
    },
  ],
};
const mockFetch = () =>
  vi
    .fn<typeof fetch>()
    .mockImplementation(async (url) =>
      Response.json(
        String(url).includes("/api/problems/")
          ? catalog
          : { data: { question } },
      ),
    );
describe("LeetCode metadata GET service", () => {
  it("fetches a link via GraphQL GET, canonicalizes URL, and fills all metadata", async () => {
    const fetcher = mockFetch(),
      lookup = createProblemService(fetcher);
    const result = await lookup(
      "https://leetcode.com/problems/two-sum/description/?share=1",
    );
    expect(result).toEqual({
      problemNumber: 1,
      title: "Two Sum",
      url: "https://leetcode.com/problems/two-sum/",
      difficulty: "Easy",
      tags: ["Array", "Hash Table"],
    });
    expect(fetcher).toHaveBeenCalledTimes(1);
    const [url, options] = fetcher.mock.calls[0];
    expect(new URL(String(url)).origin).toBe("https://leetcode.com");
    expect(new URL(String(url)).searchParams.get("variables")).toBe(
      JSON.stringify({ titleSlug: "two-sum" }),
    );
    expect(options?.method).toBe("GET");
    expect(options?.redirect).toBe("error");
    expect(options?.headers).not.toHaveProperty("Cookie");
  });
  it("resolves the displayed problem number rather than LeetCode internal ID", async () => {
    const fetcher = mockFetch();
    const p = await createProblemService(fetcher)("#1");
    expect(p.problemNumber).toBe(1);
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(fetcher.mock.calls[0][0]).toBe(
      "https://leetcode.com/api/problems/all/",
    );
  });
  it("shares in-flight work and caches links and numbers without returning mutable cache objects", async () => {
    const fetcher = mockFetch(),
      lookup = createProblemService(fetcher);
    const [one] = await Promise.all([
      lookup("1"),
      lookup("1"),
      lookup("https://leetcode.com/problems/two-sum/"),
      lookup("https://leetcode.com/problems/two-sum/"),
    ]);
    expect(fetcher).toHaveBeenCalledTimes(2);
    one.title = "mutated";
    one.tags.push("bad");
    expect((await lookup("1")).title).toBe("Two Sum");
    expect((await lookup("1")).tags).not.toContain("bad");
    expect(fetcher).toHaveBeenCalledTimes(2);
  });
  it("refreshes expired catalogue and metadata caches", async () => {
    let time = 0;
    const fetcher = mockFetch(),
      lookup = createProblemService(fetcher, () => time);
    await lookup("1");
    time = 3600001;
    await lookup("1");
    expect(fetcher).toHaveBeenCalledTimes(4);
  });
  it("rejects invalid input before making any upstream request", async () => {
    const fetcher = mockFetch(),
      lookup = createProblemService(fetcher);
    await expect(lookup("https://evil.test/")).rejects.toMatchObject({
      status: 400,
    });
    expect(fetcher).not.toHaveBeenCalled();
  });
  it("reports missing numbers and slugs without inventing metadata", async () => {
    const fetcher = mockFetch();
    await expect(createProblemService(fetcher)("99999")).rejects.toMatchObject({
      status: 404,
    });
    expect(fetcher).toHaveBeenCalledTimes(1);
    fetcher.mockResolvedValue(Response.json({ data: { question: null } }));
    await expect(
      createProblemService(fetcher)(
        "https://leetcode.com/problems/not-a-real-problem/",
      ),
    ).rejects.toMatchObject({ status: 404 });
  });
  it.each([403, 429, 500])(
    "handles upstream status %i safely",
    async (status) => {
      const fetcher = vi
        .fn<typeof fetch>()
        .mockResolvedValue(new Response("blocked", { status }));
      await expect(createProblemService(fetcher)("1")).rejects.toMatchObject({
        status: 503,
      });
    },
  );
  it("recovers after a failed request rather than caching the failure", async () => {
    const fetcher = mockFetch();
    fetcher.mockRejectedValueOnce(new DOMException("timeout", "TimeoutError"));
    const lookup = createProblemService(fetcher);
    await expect(lookup("1")).rejects.toMatchObject({ status: 503 });
    expect((await lookup("1")).problemNumber).toBe(1);
  });
  it.each([
    { errors: [{ message: "bad" }] },
    { data: {} },
    { data: { question: { ...question, difficulty: "Unknown" } } },
    { data: { question: { ...question, questionFrontendId: "not-a-number" } } },
    { data: { question: { ...question, titleSlug: "different" } } },
    { data: { question: { ...question, topicTags: null } } },
  ])("rejects malformed GraphQL metadata %j", async (data) => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValue(Response.json(data));
    await expect(
      createProblemService(fetcher)("https://leetcode.com/problems/two-sum/"),
    ).rejects.toMatchObject({ status: 503 });
  });
  it.each([
    "<html>challenge</html>",
    JSON.stringify({ wrong: [] }),
    JSON.stringify({ stat_status_pairs: [] }),
  ])("rejects invalid catalogues", async (body) => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response(body));
    await expect(createProblemService(fetcher)("1")).rejects.toMatchObject({
      status: 503,
    });
  });
  it("bounds upstream bodies and cancels oversized streams", async () => {
    const canceled = vi.fn();
    let count = 0;
    const body = new ReadableStream({
      pull(controller) {
        controller.enqueue(new Uint8Array(200000));
        count++;
        if (count === 4) controller.close();
      },
      cancel: canceled,
    });
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response(body));
    await expect(
      createProblemService(fetcher)("https://leetcode.com/problems/two-sum/"),
    ).rejects.toMatchObject({ status: 503 });
    expect(canceled).toHaveBeenCalled();
  });
});
describe("metadata HTTP endpoint", () => {
  const url = "https://example.test/leetleitner/api/problem.json";
  it("returns public metadata with cache headers but never records", async () => {
    const lookup = vi
      .fn()
      .mockResolvedValue({
        problemNumber: 1,
        title: "Two Sum",
        url: "https://leetcode.com/problems/two-sum/",
        difficulty: "Easy",
        tags: [],
      });
    const response = await createLookupHandler(lookup)(
      new Request(url + "?input=1"),
    );
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toContain("s-maxage=3600");
    expect(Object.keys(await response.json())).toEqual(["problem"]);
    expect(lookup).toHaveBeenCalledWith("1");
  });
  it.each(["", "?input=", "?input=1&input=2", "?input=" + "a".repeat(2049)])(
    "rejects missing or ambiguous input %s",
    async (query) => {
      const lookup = vi.fn();
      const response = await createLookupHandler(lookup)(
        new Request(url + query),
      );
      expect(response.status).toBe(400);
      expect(lookup).not.toHaveBeenCalled();
      expect(response.headers.get("cache-control")).toBe("no-store");
    },
  );
  it("rejects mutation methods", async () => {
    const lookup = vi.fn();
    const response = await createLookupHandler(lookup)(
      new Request(url + "?input=1", { method: "POST" }),
    );
    expect(response.status).toBe(405);
    expect(response.headers.get("allow")).toBe("GET");
    expect(lookup).not.toHaveBeenCalled();
  });
  it("returns actionable errors without cache or upstream body leakage", async () => {
    const lookup = vi
      .fn()
      .mockRejectedValue(new LookupError(404, "Problem not found."));
    const response = await createLookupHandler(lookup)(
      new Request(url + "?input=1"),
    );
    expect(response.status).toBe(404);
    expect(response.headers.get("cache-control")).toBe("no-store");
    lookup.mockRejectedValue(new Error("sensitive upstream body"));
    const unknown = await createLookupHandler(lookup)(
      new Request(url + "?input=1"),
    );
    expect(unknown.status).toBe(503);
    expect(await unknown.text()).not.toContain("sensitive");
  });
});
