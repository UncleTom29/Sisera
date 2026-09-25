"use client";

import { usePrivy } from "@privy-io/react-auth";
import { ArrowRight } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

export function PrivySignIn() {
  const { ready, authenticated, login, getAccessToken } = usePrivy();
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (!ready || !authenticated) return;
    let cancelled = false;
    async function sync() {
      try {
        const accessToken = await getAccessToken();
        if (!accessToken) throw new Error("Sign-in is temporarily unavailable. Please try again.");
        const response = await fetch("/api/session", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ accessToken }),
        });
        if (!response.ok) throw new Error("Sign-in is temporarily unavailable. Please try again.");
        if (!cancelled) {
          router.replace("/stocks");
          router.refresh();
        }
      } catch (cause) {
        if (!cancelled) setError("Sign-in is temporarily unavailable. Please try again.");
      }
    }
    void sync();
    return () => {
      cancelled = true;
    };
  }, [ready, authenticated, getAccessToken, router]);

  return (
    <div className="mt-10">
      <button
        type="button"
        disabled={!ready}
        onClick={login}
        className="flex h-12 w-full items-center justify-between rounded-md bg-cyan-300 px-5 text-sm font-semibold text-[#10212a] hover:bg-cyan-200 disabled:opacity-50"
      >
        Continue <ArrowRight size={15} />
      </button>
      <p className="mt-3 text-xs leading-5 text-slate-500">
        Sign in with Google, Apple, email or a wallet.
      </p>
      {error && (
        <p role="alert" className="mt-3 text-xs text-rose-300">
          {error}
        </p>
      )}
    </div>
  );
}
