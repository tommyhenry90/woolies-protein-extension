"use client";

import { useEffect, useRef, useState } from "react";
import { wooliesSuggest } from "@/lib/woolies";

type Props = {
  initialValue?: string;
  pending?: boolean;
  onSubmit: (term: string) => void;
  accentClass?: string;             // e.g. "bg-green-600 hover:bg-green-700"
  suggestStore?: "woolies" | "coles";
};

export function SearchBox({
  initialValue = "",
  pending = false,
  onSubmit,
  accentClass = "bg-green-600 hover:bg-green-700",
  suggestStore = "woolies",
}: Props) {
  const [term, setTerm] = useState(initialValue);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState<number>(-1);
  const ctrlRef = useRef<AbortController | null>(null);
  const wrapRef = useRef<HTMLDivElement>(null);

  // Debounced suggestion fetch. Coles doesn't expose a public suggest
  // endpoint we've wired, so we only show suggestions for Woolies.
  useEffect(() => {
    if (suggestStore !== "woolies") {
      setSuggestions([]);
      return;
    }
    const q = term.trim();
    if (q.length < 2) {
      setSuggestions([]);
      return;
    }
    if (ctrlRef.current) ctrlRef.current.abort();
    const ctrl = new AbortController();
    ctrlRef.current = ctrl;
    const t = setTimeout(async () => {
      const list = await wooliesSuggest(q, ctrl.signal);
      if (!ctrl.signal.aborted) {
        setSuggestions(list.slice(0, 8));
        setHighlight(-1);
      }
    }, 150);
    return () => { clearTimeout(t); ctrl.abort(); };
  }, [term, suggestStore]);

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, []);

  function submit(value: string) {
    setOpen(false);
    setHighlight(-1);
    setTerm(value);
    onSubmit(value);
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (!open || suggestions.length === 0) {
      if (e.key === "Enter") {
        e.preventDefault();
        if (term.trim()) submit(term.trim());
      }
      return;
    }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlight((h) => (h + 1) % suggestions.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlight((h) => (h - 1 + suggestions.length) % suggestions.length);
    } else if (e.key === "Enter") {
      e.preventDefault();
      submit(highlight >= 0 ? suggestions[highlight] : term.trim());
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  }

  const ringClass = suggestStore === "coles" ? "focus:ring-red-600" : "focus:ring-green-600";

  return (
    <div className="relative flex gap-2" ref={wrapRef}>
      <div className="relative flex-1">
        <input
          type="search"
          autoFocus
          autoComplete="off"
          value={term}
          onChange={(e) => { setTerm(e.target.value); setOpen(true); }}
          onFocus={() => setOpen(true)}
          onKeyDown={onKeyDown}
          placeholder="Search for chicken breast, greek yoghurt, oats…"
          className={`w-full px-4 py-3 border border-gray-300 rounded-lg text-base focus:outline-none focus:ring-2 ${ringClass}`}
        />
        {open && suggestions.length > 0 && (
          <ul className="absolute z-10 left-0 right-0 top-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg overflow-hidden">
            {suggestions.map((s, i) => (
              <li
                key={s}
                onMouseDown={(e) => { e.preventDefault(); submit(s); }}
                onMouseEnter={() => setHighlight(i)}
                className={
                  "px-4 py-2 text-sm cursor-pointer " +
                  (i === highlight ? "bg-gray-100" : "hover:bg-gray-50")
                }
              >
                {s}
              </li>
            ))}
          </ul>
        )}
      </div>
      <button
        type="button"
        onClick={() => term.trim() && submit(term.trim())}
        disabled={pending || !term.trim()}
        className={`px-6 py-3 rounded-lg text-white font-medium disabled:bg-gray-300 disabled:cursor-not-allowed ${accentClass}`}
      >
        {pending ? "Searching…" : "Search"}
      </button>
    </div>
  );
}
