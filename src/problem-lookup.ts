import { readProblemMetadata, type ProblemMetadata } from "./problem-reference";
export async function fetchProblemMetadata(
  input: string,
  signal: AbortSignal,
): Promise<ProblemMetadata> {
  const timer = new AbortController();
  const timeout = setTimeout(() => timer.abort(), 20000);
  const cancel = () => timer.abort();
  signal.addEventListener("abort", cancel, { once: true });
  try {
    if (signal.aborted) throw new DOMException("Canceled", "AbortError");
    const response = await fetch(
      `${import.meta.env.BASE_URL}api/problem.json?${new URLSearchParams({ input })}`,
      {
        signal: timer.signal,
        credentials: "omit",
        headers: { Accept: "application/json" },
      },
    );
    const body = await response.json();
    if (!response.ok)
      throw Error(
        typeof body?.error === "string"
          ? body.error
          : "Problem lookup failed. Try again or enter it manually.",
      );
    return readProblemMetadata(body.problem);
  } catch (error) {
    if (signal.aborted) throw new DOMException("Canceled", "AbortError");
    if (timer.signal.aborted)
      throw Error("Lookup timed out. Try again or enter the problem manually.");
    if (error instanceof TypeError)
      throw Error(
        "Could not connect. Check your connection or enter the problem manually.",
      );
    throw error;
  } finally {
    clearTimeout(timeout);
    signal.removeEventListener("abort", cancel);
  }
}
