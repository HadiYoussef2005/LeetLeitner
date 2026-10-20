import { useEffect, useRef, useState, type FormEvent } from "react";
import { ArrowRight, Search } from "lucide-react";
import {
  BUCKETS,
  validateInput,
  type Bucket,
  type Outcome,
  type Problem,
  type Store,
} from "./engine";
import {
  parseProblemReference,
  type ProblemMetadata,
} from "./problem-reference";
import { fetchProblemMetadata } from "./problem-lookup";
interface Props {
  store: Store;
  outcome: Outcome;
  onOutcome: (outcome: Outcome) => void;
  onSave: (problem: ProblemMetadata, outcome: Outcome) => void;
  onDuplicate: (problem: Problem) => void;
  onManual: (seed: Partial<ProblemMetadata>) => void;
  onClose: () => void;
}
export default function QuickProblemEntry({
  store,
  outcome,
  onOutcome,
  onSave,
  onDuplicate,
  onManual,
  onClose,
}: Props) {
  const [source, setSource] = useState(""),
    [problem, setProblem] = useState<ProblemMetadata | null>(null),
    [error, setError] = useState(""),
    [loading, setLoading] = useState(false);
  const request = useRef<AbortController | null>(null),
    version = useRef(0),
    input = useRef<HTMLInputElement>(null);
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    input.current?.focus();
    return () => {
      version.current++;
      request.current?.abort();
    };
  }, []);
  useEffect(() => {
    try {
      parseProblemReference(source);
    } catch {
      return;
    }
    const timer = setTimeout(() => void lookup(source), 600);
    debounce.current = timer;
    return () => clearTimeout(timer);
  }, [source]);
  const duplicate = problem
    ? store.problems.find((p) => p.problemNumber === problem.problemNumber)
    : undefined;
  async function lookup(value: string) {
    if (debounce.current) clearTimeout(debounce.current);
    let reference;
    try {
      reference = parseProblemReference(value);
    } catch (e) {
      setError((e as Error).message);
      return;
    }
    request.current?.abort();
    const controller = new AbortController();
    request.current = controller;
    const current = ++version.current;
    setLoading(true);
    setError("");
    setProblem(null);
    try {
      const existing = store.problems.find((p) =>
        reference.kind === "number"
          ? p.problemNumber === reference.number
          : new URL(p.url).pathname.split("/")[2] === reference.slug,
      );
      const result =
        existing ?? (await fetchProblemMetadata(value, controller.signal));
      if (current === version.current) setProblem(result);
    } catch (e) {
      if (current === version.current && !controller.signal.aborted)
        setError(
          e instanceof Error
            ? e.message
            : "Could not look up this problem. Try manual entry.",
        );
    } finally {
      if (current === version.current) {
        setLoading(false);
        request.current = null;
      }
    }
  }
  function change(value: string) {
    version.current++;
    request.current?.abort();
    request.current = null;
    setSource(value);
    setProblem(null);
    setError("");
    setLoading(false);
  }
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (loading) return;
    if (!problem) {
      void lookup(source);
      return;
    }
    if (duplicate) {
      onDuplicate(duplicate);
      return;
    }
    const errors = validateInput(problem, store.problems);
    if (Object.keys(errors).length) {
      setError(Object.values(errors)[0]);
      return;
    }
    onSave(problem, outcome);
  }
  function manual() {
    if (problem) {
      onManual(problem);
      return;
    }
    try {
      const ref = parseProblemReference(source);
      onManual(
        ref.kind === "number"
          ? { problemNumber: ref.number }
          : { url: `https://leetcode.com/problems/${ref.slug}/` },
      );
    } catch {
      onManual({});
    }
  }
  return (
    <>
      <p className="modal-description">
        Paste a LeetCode link or enter its number. We’ll fill in the title,
        difficulty, and tags.
      </p>
      <form onSubmit={submit} noValidate>
        <label className="field">
          LeetCode link or number
          <input
            ref={input}
            aria-label="LeetCode link or number"
            value={source}
            onChange={(e) => change(e.target.value)}
            placeholder="https://leetcode.com/problems/two-sum/ or 1"
            autoComplete="off"
            spellCheck={false}
            aria-invalid={Boolean(error)}
            aria-describedby={error ? "lookup-error" : "lookup-hint"}
          />
          <small id="lookup-hint">
            Description links and links with sharing parameters work too.
          </small>
        </label>
        {loading && (
          <p className="lookup-status" role="status">
            <Search size={15} />
            Finding problem on LeetCode…
          </p>
        )}
        {error && (
          <div id="lookup-error" className="error-banner" role="alert">
            {error}
          </div>
        )}
        {problem && (
          <div className="lookup-preview" aria-live="polite">
            <div>
              <span className="muted">#{problem.problemNumber}</span>
              <span
                className={`difficulty ${problem.difficulty.toLowerCase()}`}
              >
                {problem.difficulty}
              </span>
            </div>
            <h3>{problem.title}</h3>
            <div className="tags">
              {problem.tags.map((tag) => (
                <span key={tag}>{tag}</span>
              ))}
            </div>
            {duplicate && (
              <p className="duplicate-notice">
                This problem is already in your collection.
              </p>
            )}
          </div>
        )}
        {!duplicate && (
          <fieldset>
            <legend>How did the attempt go?</legend>
            <div className="outcome-picker">
              {([1, 2, 3] as Bucket[]).map((b) => (
                <label
                  key={b}
                  className={outcome === BUCKETS[b].outcome ? "selected" : ""}
                >
                  <input
                    type="radio"
                    name="outcome"
                    checked={outcome === BUCKETS[b].outcome}
                    onChange={() => onOutcome(BUCKETS[b].outcome)}
                  />
                  <span>
                    {BUCKETS[b].name}
                    <small>
                      Next review in {store.settings.intervals[b]} days
                    </small>
                  </span>
                </label>
              ))}
            </div>
          </fieldset>
        )}
        <div className="lookup-manual">
          <button type="button" className="text-button" onClick={manual}>
            {problem ? "Edit details manually" : "Enter manually"}
          </button>
        </div>
        <div className="modal-actions">
          <button type="button" className="secondary" onClick={onClose}>
            Cancel
          </button>
          <button className="primary" disabled={loading || !source.trim()}>
            {loading
              ? "Finding problem…"
              : duplicate
                ? "Open existing problem"
                : problem
                  ? "Add problem"
                  : "Find problem"}
            <ArrowRight size={16} />
          </button>
        </div>
      </form>
    </>
  );
}
