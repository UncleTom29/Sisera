"use client";

import * as Dialog from "@radix-ui/react-dialog";
import { Button, cn } from "@sisera/ui";
import { Command } from "cmdk";
import {
  Activity,
  Bot,
  BriefcaseBusiness,
  ChartCandlestick,
  CommandIcon,
  Gauge,
  LayoutDashboard,
  LogOut,
  Menu,
  Search,
  Shield,
  Target,
  X,
} from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { type ReactNode, useEffect, useState } from "react";

const navigation = [
  { href: "/terminal", label: "Terminal", short: "TR", icon: ChartCandlestick },
  { href: "/portfolio", label: "Portfolio", short: "PF", icon: BriefcaseBusiness },
  { href: "/risk", label: "Risk", short: "RK", icon: Shield },
  { href: "/predictions", label: "Predictions", short: "PM", icon: Target },
  { href: "/agents", label: "Agents", short: "AG", icon: Bot },
];

export function OperatorShell({
  children,
  operator,
  localMode,
}: { children: ReactNode; operator: string; localMode: boolean }) {
  const pathname = usePathname();
  const router = useRouter();
  const [commandsOpen, setCommandsOpen] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    const listener = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setCommandsOpen((open) => !open);
      }
    };
    window.addEventListener("keydown", listener);
    return () => window.removeEventListener("keydown", listener);
  }, []);

  const navigate = (href: string) => {
    setCommandsOpen(false);
    setMobileOpen(false);
    router.push(href);
  };

  return (
    <div className="min-h-screen bg-ink text-slate-100 lg:h-screen lg:overflow-hidden">
      <header className="fixed inset-x-0 top-0 z-40 flex h-12 items-center border-b border-line bg-[#070b10] lg:left-16">
        <button
          type="button"
          onClick={() => setMobileOpen(true)}
          className="grid h-full w-12 place-items-center border-r border-line text-slate-400 lg:hidden"
          aria-label="Open navigation"
        >
          <Menu size={17} />
        </button>
        <div className="flex min-w-0 flex-1 items-center justify-between px-3 lg:px-4">
          <div className="flex min-w-0 items-center gap-3">
            <Activity size={14} className="text-cyan-300" />
            <span className="truncate font-mono text-[10px] uppercase tracking-[0.16em] text-slate-400">
              Institutional workspace
            </span>
            <span className="hidden h-4 w-px bg-line sm:block" />
            <span className="hidden font-mono text-[10px] text-slate-600 sm:block">
              GLOBAL / PAPER
            </span>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setCommandsOpen(true)}
              className="hidden h-7 items-center gap-6 border border-line bg-panel px-2 text-[11px] text-slate-500 hover:border-slate-600 sm:flex"
            >
              <span className="flex items-center gap-2">
                <Search size={12} /> Search or jump
              </span>
              <span className="font-mono">⌘K</span>
            </button>
            <span
              className={cn(
                "hidden h-6 items-center border px-2 font-mono text-[9px] uppercase tracking-wider sm:inline-flex",
                localMode
                  ? "border-amber-500/30 bg-amber-500/10 text-amber-300"
                  : "border-emerald-500/30 bg-emerald-500/10 text-emerald-300",
              )}
            >
              {localMode ? "Local mode" : "SSO verified"}
            </span>
            <span className="grid size-7 place-items-center border border-line bg-slate-900 font-mono text-[10px] text-slate-300">
              {operator.slice(0, 2).toUpperCase()}
            </span>
          </div>
        </div>
      </header>

      <aside className="fixed inset-y-0 left-0 z-50 hidden w-16 border-r border-line bg-[#070b10] lg:flex lg:flex-col">
        <Link href="/terminal" className="grid h-12 place-items-center border-b border-line">
          <span className="grid size-7 place-items-center border border-cyan-300/60 bg-cyan-300/10 font-mono text-[10px] font-bold text-cyan-200">
            S
          </span>
        </Link>
        <nav className="flex flex-1 flex-col gap-1 p-2">
          {navigation.map((item) => {
            const active = pathname === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                title={item.label}
                className={cn(
                  "group grid h-11 place-items-center border border-transparent text-slate-600 transition-colors hover:border-line hover:bg-panel hover:text-slate-200",
                  active && "border-line-strong bg-slate-800/70 text-cyan-300",
                )}
              >
                <item.icon size={17} strokeWidth={1.6} />
                <span className="sr-only">{item.label}</span>
              </Link>
            );
          })}
        </nav>
        <div className="border-t border-line p-2">
          <Link
            href="/"
            title="Exit workspace"
            className="grid h-11 place-items-center text-slate-600 hover:text-slate-200"
          >
            <LogOut size={16} />
          </Link>
        </div>
      </aside>

      {mobileOpen && (
        <div className="fixed inset-0 z-50 bg-black/70 lg:hidden">
          <div className="h-full w-72 border-r border-line bg-[#070b10] p-4">
            <div className="mb-8 flex items-center justify-between">
              <span className="font-semibold tracking-[.2em]">SISERA</span>
              <button type="button" onClick={() => setMobileOpen(false)}>
                <X size={18} />
              </button>
            </div>
            {navigation.map((item) => (
              <button
                key={item.href}
                type="button"
                onClick={() => navigate(item.href)}
                className="flex h-11 w-full items-center gap-3 border-b border-line text-sm text-slate-300"
              >
                <item.icon size={16} />
                {item.label}
              </button>
            ))}
          </div>
        </div>
      )}

      <main className="min-h-screen pt-12 lg:ml-16 lg:h-screen lg:min-h-0 lg:overflow-auto">
        {children}
      </main>

      <Dialog.Root open={commandsOpen} onOpenChange={setCommandsOpen}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-[70] bg-black/70 backdrop-blur-sm" />
          <Dialog.Content className="fixed left-1/2 top-[18%] z-[80] w-[calc(100%-2rem)] max-w-xl -translate-x-1/2 border border-line-strong bg-[#0a0f16] shadow-2xl">
            <Dialog.Title className="sr-only">Command menu</Dialog.Title>
            <Command className="w-full">
              <div className="flex items-center gap-3 border-b border-line px-4">
                <Search size={15} className="text-slate-500" />
                <Command.Input
                  autoFocus
                  placeholder="Go to a workspace…"
                  className="h-12 flex-1 bg-transparent text-sm outline-none placeholder:text-slate-600"
                />
                <CommandIcon size={13} className="text-slate-700" />
              </div>
              <Command.List className="max-h-80 overflow-auto p-2">
                <Command.Empty className="p-6 text-center text-xs text-slate-500">
                  No command found.
                </Command.Empty>
                <Command.Group
                  heading="Workspaces"
                  className="text-[10px] uppercase tracking-widest text-slate-600"
                >
                  {navigation.map((item) => (
                    <Command.Item
                      key={item.href}
                      value={item.label}
                      onSelect={() => navigate(item.href)}
                      className="mt-1 flex cursor-pointer items-center gap-3 px-3 py-3 text-sm normal-case tracking-normal text-slate-300 data-[selected=true]:bg-slate-800 data-[selected=true]:text-white"
                    >
                      <item.icon size={15} />
                      {item.label}
                      <span className="ml-auto font-mono text-[9px] text-slate-600">
                        {item.short}
                      </span>
                    </Command.Item>
                  ))}
                </Command.Group>
              </Command.List>
            </Command>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </div>
  );
}
