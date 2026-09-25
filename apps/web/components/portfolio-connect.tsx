"use client";

import * as Dialog from "@radix-ui/react-dialog";
import { Button } from "@sisera/ui";
import { Building2, KeyRound, Link2, Plus, ShieldCheck, WalletCards, X } from "lucide-react";
import { useState } from "react";

const connectionTypes = [
  {
    id: "exchange",
    title: "Exchange account",
    copy: "Read-only or trading API credentials",
    icon: KeyRound,
  },
  {
    id: "wallet",
    title: "Onchain wallet",
    copy: "EVM, Solana, Bitcoin, and supported chains",
    icon: WalletCards,
  },
  {
    id: "custodian",
    title: "Custodian or prime",
    copy: "Institutional portfolio and balance feeds",
    icon: Building2,
  },
];

export function PortfolioConnect() {
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState("exchange");
  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <Dialog.Trigger asChild>
        <Button variant="primary" size="sm">
          <Plus size={13} /> Connect account
        </Button>
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-[100] bg-black/75 backdrop-blur-sm" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-[110] w-[calc(100%-2rem)] max-w-2xl -translate-x-1/2 -translate-y-1/2 border border-line-strong bg-[#0b1119] shadow-2xl">
          <div className="flex items-start justify-between border-b border-line p-5">
            <div>
              <Dialog.Title className="text-lg font-semibold text-white">
                Connect a portfolio source
              </Dialog.Title>
              <Dialog.Description className="mt-2 text-xs text-slate-500">
                Choose how Sisera should establish portfolio truth. Credentials are never accepted
                by this web form until custody is configured.
              </Dialog.Description>
            </div>
            <Dialog.Close className="grid size-8 place-items-center border border-line text-slate-500 hover:text-white">
              <X size={15} />
            </Dialog.Close>
          </div>
          <div className="grid gap-4 p-5 md:grid-cols-[.9fr_1.1fr]">
            <div className="space-y-2">
              {connectionTypes.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setSelected(item.id)}
                  className={`flex w-full items-center gap-3 border p-3 text-left ${selected === item.id ? "border-cyan-400/40 bg-cyan-400/[0.07]" : "border-line bg-panel"}`}
                >
                  <span className="grid size-9 place-items-center border border-line bg-[#080c12]">
                    <item.icon
                      size={15}
                      className={selected === item.id ? "text-cyan-300" : "text-slate-600"}
                    />
                  </span>
                  <span>
                    <span className="block text-[11px] font-semibold text-slate-200">
                      {item.title}
                    </span>
                    <span className="mt-1 block text-[9px] text-slate-600">{item.copy}</span>
                  </span>
                </button>
              ))}
            </div>
            <div className="border border-line bg-[#080c12] p-4">
              <p className="data-label">Connection policy</p>
              <h3 className="mt-4 text-sm font-semibold text-slate-200">
                Secure custody boundary required
              </h3>
              <p className="mt-3 text-[11px] leading-5 text-slate-500">
                The selected connector becomes available after a secrets manager, encryption key,
                organization policy, and reconciliation schedule are configured.
              </p>
              <div className="mt-5 space-y-2">
                {[
                  "Credentials encrypted outside the application database",
                  "Read permissions verified before trading permissions",
                  "Initial balances require reconciliation",
                  "Every connector action enters the audit ledger",
                ].map((item) => (
                  <div key={item} className="flex gap-2 text-[10px] leading-4 text-slate-400">
                    <ShieldCheck size={12} className="mt-0.5 shrink-0 text-emerald-300" />
                    {item}
                  </div>
                ))}
              </div>
              <button
                type="button"
                disabled
                className="mt-6 flex h-9 w-full items-center justify-center gap-2 border border-slate-700 bg-slate-800 text-[10px] font-semibold text-slate-500"
              >
                <Link2 size={12} /> Connector service not configured
              </button>
            </div>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
