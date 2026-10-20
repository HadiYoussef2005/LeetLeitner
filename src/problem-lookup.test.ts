import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fetchProblemMetadata } from "./problem-lookup";
const problem = {
  problemNumber: 1,
  title: "Two Sum",
  url: "https://leetcode.com/problems/two-sum/",
  difficulty: "Easy",
  tags: ["Array"],
};
beforeEach(() => vi.stubEnv("BASE_URL", "/leetleitner/"));
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.useRealTimers();
});
describe("browser metadata requests", () => {
  it("uses the configured base URL rather than assuming root hosting", async () => {
    vi.stubEnv("BASE_URL", "/another-app/");
    const fetcher = vi.fn().mockResolvedValue(Response.json({ problem }));
    vi.stubGlobal("fetch", fetcher);
    await fetchProblemMetadata("1", new AbortController().signal);
    expect(fetcher.mock.calls[0][0]).toBe(
      "/another-app/api/problem.json?input=1",
    );
  });
  it("calls the subpath endpoint without credentials and validates its response", async () => {
    const fetcher = vi.fn().mockResolvedValue(Response.json({ problem }));
    vi.stubGlobal("fetch", fetcher);
    expect(
      await fetchProblemMetadata("1", new AbortController().signal),
    ).toEqual(problem);
    expect(fetcher.mock.calls[0][0]).toBe(
      "/leetleitner/api/problem.json?input=1",
    );
    expect(fetcher.mock.calls[0][1].credentials).toBe("omit");
  });
  it("shows server failures without inventing a problem", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(
          Response.json({ error: "Problem not found." }, { status: 404 }),
        ),
    );
    await expect(
      fetchProblemMetadata("99999", new AbortController().signal),
    ).rejects.toThrow("Problem not found.");
  });
  it("rejects malformed success data", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(Response.json({ problem: { title: "guess" } })),
    );
    await expect(
      fetchProblemMetadata("1", new AbortController().signal),
    ).rejects.toThrow();
  });
  it("provides an offline/manual-entry message on network failure", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockRejectedValue(new TypeError("Failed to fetch")),
    );
    await expect(
      fetchProblemMetadata("1", new AbortController().signal),
    ).rejects.toThrow(/connection.*manually/);
  });
  it("does not start a canceled request", async () => {
    const controller = new AbortController();
    controller.abort();
    const fetcher = vi.fn();
    vi.stubGlobal("fetch", fetcher);
    await expect(
      fetchProblemMetadata("1", controller.signal),
    ).rejects.toMatchObject({ name: "AbortError" });
    expect(fetcher).not.toHaveBeenCalled();
  });
  it("bounds the request duration and distinguishes timeout from cancellation", async () => {
    vi.useFakeTimers();
    vi.stubGlobal(
      "fetch",
      vi.fn(
        (_url, { signal }) =>
          new Promise((_resolve, reject) =>
            signal.addEventListener("abort", () =>
              reject(new DOMException("Aborted", "AbortError")),
            ),
          ),
      ),
    );
    const pending = fetchProblemMetadata("1", new AbortController().signal);
    const assertion = expect(pending).rejects.toThrow(/timed out/);
    await vi.advanceTimersByTimeAsync(20000);
    await assertion;
  });
});
