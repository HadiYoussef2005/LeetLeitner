import { LookupError, lookupProblem } from "./problem-service.js";
export function createLookupHandler(lookup = lookupProblem) {
  return async (request: Request): Promise<Response> => {
    const headers = {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    };
    if (request.method !== "GET")
      return Response.json(
        { error: "Use GET for problem lookup." },
        { status: 405, headers: { ...headers, Allow: "GET" } },
      );
    const values = new URL(request.url).searchParams.getAll("input");
    if (values.length !== 1 || !values[0].trim() || values[0].length > 2048)
      return Response.json(
        { error: "Provide one LeetCode problem link or number." },
        { status: 400, headers },
      );
    try {
      const problem = await lookup(values[0]);
      return Response.json(
        { problem },
        {
          headers: {
            ...headers,
            "Cache-Control":
              "public, max-age=0, s-maxage=3600, stale-while-revalidate=86400",
          },
        },
      );
    } catch (e) {
      return Response.json(
        {
          error:
            e instanceof LookupError
              ? e.message
              : "Could not fetch LeetCode metadata. Try again or enter the problem manually.",
        },
        { status: e instanceof LookupError ? e.status : 503, headers },
      );
    }
  };
}
export const handleLookupRequest = createLookupHandler();
