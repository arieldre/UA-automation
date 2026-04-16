"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { API_BASE } from "@/lib/apiBase";

/* ── Types ── */

interface Note {
  _id: string;
  text: string;
  author: string;
  createdAt: string;
}

/* ── Main component ── */

export default function NotesPanel() {
  const [notes, setNotes] = useState<Note[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [text, setText] = useState("");
  const [author, setAuthor] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  /* ── Fetch notes ── */
  const fetchNotes = useCallback(async () => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setLoading(true);
    setError(null);

    try {
      const res = await fetch(`${API_BASE}/api/notes`, { signal: controller.signal });
      if (!res.ok) throw new Error(`Notes API error: ${res.status}`);
      const json: Note[] = await res.json();
      setNotes(json);
    } catch (err: unknown) {
      if (err instanceof DOMException && err.name === "AbortError") return;
      setError(err instanceof Error ? err.message : "Unknown fetch error");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchNotes();
    return () => abortRef.current?.abort();
  }, [fetchNotes]);

  /* ── Create note (optimistic) ── */
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!text.trim() || !author.trim()) return;

    const tempId = `temp-${Date.now()}`;
    const optimistic: Note = {
      _id: tempId,
      text: text.trim(),
      author: author.trim(),
      createdAt: new Date().toISOString(),
    };

    // Optimistic insert
    setNotes((prev) => [optimistic, ...prev]);
    const savedText = text;
    const savedAuthor = author;
    setText("");
    setSubmitting(true);

    try {
      const res = await fetch(`${API_BASE}/api/notes`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: savedText, author: savedAuthor }),
      });
      if (!res.ok) throw new Error(`Create note failed: ${res.status}`);
      const created: Note = await res.json();
      // Replace optimistic entry with real one
      setNotes((prev) =>
        prev.map((n) => (n._id === tempId ? created : n))
      );
    } catch {
      // Rollback on failure
      setNotes((prev) => prev.filter((n) => n._id !== tempId));
      setText(savedText);
    } finally {
      setSubmitting(false);
    }
  };

  /* ── Delete note (optimistic) ── */
  const handleDelete = async (id: string) => {
    const prev = notes;
    setNotes((cur) => cur.filter((n) => n._id !== id));

    try {
      const res = await fetch(`${API_BASE}/api/notes?id=${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Delete failed");
    } catch {
      // Rollback on failure
      setNotes(prev);
    }
  };

  /* ── Format date ── */
  const fmtDate = (iso: string): string => {
    const d = new Date(iso);
    return d.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  /* ── Sort newest first ── */
  const sorted = [...notes].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold" style={{ color: "var(--text)" }}>
        Notes
      </h2>

      {/* ── Form ── */}
      <form
        onSubmit={handleSubmit}
        className="rounded-xl border p-4 space-y-3"
        style={{
          borderColor: "var(--border)",
          background: "var(--surface)",
        }}
      >
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Write a note..."
          rows={3}
          className="w-full rounded-md border px-3 py-2 text-sm resize-none focus:outline-none focus:ring-1"
          style={{
            borderColor: "var(--border)",
            background: "transparent",
            color: "var(--text)",
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            ["--tw-ring-color" as string]: "var(--accent)",
          }}
        />
        <div className="flex gap-3 items-center">
          <input
            type="text"
            value={author}
            onChange={(e) => setAuthor(e.target.value)}
            placeholder="Your name"
            className="rounded-md border px-3 py-1.5 text-sm flex-1 focus:outline-none focus:ring-1"
            style={{
              borderColor: "var(--border)",
              background: "transparent",
              color: "var(--text)",
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              ["--tw-ring-color" as string]: "var(--accent)",
            }}
          />
          <button
            type="submit"
            disabled={submitting || !text.trim() || !author.trim()}
            className="rounded-md border px-4 py-1.5 text-sm font-medium transition-colors hover:opacity-90 disabled:opacity-40"
            style={{
              borderColor: "var(--accent)",
              background: "var(--accent)",
              color: "#fff",
            }}
          >
            {submitting ? "Posting..." : "Add Note"}
          </button>
        </div>
      </form>

      {/* ── States ── */}
      {loading && (
        <div
          className="rounded-xl border p-6 text-center text-sm animate-pulse"
          style={{
            borderColor: "var(--border)",
            background: "var(--surface)",
            color: "var(--muted)",
          }}
        >
          Loading notes...
        </div>
      )}

      {error && (
        <div
          className="rounded-xl border p-4 text-sm"
          style={{
            borderColor: "var(--border)",
            background: "var(--surface)",
            color: "var(--red)",
          }}
        >
          {error}
        </div>
      )}

      {/* ── Notes list ── */}
      {!loading && !error && sorted.length === 0 && (
        <div
          className="rounded-xl border p-6 text-center text-sm"
          style={{
            borderColor: "var(--border)",
            background: "var(--surface)",
            color: "var(--muted)",
          }}
        >
          No notes yet. Add one above.
        </div>
      )}

      {sorted.map((note) => (
        <div
          key={note._id}
          className="rounded-xl border p-4 relative group"
          style={{
            borderColor: "var(--border)",
            background: "var(--surface)",
          }}
        >
          {/* Delete button */}
          <button
            onClick={() => handleDelete(note._id)}
            className="absolute top-3 right-3 w-6 h-6 flex items-center justify-center rounded-md text-xs opacity-0 group-hover:opacity-100 transition-opacity"
          onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.background = "rgba(0,0,0,0.06)"; }}
          onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.background = "transparent"; }}
            style={{ color: "var(--muted)" }}
            title="Delete note"
          >
            &times;
          </button>

          <p className="text-sm whitespace-pre-wrap pr-6" style={{ color: "var(--text)" }}>
            {note.text}
          </p>
          <div className="mt-2 flex gap-2 text-xs" style={{ color: "var(--muted)" }}>
            <span className="font-medium">{note.author}</span>
            <span>&middot;</span>
            <span>{fmtDate(note.createdAt)}</span>
          </div>
        </div>
      ))}
    </div>
  );
}
