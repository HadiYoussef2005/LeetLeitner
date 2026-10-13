import { useEffect, useRef, useState } from "react";
import {
  Download,
  Upload,
  RotateCcw,
  ShieldCheck,
  ArrowRight,
} from "lucide-react";
import { BUCKETS, type Bucket, type Store } from "./engine";
import {
  loadSnapshot,
  assertUnchanged,
  replaceActive,
  restoreBackup,
  StorageConflictError,
  type Snapshot,
} from "./storage";
import { downloadExport, validateFile, type ExportFile } from "./portability";

interface Props {
  locked: boolean;
  snapshot: Snapshot;
  onReplaced: (snapshot: Snapshot) => void;
  onConflict: (message: string) => void;
  onNotice: (message: string) => void;
}
type Preview =
  | { kind: "import"; file: ExportFile; expected: Snapshot }
  | { kind: "restore"; expected: Snapshot };
function summary(state: Store) {
  return {
    count: state.problems.length,
    events: state.problems.reduce((n, p) => n + p.reviewHistory.length, 0),
  };
}
export default function DataBackups({
  locked,
  snapshot,
  onReplaced,
  onConflict,
  onNotice,
}: Props) {
  const [preview, setPreview] = useState<Preview | null>(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const input = useRef<HTMLInputElement>(null),
    operation = useRef(false),
    abort = useRef<AbortController | null>(null),
    previewRef = useRef<HTMLDivElement>(null),
    mounted = useRef(true);
  const backup = snapshot.envelope.previousBackup;
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      abort.current?.abort();
    };
  }, []);
  useEffect(() => {
    if (locked) {
      abort.current?.abort();
      setPreview(null);
      setBusy(false);
      operation.current = false;
    }
  }, [locked]);
  useEffect(() => {
    if (preview) previewRef.current?.focus();
  }, [preview]);
  function failed(e: unknown) {
    const message =
      e instanceof DOMException && e.name === "QuotaExceededError"
        ? "Browser storage is full. Keeping the active system and its backup requires more space. Download your current state and previous backup before freeing storage, or choose a smaller file."
        : e instanceof Error
          ? e.message
          : "Could not complete this operation.";
    if (e instanceof StorageConflictError) {
      setPreview(null);
      onConflict(message);
    } else setError(message);
  }
  function exportCurrent() {
    try {
      downloadExport(loadSnapshot(false).envelope.activeState);
      setError("");
      onNotice("Export file created");
    } catch (e) {
      failed(e);
    }
  }
  function exportBackup() {
    try {
      const latest = loadSnapshot(false).envelope.previousBackup;
      if (!latest) throw Error("No previous backup is available.");
      downloadExport(latest.state, "backup", latest.createdAt);
      setError("");
      onNotice("Backup file created");
    } catch (e) {
      failed(e);
    }
  }
  async function choose(file: File) {
    if (locked || operation.current) return;
    operation.current = true;
    setBusy(true);
    setError("");
    setPreview(null);
    const controller = new AbortController();
    abort.current = controller;
    try {
      assertUnchanged(snapshot);
      const result = await validateFile(file, controller.signal);
      assertUnchanged(snapshot);
      if (!controller.signal.aborted)
        setPreview({ kind: "import", file: result, expected: snapshot });
    } catch (e) {
      if (!(e instanceof DOMException && e.name === "AbortError")) failed(e);
    } finally {
      operation.current = false;
      setBusy(false);
    }
  }
  function beginRestore() {
    try {
      assertUnchanged(snapshot);
      if (!backup) throw Error("No previous backup is available.");
      setError("");
      setPreview({ kind: "restore", expected: snapshot });
    } catch (e) {
      failed(e);
    }
  }
  async function confirm() {
    if (!preview || locked || operation.current) return;
    operation.current = true;
    setBusy(true);
    setError("");
    // Allow the busy state to paint before synchronous serialization and storage.
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
    if (!mounted.current) {
      operation.current = false;
      return;
    }
    try {
      const next =
        preview.kind === "import"
          ? replaceActive(preview.file.state, preview.expected)
          : restoreBackup(preview.expected);
      onReplaced(next);
      onNotice(
        preview.kind === "import"
          ? "Imported system activated. Your previous system is backed up."
          : "Previous system restored. You can switch back using the backup.",
      );
    } catch (e) {
      failed(e);
    } finally {
      operation.current = false;
      setBusy(false);
    }
  }
  const target = preview
    ? preview.kind === "import"
      ? preview.file.state
      : preview.expected.envelope.previousBackup!.state
    : null;
  return (
    <section
      className="data-backups"
      aria-labelledby="data-backups-heading"
      aria-busy={busy}
    >
      <div className="data-heading">
        <ShieldCheck size={19} />
        <h3 id="data-backups-heading">Data &amp; Backups</h3>
      </div>
      <p className="modal-description">
        Take your system with you. Files stay on your device and are never
        uploaded.
      </p>
      {error && (
        <div className="error-banner" role="alert">
          {error} Your active state and backup have not been replaced.
        </div>
      )}
      <div className="data-actions">
        <button className="secondary" disabled={busy} onClick={exportCurrent}>
          <Download size={16} />
          Export current state
        </button>
        <button
          className="secondary"
          disabled={locked || busy}
          onClick={() => input.current?.click()}
        >
          <Upload size={16} />
          Import state
        </button>
      </div>
      <input
        ref={input}
        className="file-picker"
        type="file"
        accept=".txt,text/plain"
        aria-label="Choose a LeetLeitner export file"
        disabled={locked || busy}
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = "";
          if (file) void choose(file);
        }}
      />
      <p className="data-hint">
        One UTF-8 .txt file · Maximum import size: 10 MiB
      </p>
      <div className="backup-card">
        <h4>Previous system backup</h4>
        {backup ? (
          <p>
            <strong>{backup.state.problems.length} problems</strong>
            <span>Saved {new Date(backup.createdAt).toLocaleString()}</span>
          </p>
        ) : (
          <p>
            No backup yet. Your current system is saved here when you import a
            replacement.
          </p>
        )}
        <div className="data-actions">
          <button
            className="secondary"
            disabled={!backup || locked || busy}
            onClick={exportBackup}
          >
            <Download size={15} />
            Download previous backup
          </button>
          <button
            className="secondary"
            disabled={!backup || locked || busy}
            onClick={beginRestore}
          >
            <RotateCcw size={15} />
            Restore previous backup
          </button>
        </div>
      </div>
      <p className="data-hint">
        This backup lives in browser storage. Clearing site data removes it.
        Download a file to recover after browser data is deleted.
      </p>
      {busy && (
        <p className="data-status" role="status">
          {preview ? "Saving your system…" : "Reading and validating file…"}
        </p>
      )}
      {preview && target && (
        <div
          className="replacement-preview"
          ref={previewRef}
          tabIndex={-1}
          aria-labelledby="replacement-heading"
        >
          <h4 id="replacement-heading">
            {preview.kind === "import" ? "Import preview" : "Restore preview"}
          </h4>
          <p className="data-hint">
            {preview.kind === "import"
              ? `Exported ${new Date(preview.file.exportedAt).toLocaleString()}`
              : `Backup saved ${new Date(preview.expected.envelope.previousBackup!.createdAt).toLocaleString()}`}
          </p>
          <dl className="preview-stats">
            <div>
              <dt>Problems in replacement</dt>
              <dd>{summary(target).count}</dd>
            </div>
            <div>
              <dt>History events</dt>
              <dd>{summary(target).events}</dd>
            </div>
            <div>
              <dt>Current problems replaced</dt>
              <dd>{preview.expected.envelope.activeState.problems.length}</dd>
            </div>
            {([1, 2, 3] as Bucket[]).map((b) => (
              <div key={b}>
                <dt>{BUCKETS[b].name}</dt>
                <dd>
                  {target.problems.filter((p) => p.currentBucket === b).length}{" "}
                  · every {target.settings.intervals[b]}{" "}
                  {target.settings.intervals[b] === 1 ? "day" : "days"}
                </dd>
              </div>
            ))}
          </dl>
          <p className="replacement-warning">
            {preview.kind === "import"
              ? "Replace your current system with this file? This replaces all problems, review history, preferences, and schedules. Your current system will be saved as the previous backup."
              : "Restore your previous system? Your current system will become the backup, so you can switch back if needed."}
          </p>
          {preview.kind === "import" &&
            preview.expected.envelope.previousBackup && (
              <div className="backup-warning">
                <p>
                  Your existing backup (
                  {
                    preview.expected.envelope.previousBackup.state.problems
                      .length
                  }{" "}
                  problems, saved{" "}
                  {new Date(
                    preview.expected.envelope.previousBackup.createdAt,
                  ).toLocaleString()}
                  ) will be replaced. Download it first if you want to keep it.
                </p>
                <button
                  className="text-button"
                  disabled={busy}
                  onClick={exportBackup}
                >
                  Download previous backup
                </button>
              </div>
            )}
          <div className="modal-actions">
            <button
              className="secondary"
              disabled={busy}
              onClick={() => {
                setPreview(null);
                setError("");
              }}
            >
              Cancel replacement
            </button>
            <button
              className="primary"
              disabled={locked || busy}
              onClick={() => void confirm()}
            >
              {preview.kind === "import"
                ? "Replace current system"
                : "Restore this backup"}
              <ArrowRight size={16} />
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
