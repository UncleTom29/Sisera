import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import { auth } from "../../auth";
import { OperatorShell } from "../../components/operator-shell";
import { SiseraPrivyProvider } from "../../components/privy-provider";
import { SessionRenewal } from "../../components/session-renewal";
import { TickerTape } from "../../components/ticker-tape";

export default async function PlatformLayout({ children }: { children: ReactNode }) {
  const session = await auth();
  const localMode =
    process.env.NODE_ENV !== "production" && process.env.SISERA_LOCAL_OPERATOR_MODE === "true";
  if (!session && !localMode) redirect("/sign-in");
  const operator = session?.user?.name ?? "Local operator";
  return (
    <SiseraPrivyProvider appId={process.env.NEXT_PUBLIC_PRIVY_APP_ID}>
      <SessionRenewal />
      <OperatorShell
        operator={operator}
        localMode={localMode}
        ticker={
          <TickerTape
            identity={{ accessToken: session?.accessToken, localOperator: localMode }}
            compact
          />
        }
      >
        {children}
      </OperatorShell>
    </SiseraPrivyProvider>
  );
}
