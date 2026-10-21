import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";
import {
  ArrowRight,
  Plus,
  Search,
  Settings2,
  Code2,
  LayoutDashboard,
  ListChecks,
  ExternalLink,
  X,
  Check,
  Clock3,
  ChevronRight,
  ShieldCheck,
  Pencil,
  Trash2,
  CalendarDays,
  RotateCcw,
  GripVertical,
} from "lucide-react";
import {
  BUCKETS,
  defaults,
  localDate,
  dueQueue,
  createProblem,
  schedule,
  bucketFor,
  sortProblems,
  validateInput,
  type Store,
  type Problem,
  type Bucket,
  type Outcome,
  type Sort,
} from "./engine";
import {
  loadSnapshot,
  saveActive,
  STORAGE_KEY,
  StorageConflictError,
  type Snapshot,
} from "./storage";
import DataBackups from "./DataBackups";
import QuickProblemEntry from "./QuickProblemEntry";
import type { ProblemMetadata } from "./problem-reference";

const SaveErrorContext = createContext("");

function Modal({
  title,
  children,
  onClose,
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
}) {
  const saveError = useContext(SaveErrorContext);
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current!;
    const previous = document.activeElement as HTMLElement;
    d.showModal();
    return () => {
      d.close();
      previous?.focus();
    };
  }, []);
  return (
    <dialog
      ref={ref}
      onCancel={onClose}
      onClick={(e) => {
        if (e.target === ref.current) onClose();
      }}
      aria-labelledby="dialog-title"
    >
      <div className="modal-head">
        <h2 id="dialog-title">{title}</h2>
        <button
          className="icon-button"
          onClick={onClose}
          aria-label="Close dialog"
        >
          <X size={20} />
        </button>
      </div>
      {saveError && (
        <div className="error-banner" role="alert">
          {saveError}
        </div>
      )}
      {children}
    </dialog>
  );
}
const labelDate = (date: string) =>
  new Date(date + "T12:00:00").toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
function dueLabel(p: Problem, today: string) {
  return p.nextReviewDueDate < today
    ? "Overdue"
    : p.nextReviewDueDate === today
      ? "Due today"
      : `Due ${labelDate(p.nextReviewDueDate)}`;
}

export default function App() {
  const [initial] = useState(() => {
    try {
      const snapshot = loadSnapshot();
      return { store: snapshot.envelope.activeState, snapshot, error: "" };
    } catch (e) {
      return {
        store: defaults(),
        snapshot: {
          raw: null,
          envelope: {
            storageVersion: 2,
            activeState: defaults(),
            previousBackup: null,
          },
        } as Snapshot,
        error:
          e instanceof Error ? e.message : "Unable to access browser storage.",
      };
    }
  });
  const [store, setStore] = useState<Store>(initial.store),
    [error, setError] = useState(initial.error),
    [locked, setLocked] = useState(Boolean(initial.error));
  const [view, setView] = useState<"dashboard" | "due">("dashboard"),
    [query, setQuery] = useState(""),
    [difficulty, setDifficulty] = useState("All difficulties");
  const [editor, setEditor] = useState<Problem | "new" | null>(null),
    [detail, setDetail] = useState<Problem | null>(null),
    [settingsOpen, setSettingsOpen] = useState(false);
  const [newOutcome, setNewOutcome] = useState<Outcome>("could_not_solve");
  function openNewProblem(bucket: Bucket = 1) {
    setNewOutcome(BUCKETS[bucket].outcome);
    setEditor("new");
  }
  const [session, setSession] = useState<{
    ids: string[];
    index: number;
    counts: Record<Outcome, number>;
    skipped: number;
  } | null>(null);
  const [queuePage, setQueuePage] = useState(0);
  const [pages, setPages] = useState<Record<Bucket, number>>({
    1: 0,
    2: 0,
    3: 0,
  });
  const [notice, setNotice] = useState(""),
    [today, setToday] = useState(localDate());
  const busy = useRef(false);
  const draggedId = useRef<string | null>(null);
  const [dragging, setDragging] = useState<string | null>(null);
  const [dropBucket, setDropBucket] = useState<Bucket | null>(null);
  const [landedId, setLandedId] = useState<string | null>(null);
  const dragPreview = useRef<HTMLElement | null>(null);
  useEffect(() => {
    if (!landedId) return;
    const timer = window.setTimeout(() => setLandedId(null), 400);
    return () => window.clearTimeout(timer);
  }, [landedId]);
  useEffect(() => () => dragPreview.current?.remove(), []);
  function endDrag() {
    dragPreview.current?.remove();
    dragPreview.current = null;
    draggedId.current = null;
    setDragging(null);
    setDropBucket(null);
  }
  function dropProblem(bucket: Bucket) {
    const problem = store.problems.find((p) => p.id === draggedId.current);
    endDrag();
    if (locked || !problem || problem.currentBucket === bucket) return;
    const next = schedule(
      problem,
      bucket,
      store.settings,
      "reclassification",
      null,
    );
    if (
      commit(
        {
          ...store,
          problems: store.problems.map((p) => (p.id === problem.id ? next : p)),
        },
        `Moved ${problem.title} to ${BUCKETS[bucket].name}. Next review ${labelDate(next.nextReviewDueDate)}.`,
      )
    ) {
      setPages((previous) => ({ ...previous, [bucket]: 0 }));
      setLandedId(problem.id);
    }
  }
  const snapshotRef = useRef<Snapshot>(initial.snapshot);
  useEffect(() => {
    const tick = () => setToday(localDate());
    const timer = window.setInterval(tick, 30000);
    window.addEventListener("focus", tick);
    return () => {
      clearInterval(timer);
      window.removeEventListener("focus", tick);
    };
  }, []);
  useEffect(() => {
    if (!notice) return;
    const t = setTimeout(() => setNotice(""), 4000);
    return () => clearTimeout(t);
  }, [notice]);
  useEffect(() => {
    const handler = (e: StorageEvent) => {
      if (e.key === STORAGE_KEY || e.key === null) {
        setLocked(true);
        setError(
          "Data changed in another tab. Reload this tab before making further changes.",
        );
      }
    };
    window.addEventListener("storage", handler);
    return () => window.removeEventListener("storage", handler);
  }, []);
  function commit(next: Store, message?: string) {
    if (locked || busy.current) return false;
    busy.current = true;
    try {
      snapshotRef.current = saveActive(next, snapshotRef.current);
      setStore(next);
      setError("");
      if (message) setNotice(message);
      return true;
    } catch (e) {
      if (e instanceof StorageConflictError) {
        setLocked(true);
        setError(e.message);
        return false;
      }
      setError(
        "Could not save to browser storage. Your change was not saved. Free up browser storage and try again.",
      );
      return false;
    } finally {
      busy.current = false;
    }
  }
  function activateReplacement(snapshot: Snapshot) {
    snapshotRef.current = snapshot;
    setStore(snapshot.envelope.activeState);
    setError("");
    setSession(null);
    setDetail(null);
    setEditor(null);
    setSettingsOpen(false);
    setQuery("");
    setDifficulty("All difficulties");
    setPages({ 1: 0, 2: 0, 3: 0 });
    setQueuePage(0);
    setView("dashboard");
    setToday(localDate());
  }
  const queue = dueQueue(store.problems, today),
    overdue = queue.filter((p) => p.nextReviewDueDate < today).length;
  const filtered = store.problems.filter(
    (p) =>
      (difficulty === "All difficulties" || p.difficulty === difficulty) &&
      `${p.title} ${p.problemNumber} ${p.tags.join(" ")}`
        .toLowerCase()
        .includes(query.toLowerCase()),
  );
  const filteredQueue = queue.filter((p) =>
    filtered.some((f) => f.id === p.id),
  );
  const reviewedToday = store.problems.reduce(
    (n, p) =>
      n +
      p.reviewHistory.filter(
        (h) =>
          h.eventType === "review" &&
          localDate(new Date(h.occurredAt)) === today,
      ).length,
    0,
  );
  function startReview(ids = queue.map((p) => p.id)) {
    if (ids.length)
      setSession({
        ids,
        index: 0,
        counts: { could_not_solve: 0, solved_with_help: 0, solved: 0 },
        skipped: 0,
      });
  }
  function review(outcome: Outcome) {
    if (!session) return;
    const p = store.problems.find((p) => p.id === session.ids[session.index]);
    if (!p) return;
    if (
      commit({
        ...store,
        problems: store.problems.map((item) =>
          item.id === p.id
            ? schedule(p, bucketFor(outcome), store.settings, "review", outcome)
            : item,
        ),
      })
    ) {
      setSession({
        ...session,
        index: session.index + 1,
        counts: { ...session.counts, [outcome]: session.counts[outcome] + 1 },
      });
    }
  }
  const current = session
    ? store.problems.find((p) => p.id === session.ids[session.index])
    : null;
  function downloadRaw() {
    try {
      const url = URL.createObjectURL(
        new Blob([localStorage.getItem(STORAGE_KEY) || ""], {
          type: "application/json",
        }),
      );
      const a = document.createElement("a");
      a.href = url;
      a.download = "leetleitner-recovery.json";
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      setError("Browser storage could not be read.");
    }
  }

  return (
    <SaveErrorContext.Provider value={error}>
      <div className="app-shell">
        <aside className="sidebar">
          <a
            href="#"
            className="brand"
            onClick={(e) => {
              e.preventDefault();
              setView("dashboard");
            }}
          >
            <span className="brand-icon">
              <span className="brand-stack" aria-hidden="true">
                <i />
                <i />
                <i />
              </span>
            </span>
            Leet<span className="brand-light">Leitner</span>
          </a>
          <div className="workspace-label">PRACTICE</div>
          <nav aria-label="Main navigation">
            <button
              className={view === "dashboard" ? "nav-item active" : "nav-item"}
              onClick={() => setView("dashboard")}
            >
              <LayoutDashboard size={18} />
              Overview
            </button>
            <button
              className={view === "due" ? "nav-item active" : "nav-item"}
              onClick={() => setView("due")}
            >
              <ListChecks size={18} />
              Review queue<span className="nav-count">{queue.length}</span>
            </button>
          </nav>
          <div className="sidebar-rule" />
          <div className="workspace-label">THE LEITNER SYSTEM</div>
          {([1, 2, 3] as Bucket[]).map((b) => (
            <div className="legend" key={b}>
              <span className={`dot ${BUCKETS[b].color}`} />
              <span>{BUCKETS[b].name}</span>
              <span>
                {store.problems.filter((p) => p.currentBucket === b).length}
              </span>
            </div>
          ))}
          <div className="sidebar-bottom">
            <div className="local-note">
              <ShieldCheck size={18} />
              <div>
                Your personal notebook<small>Saved in this browser</small>
              </div>
            </div>
            <button className="nav-item" onClick={() => setSettingsOpen(true)}>
              <Settings2 size={18} />
              Preferences
            </button>
            <div className="sidebar-foot">LEITNER / THREE BUCKETS</div>
          </div>
        </aside>
        <main>
          <header className="topbar">
            <span>
              <span className="muted">LeetLeitner</span>
              <ChevronRight size={14} />
              {view === "dashboard" ? "Overview" : "Review queue"}
            </span>
            <span className="topbar-meta">
              <time dateTime={today}>
                {new Date(today + "T12:00:00").toLocaleDateString(undefined, {
                  weekday: "short",
                  month: "short",
                  day: "numeric",
                })}
              </time>
              <span className="device-badge">
                <span className="dot green" />
                Saved locally
              </span>
            </span>
          </header>
          <div className="main-content">
            {error && (
              <div className="error-banner" role="alert">
                {error}
                {locked && (
                  <div>
                    <button onClick={() => location.reload()}>Reload</button>
                    <button onClick={downloadRaw}>Download stored data</button>
                  </div>
                )}
              </div>
            )}
            <div className="page-heading">
              <div>
                <div className="eyebrow">THE WORKING SET</div>
                <h1>
                  {view === "dashboard" ? "Problem notebook" : "Review queue"}
                </h1>
                <p>
                  {view === "dashboard"
                    ? "A record of what you solved, and what needs another attempt."
                    : "Start with the oldest due problem. Record how the attempt went."}
                </p>
              </div>
              <button
                className="primary"
                onClick={() => openNewProblem()}
                disabled={locked}
              >
                <Plus size={18} />
                Add problem
              </button>
            </div>
            <section className="stats" aria-label="Practice statistics">
              <div>
                <span>Total problems</span>
                <strong>
                  {store.problems.length}
                  <Code2 size={23} />
                </strong>
                <small>In your notebook</small>
              </div>
              <div>
                <span>Ready for review</span>
                <strong className="accent">
                  {queue.length}
                  <CalendarDays size={23} />
                </strong>
                <small>
                  {overdue ? `${overdue} overdue` : "No overdue problems"}
                </small>
              </div>
              <div>
                <span>Solved independently</span>
                <strong>
                  {store.problems.filter((p) => p.currentBucket === 3).length}
                  <Check size={23} />
                </strong>
                <small>Bucket 03 · without hints</small>
              </div>
              <div>
                <span>Reviewed today</span>
                <strong>
                  {reviewedToday}
                  <RotateCcw size={23} />
                </strong>
                <small>Completed review attempts</small>
              </div>
            </section>
            <section className="review-banner">
              <div className="banner-icon">
                <ListChecks size={27} />
              </div>
              <div>
                <span className="eyebrow">DAILY QUEUE</span>
                <h2>
                  {queue.length
                    ? `${queue.length} problem${queue.length === 1 ? "" : "s"} due for review`
                    : store.problems.length
                      ? "Nothing due right now"
                      : "Start with one problem."}
                </h2>
                <p>
                  {queue.length
                    ? "Oldest due first. A failed attempt returns to Bucket 01."
                    : store.problems.length
                      ? "Your next review will appear here when it’s due."
                      : "Paste a LeetCode link or enter a problem number. The details fill themselves in."}
                </p>
              </div>
              <button
                className="primary"
                disabled={
                  locked || (store.problems.length > 0 && !queue.length)
                }
                onClick={() =>
                  store.problems.length ? startReview() : openNewProblem()
                }
              >
                {store.problems.length
                  ? "Start review"
                  : "Add your first problem"}
                <ArrowRight size={17} />
              </button>
            </section>
            <div className="collection-heading">
              <div>
                <h2>
                  {view === "dashboard" ? "The buckets" : "Due & overdue"}
                </h2>
                <span>
                  {view === "dashboard"
                    ? "Drag problems between buckets to restart their review schedule."
                    : "Oldest due first, with weaker buckets prioritized."}
                </span>
              </div>
              <div className="filters">
                <label className="search">
                  <Search size={16} />
                  <input
                    aria-label="Search problems"
                    placeholder="Search problems or tags…"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                  />
                </label>
                <select
                  aria-label="Filter by difficulty"
                  value={difficulty}
                  onChange={(e) => setDifficulty(e.target.value)}
                >
                  {["All difficulties", "Easy", "Medium", "Hard"].map((d) => (
                    <option key={d}>{d}</option>
                  ))}
                </select>
              </div>
            </div>
            {view === "dashboard" ? (
              <div className="buckets">
                {([1, 2, 3] as Bucket[]).map((bucket) => {
                  const definition = BUCKETS[bucket],
                    problems = sortProblems(
                      filtered.filter((p) => p.currentBucket === bucket),
                      store.settings.sorts[bucket],
                    );
                  return (
                    <section
                      className={`bucket ${definition.color}${dropBucket === bucket ? " drop-target" : ""}${dragging ? " drag-active" : ""}`}
                      key={bucket}
                      onDragOver={(e) => {
                        const source = store.problems.find(
                          (p) => p.id === draggedId.current,
                        );
                        if (
                          locked ||
                          !source ||
                          source.currentBucket === bucket
                        )
                          return;
                        e.preventDefault();
                        e.dataTransfer.dropEffect = "move";
                        setDropBucket(bucket);
                      }}
                      onDragLeave={(e) => {
                        if (
                          !e.currentTarget.contains(
                            e.relatedTarget as Node | null,
                          )
                        ) {
                          setDropBucket((previous) =>
                            previous === bucket ? null : previous,
                          );
                        }
                      }}
                      onDrop={(e) => {
                        if (!draggedId.current) return;
                        e.preventDefault();
                        dropProblem(bucket);
                      }}
                    >
                      <div className="bucket-header">
                        <div>
                          <span className="bucket-number">0{bucket}</span>
                          <h3>{definition.name}</h3>
                          <span className="bucket-count">
                            {problems.length}
                          </span>
                        </div>
                        <p>
                          {definition.description}
                          <span>
                            Every {store.settings.intervals[bucket]}{" "}
                            {store.settings.intervals[bucket] === 1
                              ? "day"
                              : "days"}
                          </span>
                        </p>
                      </div>
                      <div className="bucket-sort">
                        <span>
                          <Clock3 size={13} />
                          {dropBucket === bucket
                            ? "DROP HERE"
                            : "REVIEW SCHEDULE"}
                        </span>
                        <select
                          aria-label={`Sort ${definition.name}`}
                          value={store.settings.sorts[bucket]}
                          disabled={locked}
                          onChange={(e) =>
                            commit({
                              ...store,
                              settings: {
                                ...store.settings,
                                sorts: {
                                  ...store.settings.sorts,
                                  [bucket]: e.target.value as Sort,
                                },
                              },
                            })
                          }
                        >
                          <option value="due">Due date</option>
                          <option value="number">Number</option>
                          <option value="title">Title</option>
                          <option value="difficulty">Difficulty</option>
                        </select>
                      </div>
                      <div className="bucket-content">
                        {problems.length ? (
                          problems
                            .slice(
                              Math.min(
                                pages[bucket],
                                Math.max(
                                  0,
                                  Math.ceil(problems.length / 24) - 1,
                                ),
                              ) * 24,
                              (Math.min(
                                pages[bucket],
                                Math.max(
                                  0,
                                  Math.ceil(problems.length / 24) - 1,
                                ),
                              ) +
                                1) *
                                24,
                            )
                            .map((p) => (
                              <ProblemCard
                                key={p.id}
                                p={p}
                                today={today}
                                onClick={() => setDetail(p)}
                                draggable={!locked}
                                dragging={dragging === p.id}
                                landing={landedId === p.id}
                                onDragStart={(e) => {
                                  if (locked) {
                                    e.preventDefault();
                                    return;
                                  }
                                  draggedId.current = p.id;
                                  e.dataTransfer.effectAllowed = "move";
                                  e.dataTransfer.setData("text/plain", p.id);
                                  setLandedId(null);
                                  dragPreview.current?.remove();
                                  const card = e.currentTarget;
                                  const bounds = card.getBoundingClientRect();
                                  const preview = card.cloneNode(
                                    true,
                                  ) as HTMLElement;
                                  preview.className =
                                    "problem-card drag-preview";
                                  preview.setAttribute("aria-hidden", "true");
                                  preview.tabIndex = -1;
                                  preview.style.width = `${bounds.width}px`;
                                  document.body.appendChild(preview);
                                  dragPreview.current = preview;
                                  e.dataTransfer.setDragImage(
                                    preview,
                                    e.clientX - bounds.left,
                                    e.clientY - bounds.top,
                                  );
                                  setDragging(p.id);
                                }}
                                onDragEnd={endDrag}
                              />
                            ))
                        ) : (
                          <div className="empty-bucket">
                            <Code2 size={25} />
                            <h4>
                              {query || difficulty !== "All difficulties"
                                ? "No matching problems"
                                : "No problems yet"}
                            </h4>
                            <p>
                              {query
                                ? "Try a different search."
                                : `Problems marked “${definition.name}” appear here.`}
                            </p>
                          </div>
                        )}
                      </div>
                      {problems.length > 24 && (
                        <div className="pagination">
                          <button
                            aria-label={`Previous page in ${definition.name}`}
                            disabled={pages[bucket] === 0}
                            onClick={() =>
                              setPages({
                                ...pages,
                                [bucket]: Math.max(0, pages[bucket] - 1),
                              })
                            }
                          >
                            Previous
                          </button>
                          <span>
                            Page{" "}
                            {Math.min(
                              pages[bucket],
                              Math.ceil(problems.length / 24) - 1,
                            ) + 1}{" "}
                            of {Math.ceil(problems.length / 24)}
                          </span>
                          <button
                            aria-label={`Next page in ${definition.name}`}
                            disabled={
                              pages[bucket] >=
                              Math.ceil(problems.length / 24) - 1
                            }
                            onClick={() =>
                              setPages({
                                ...pages,
                                [bucket]: pages[bucket] + 1,
                              })
                            }
                          >
                            Next
                          </button>
                        </div>
                      )}
                      <button
                        className="bucket-add"
                        disabled={locked}
                        onClick={() => openNewProblem(bucket)}
                      >
                        <Plus size={15} />
                        Add a problem
                      </button>
                    </section>
                  );
                })}
              </div>
            ) : (
              <div className="queue-list">
                {filteredQueue
                  .slice(
                    Math.min(
                      queuePage,
                      Math.max(0, Math.ceil(filteredQueue.length / 24) - 1),
                    ) * 24,
                    (Math.min(
                      queuePage,
                      Math.max(0, Math.ceil(filteredQueue.length / 24) - 1),
                    ) +
                      1) *
                      24,
                  )
                  .map((p) => (
                    <div className="queue-row" key={p.id}>
                      <span
                        className={`dot ${BUCKETS[p.currentBucket].color}`}
                      />
                      <button onClick={() => setDetail(p)}>
                        <span className="muted">#{p.problemNumber}</span>{" "}
                        {p.title}
                      </button>
                      <span
                        className={`difficulty ${p.difficulty.toLowerCase()}`}
                      >
                        {p.difficulty}
                      </span>
                      <span
                        className={
                          p.nextReviewDueDate < today ? "overdue" : "muted"
                        }
                      >
                        {dueLabel(p, today)}
                      </span>
                      <button
                        className="secondary"
                        disabled={locked}
                        onClick={() => startReview([p.id])}
                      >
                        Review
                        <ArrowRight size={15} />
                      </button>
                    </div>
                  ))}
                {filteredQueue.length > 24 && (
                  <div className="pagination">
                    <button
                      disabled={queuePage === 0}
                      onClick={() => setQueuePage(Math.max(0, queuePage - 1))}
                    >
                      Previous
                    </button>
                    <span>
                      Page{" "}
                      {Math.min(
                        queuePage,
                        Math.ceil(filteredQueue.length / 24) - 1,
                      ) + 1}{" "}
                      of {Math.ceil(filteredQueue.length / 24)}
                    </span>
                    <button
                      disabled={
                        queuePage >= Math.ceil(filteredQueue.length / 24) - 1
                      }
                      onClick={() => setQueuePage(queuePage + 1)}
                    >
                      Next
                    </button>
                  </div>
                )}
                {!filteredQueue.length && (
                  <div className="queue-empty">
                    <Check size={30} />
                    <h3>No reviews here</h3>
                    <p>
                      {queue.length
                        ? "Adjust your filters to see your due problems."
                        : "Your next review will appear here when it’s due."}
                    </p>
                  </div>
                )}
              </div>
            )}
            <footer>
              <span>
                <ShieldCheck size={14} />
                Your progress stays on this device. Clearing browser data
                removes it.
              </span>
              <span>LeetLeitner</span>
            </footer>
          </div>
        </main>
        {notice && (
          <div className="toast" role="status">
            <Check size={17} />
            {notice}
          </div>
        )}
        {editor && (
          <ProblemEditor
            existing={editor === "new" ? null : editor}
            initialOutcome={newOutcome}
            store={store}
            onClose={() => setEditor(null)}
            onDuplicate={(p) => {
              setEditor(null);
              setDetail(p);
            }}
            onSave={(input, outcome) => {
              const existing = editor === "new" ? null : editor;
              const problems = existing
                ? store.problems.map((p) =>
                    p.id === existing.id
                      ? { ...p, ...input, updatedAt: new Date().toISOString() }
                      : p,
                  )
                : [
                    ...store.problems,
                    createProblem(input, outcome, store.settings),
                  ];
              if (
                commit(
                  { ...store, problems },
                  existing
                    ? "Problem updated"
                    : "Problem added to your library",
                )
              )
                setEditor(null);
            }}
          />
        )}
        {settingsOpen && (
          <Modal
            title="Review preferences"
            onClose={() => setSettingsOpen(false)}
          >
            <p className="modal-description">
              Set your pace. New intervals apply to future attempts; existing
              due dates stay as scheduled.
            </p>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                const data = new FormData(e.currentTarget);
                const intervals = {
                  1: Number(data.get("1")),
                  2: Number(data.get("2")),
                  3: Number(data.get("3")),
                };
                if (
                  commit(
                    { ...store, settings: { ...store.settings, intervals } },
                    "Preferences saved",
                  )
                )
                  setSettingsOpen(false);
              }}
            >
              {([1, 2, 3] as Bucket[]).map((b) => (
                <label className="setting-row" key={b}>
                  <span>
                    <span className={`dot ${BUCKETS[b].color}`} />
                    {BUCKETS[b].name}
                    <small>
                      {BUCKETS[b].min}–{BUCKETS[b].max} days
                    </small>
                  </span>
                  <select
                    name={String(b)}
                    defaultValue={store.settings.intervals[b]}
                  >
                    {Array.from(
                      { length: BUCKETS[b].max - BUCKETS[b].min + 1 },
                      (_, i) => BUCKETS[b].min + i,
                    ).map((n) => (
                      <option key={n} value={n}>
                        {n} days
                      </option>
                    ))}
                  </select>
                </label>
              ))}
              <div className="modal-actions">
                <button
                  type="button"
                  className="secondary"
                  onClick={() => setSettingsOpen(false)}
                >
                  Cancel
                </button>
                <button className="primary" disabled={locked}>
                  Save preferences
                </button>
              </div>
            </form>
            <DataBackups
              locked={locked}
              snapshot={snapshotRef.current}
              onReplaced={activateReplacement}
              onNotice={setNotice}
              onConflict={(message) => {
                setLocked(true);
                setError(message);
              }}
            />
          </Modal>
        )}
        {detail && (
          <Modal
            title={`#${detail.problemNumber} · ${detail.title}`}
            onClose={() => setDetail(null)}
          >
            <div className="detail-meta">
              <span className={`difficulty ${detail.difficulty.toLowerCase()}`}>
                {detail.difficulty}
              </span>
              <span>{BUCKETS[detail.currentBucket].name}</span>
              <span>{dueLabel(detail, today)}</span>
            </div>
            <a
              className="external-link"
              href={detail.url}
              target="_blank"
              rel="noreferrer"
            >
              Open on LeetCode
              <ExternalLink size={16} />
            </a>
            <div className="tags">
              {detail.tags.map((t) => (
                <span key={t}>{t}</span>
              ))}
            </div>
            <label className="field">
              Correct bucket{" "}
              <small>
                Restarts the schedule from today without counting a review.
              </small>
              <select
                value={detail.currentBucket}
                disabled={locked}
                onChange={(e) => {
                  const bucket = Number(e.target.value) as Bucket;
                  if (
                    !confirm(
                      `Move to ${BUCKETS[bucket].name} and restart the review schedule from today?`,
                    )
                  )
                    return;
                  const next = schedule(
                    detail,
                    bucket,
                    store.settings,
                    "reclassification",
                    null,
                  );
                  if (
                    commit(
                      {
                        ...store,
                        problems: store.problems.map((p) =>
                          p.id === detail.id ? next : p,
                        ),
                      },
                      "Bucket corrected",
                    )
                  )
                    setDetail(next);
                }}
              >
                {([1, 2, 3] as Bucket[]).map((b) => (
                  <option key={b} value={b}>
                    {BUCKETS[b].name}
                  </option>
                ))}
              </select>
            </label>
            <h3 className="history-title">Attempt history</h3>
            <div className="history">
              {[...detail.reviewHistory].reverse().map((h) => (
                <div key={h.id}>
                  <span>
                    {h.eventType === "initial_attempt"
                      ? "Initial attempt"
                      : h.eventType === "review"
                        ? "Review"
                        : "Bucket correction"}
                    <small>{new Date(h.occurredAt).toLocaleString()}</small>
                  </span>
                  <span>
                    {BUCKETS[h.newBucket].name}
                    <small>Next: {labelDate(h.nextReviewDueDate)}</small>
                  </span>
                </div>
              ))}
            </div>
            <div className="modal-actions">
              <button
                className="danger secondary"
                disabled={locked}
                onClick={() => {
                  if (
                    confirm(
                      `Delete ${detail.title} and all its attempt history?`,
                    ) &&
                    commit(
                      {
                        ...store,
                        problems: store.problems.filter(
                          (p) => p.id !== detail.id,
                        ),
                      },
                      "Problem deleted",
                    )
                  )
                    setDetail(null);
                }}
              >
                <Trash2 size={16} />
                Delete
              </button>
              <button
                className="secondary"
                disabled={locked}
                onClick={() => {
                  setEditor(detail);
                  setDetail(null);
                }}
              >
                <Pencil size={16} />
                Edit
              </button>
              <button
                className="primary"
                disabled={locked}
                onClick={() => {
                  startReview([detail.id]);
                  setDetail(null);
                }}
              >
                Review now
                <ArrowRight size={16} />
              </button>
            </div>
          </Modal>
        )}
        {session && (
          <Modal
            title={current ? "Daily review" : "Session complete"}
            onClose={() => setSession(null)}
          >
            {current ? (
              <>
                <div className="session-progress">
                  <span>
                    Problem {session.index + 1} of {session.ids.length}
                  </span>
                  <span>{session.index} finished or skipped</span>
                </div>
                <progress value={session.index} max={session.ids.length} />
                <div className="session-problem">
                  <span
                    className={`difficulty ${current.difficulty.toLowerCase()}`}
                  >
                    {current.difficulty}
                  </span>
                  <h2>
                    <span className="muted">#{current.problemNumber}</span>{" "}
                    {current.title}
                  </h2>
                  <div className="tags">
                    {current.tags.map((t) => (
                      <span key={t}>{t}</span>
                    ))}
                  </div>
                  <a
                    className="primary"
                    href={current.url}
                    target="_blank"
                    rel="noreferrer"
                  >
                    Solve on LeetCode
                    <ExternalLink size={17} />
                  </a>
                </div>
                <h3>How did your attempt go?</h3>
                <p className="modal-description">
                  Try it before checking a solution. Your outcome sets the next
                  review.
                </p>
                <div className="outcomes">
                  {([1, 2, 3] as Bucket[]).map((b) => (
                    <button
                      key={b}
                      className={`outcome ${BUCKETS[b].color}`}
                      disabled={locked}
                      onClick={() => review(BUCKETS[b].outcome)}
                    >
                      <span className={`dot ${BUCKETS[b].color}`} />
                      <span>
                        {BUCKETS[b].name}
                        <small>
                          Review again in {store.settings.intervals[b]} days
                        </small>
                      </span>
                      <ArrowRight size={16} />
                    </button>
                  ))}
                </div>
                <div className="modal-actions">
                  <button
                    className="text-button"
                    onClick={() =>
                      setSession({
                        ...session,
                        index: session.index + 1,
                        skipped: session.skipped + 1,
                      })
                    }
                  >
                    Skip for now
                  </button>
                  <button
                    className="secondary"
                    onClick={() => setSession(null)}
                  >
                    Finish later
                  </button>
                </div>
              </>
            ) : (
              <div className="session-summary">
                <span className="summary-icon">
                  <Check size={32} />
                </span>
                <h2>Session finished</h2>
                <p>
                  You reviewed{" "}
                  {Object.values(session.counts).reduce((a, b) => a + b, 0)}{" "}
                  problems.
                </p>
                {([1, 2, 3] as Bucket[]).map((b) => (
                  <div key={b}>
                    <span>{BUCKETS[b].name}</span>
                    <strong>{session.counts[BUCKETS[b].outcome]}</strong>
                  </div>
                ))}
                <div>
                  <span>Skipped · schedule unchanged</span>
                  <strong>{session.skipped}</strong>
                </div>
                <button className="primary" onClick={() => setSession(null)}>
                  Back to your library
                  <ArrowRight size={16} />
                </button>
              </div>
            )}
          </Modal>
        )}
      </div>
    </SaveErrorContext.Provider>
  );
}
function ProblemCard({
  p,
  today,
  onClick,
  draggable,
  dragging,
  landing,
  onDragStart,
  onDragEnd,
}: {
  p: Problem;
  today: string;
  onClick: () => void;
  draggable: boolean;
  dragging: boolean;
  landing: boolean;
  onDragStart: React.DragEventHandler<HTMLButtonElement>;
  onDragEnd: () => void;
}) {
  return (
    <button
      className={`problem-card${dragging ? " dragging" : ""}${landing ? " landing" : ""}`}
      onClick={onClick}
      draggable={draggable}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      title="Drag to another bucket, or click to edit"
    >
      <div className="card-top">
        <span className="card-reference">
          <GripVertical size={14} aria-hidden="true" />#{p.problemNumber}
        </span>
        <span className={`difficulty ${p.difficulty.toLowerCase()}`}>
          {p.difficulty}
        </span>
      </div>
      <h4>{p.title}</h4>
      <div className="tags">
        {p.tags.slice(0, 3).map((t) => (
          <span key={t}>{t}</span>
        ))}
        {p.tags.length > 3 && <span>+{p.tags.length - 3}</span>}
      </div>
      <div className="card-bottom">
        <span
          className={
            p.nextReviewDueDate < today
              ? "overdue"
              : p.nextReviewDueDate === today
                ? "due-today"
                : ""
          }
        >
          <Clock3 size={13} />
          {dueLabel(p, today)}
        </span>
        <ChevronRight size={15} />
      </div>
    </button>
  );
}
function ProblemEditor({
  existing,
  initialOutcome,
  store,
  onSave,
  onClose,
  onDuplicate,
}: {
  existing: Problem | null;
  initialOutcome: Outcome;
  store: Store;
  onSave: (
    p: Pick<Problem, "problemNumber" | "title" | "url" | "difficulty" | "tags">,
    outcome: Outcome,
  ) => void;
  onClose: () => void;
  onDuplicate: (p: Problem) => void;
}) {
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [manual, setManual] = useState(Boolean(existing));
  const [seed, setSeed] = useState<Partial<ProblemMetadata>>({});
  const [outcome, setOutcome] = useState<Outcome>(initialOutcome);
  const [number, setNumber] = useState(
    existing ? String(existing.problemNumber) : "",
  );
  function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const input = {
      problemNumber: Number(form.get("number")),
      title: String(form.get("title")).trim(),
      url: String(form.get("url")).trim(),
      difficulty: String(form.get("difficulty")) as Problem["difficulty"],
      tags: [
        ...new Set(
          String(form.get("tags"))
            .split(",")
            .map((t) => t.trim())
            .filter(Boolean),
        ),
      ],
    };
    const result = validateInput(input, store.problems, existing?.id);
    setErrors(result);
    if (!Object.keys(result).length) onSave(input, outcome);
  }
  const duplicate = store.problems.find(
    (p) => p.problemNumber === Number(number) && p.id !== existing?.id,
  );
  if (!existing && !manual)
    return (
      <Modal title="Add a problem" onClose={onClose}>
        <QuickProblemEntry
          store={store}
          outcome={outcome}
          onOutcome={setOutcome}
          onSave={onSave}
          onDuplicate={onDuplicate}
          onClose={onClose}
          onManual={(value) => {
            setSeed(value);
            setNumber(value.problemNumber ? String(value.problemNumber) : "");
            setManual(true);
          }}
        />
      </Modal>
    );
  return (
    <Modal
      title={existing ? "Edit problem" : "Add a problem"}
      onClose={onClose}
    >
      <p className="modal-description">
        {existing
          ? "Update the details. Your schedule and attempt history stay intact."
          : "Capture your latest attempt. We’ll schedule the next one."}
      </p>
      {!existing && (
        <button
          type="button"
          className="text-button manual-back"
          onClick={() => setManual(false)}
        >
          Use a link or number instead
        </button>
      )}
      <form onSubmit={submit} noValidate>
        <div className="form-grid">
          <label className="field">
            Problem number
            <input
              name="number"
              type="number"
              min="1"
              step="1"
              placeholder="e.g. 1"
              value={number}
              onChange={(e) => setNumber(e.target.value)}
              aria-invalid={Boolean(errors.problemNumber)}
              aria-describedby={
                errors.problemNumber ? "error-number" : undefined
              }
            />
            {errors.problemNumber && (
              <small id="error-number" className="field-error">
                {errors.problemNumber}
              </small>
            )}
            {duplicate && (
              <button
                type="button"
                className="text-button"
                onClick={() => onDuplicate(duplicate)}
              >
                Open existing problem →
              </button>
            )}
          </label>
          <label className="field">
            Difficulty
            <select
              name="difficulty"
              aria-label="Difficulty"
              defaultValue={existing?.difficulty || seed.difficulty || "Easy"}
            >
              <option>Easy</option>
              <option>Medium</option>
              <option>Hard</option>
            </select>
          </label>
        </div>
        <label className="field">
          Title
          <input
            name="title"
            defaultValue={existing?.title ?? seed.title}
            placeholder="e.g. Two Sum"
            aria-invalid={Boolean(errors.title)}
            aria-describedby={errors.title ? "error-title" : undefined}
          />
          {errors.title && (
            <small id="error-title" className="field-error">
              {errors.title}
            </small>
          )}
        </label>
        <label className="field">
          LeetCode URL
          <input
            name="url"
            type="url"
            defaultValue={existing?.url ?? seed.url}
            placeholder="https://leetcode.com/problems/two-sum/"
            aria-invalid={Boolean(errors.url)}
            aria-describedby={errors.url ? "error-url" : undefined}
          />
          {errors.url && (
            <small id="error-url" className="field-error">
              {errors.url}
            </small>
          )}
        </label>
        <label className="field">
          Tags <span className="muted">(optional)</span>
          <input
            name="tags"
            defaultValue={(existing?.tags ?? seed.tags)?.join(", ")}
            placeholder="Array, Hash Table"
          />
          <small>Separate tags with commas.</small>
        </label>
        {!existing && (
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
                    onChange={() => setOutcome(BUCKETS[b].outcome)}
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
        <div className="modal-actions">
          <button type="button" className="secondary" onClick={onClose}>
            Cancel
          </button>
          <button className="primary">
            {existing ? "Save changes" : "Add problem"}
            <ArrowRight size={16} />
          </button>
        </div>
      </form>
    </Modal>
  );
}
