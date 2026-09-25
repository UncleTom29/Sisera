"use client";

import {
  CircleUserRound,
  ExternalLink,
  LogOut,
  Network,
  Settings,
  ShieldCheck,
  User,
} from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";

export function OperatorProfile({
  operator,
  localMode = false,
}: {
  operator: string;
  localMode?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    if (open) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [open]);

  return (
    <div className="relative" ref={containerRef}>
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        className="grid size-8 place-items-center rounded border border-line bg-slate-900 text-slate-300 hover:border-cyan-400/40 hover:text-white transition-colors"
        aria-label="Operator profile"
        title={operator}
        aria-expanded={open}
      >
        <CircleUserRound size={16} />
      </button>

      {open && (
        <div className="absolute right-0 top-11 z-50 w-72 rounded-lg border border-line bg-panel p-4 shadow-2xl animate-in fade-in zoom-in-95 duration-100">
          <div className="flex items-center gap-3 border-b border-line pb-3">
            <div className="grid size-9 place-items-center rounded-full bg-cyan-300/10 text-cyan-300">
              <User size={16} />
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-xs font-semibold text-white">{operator}</p>
              <div className="mt-0.5 flex items-center gap-1.5">
                <span className="relative flex size-1.5">
                  <span className="absolute inline-flex size-full animate-ping rounded-full bg-emerald-400 opacity-75" />
                  <span className="relative inline-flex size-1.5 rounded-full bg-emerald-500" />
                </span>
                <span className="font-mono text-[10px] text-emerald-400">
                  {localMode ? "Local Operator" : "Authenticated"}
                </span>
              </div>
            </div>
          </div>

          <div className="mt-3 space-y-1.5 rounded border border-line/60 bg-[#101b23] p-2.5 text-[11px] text-slate-400">
            <div className="flex justify-between">
              <span>Environment:</span>
              <span className="font-mono text-slate-200">Terminal V2</span>
            </div>
            <div className="flex justify-between">
              <span>Network:</span>
              <span className="font-mono text-cyan-300">Solana Mainnet</span>
            </div>
            <div className="flex justify-between">
              <span>Pre-trade Risk:</span>
              <span className="font-mono text-emerald-300">Deterministic</span>
            </div>
          </div>

          <div className="mt-3 space-y-1 text-xs">
            <Link
              href="/settings"
              onClick={() => setOpen(false)}
              className="flex items-center gap-2 rounded px-2.5 py-1.5 text-slate-300 hover:bg-white/5 hover:text-white"
            >
              <Settings size={14} className="text-slate-400" />
              <span>Terminal Settings</span>
            </Link>
            <Link
              href="/risk"
              onClick={() => setOpen(false)}
              className="flex items-center gap-2 rounded px-2.5 py-1.5 text-slate-300 hover:bg-white/5 hover:text-white"
            >
              <ShieldCheck size={14} className="text-slate-400" />
              <span>Risk Controls</span>
            </Link>
            <Link
              href="/audit"
              onClick={() => setOpen(false)}
              className="flex items-center gap-2 rounded px-2.5 py-1.5 text-slate-300 hover:bg-white/5 hover:text-white"
            >
              <Network size={14} className="text-slate-400" />
              <span>Audit Ledger</span>
            </Link>
          </div>

          <div className="mt-3 border-t border-line pt-2">
            <Link
              href="/sign-in"
              onClick={() => setOpen(false)}
              className="flex w-full items-center justify-between rounded px-2.5 py-1.5 text-xs text-rose-300 hover:bg-rose-500/10"
            >
              <span>Switch Operator Session</span>
              <LogOut size={13} />
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
