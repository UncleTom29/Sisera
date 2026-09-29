import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import { auth } from "../../../auth";

/** Portfolio, risk, agents, activity, and settings belong to an account; markets stay public. */
export default async function AccountLayout({ children }: { children: ReactNode }) {
  const session = await auth();
  const localMode =
    process.env.NODE_ENV !== "production" && process.env.SISERA_LOCAL_OPERATOR_MODE === "true";
  if (!session && !localMode) redirect("/sign-in");
  return children;
}
