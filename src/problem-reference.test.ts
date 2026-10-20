import { describe, it, expect } from "vitest";
import {
  parseProblemReference,
  readProblemMetadata,
} from "./problem-reference";
describe("link and number input", () => {
  it.each(["1", " #1 ", "0001"])("accepts problem number %s", (input) =>
    expect(parseProblemReference(input)).toEqual({ kind: "number", number: 1 }),
  );
  it.each([
    "https://leetcode.com/problems/two-sum/",
    "leetcode.com/problems/two-sum",
    "https://www.leetcode.com/problems/two-sum/description/?envType=daily-question#note",
    "http://leetcode.com/problems/two-sum/solutions/123",
  ])("normalizes a real problem link %s", (input) =>
    expect(parseProblemReference(input)).toEqual({
      kind: "slug",
      slug: "two-sum",
    }),
  );
  it.each([
    "",
    "0",
    "-1",
    "1.5",
    "9007199254740992",
    "https://leetcode.com.evil.test/problems/two-sum/",
    "https://leetcode.com@evil.test/problems/two-sum/",
    "https://evil@leetcode.com/problems/two-sum/",
    "https://leetcode.com:9999/problems/two-sum/",
    "javascript:alert(1)",
    "https://leetcode.com/problemset/",
    "https://leetcode.com/problems/../account/",
    "https://leetcode.com/problems/two%2Fsum/",
    "x".repeat(2049),
  ])("rejects invalid or unsafe reference %s", (input) =>
    expect(() => parseProblemReference(input)).toThrow(),
  );
  it("validates only canonical metadata and reconstructs known fields", () => {
    const data = {
      problemNumber: 1,
      title: "Two Sum",
      url: "https://leetcode.com/problems/two-sum/",
      difficulty: "Easy",
      tags: ["Array", "Array"],
      unexpected: "ignored",
    };
    expect(readProblemMetadata(data)).toEqual({
      ...data,
      tags: ["Array"],
      unexpected: undefined,
    });
    expect(readProblemMetadata(data)).not.toHaveProperty("unexpected");
    for (const change of [
      { problemNumber: 0 },
      { title: "" },
      { url: "https://evil.test/" },
      { difficulty: "Unknown" },
      { tags: [null] },
      { tags: [""] },
    ])
      expect(() => readProblemMetadata({ ...data, ...change })).toThrow();
  });
});
