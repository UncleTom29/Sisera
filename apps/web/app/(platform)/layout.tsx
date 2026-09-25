import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import { auth } from "../../auth";
import { OperatorShell } from "../../components/operator-shell";

export default async function PlatformLayout({ children }: { children: ReactNode }) {
  const session = await auth();
  const localMode = process.env.SISERA_LOCAL_OPERATOR_MODE === "true";
  if (!session && !localMode) redirect("/sign-in");
  const operator = session?.user?.name ?? "Local operator";
  return (
    <OperatorShell operator={operator} localMode={localMode}>
      {children}
    </OperatorShell>
  );
}
