import { StatusBadge } from "@sisera/ui";
import { KeyRound, Settings, ShieldCheck, Users } from "lucide-react";
import { PageHeader } from "../../../components/page-header";

const settings = [
  {
    icon: Users,
    title: "Organization & members",
    copy: "Roles, teams, desks, and portfolio access",
  },
  {
    icon: ShieldCheck,
    title: "Security policy",
    copy: "SSO, MFA, sessions, IP controls, and approvals",
  },
  {
    icon: KeyRound,
    title: "Connections & secrets",
    copy: "Venue, custody, data, and notification credentials",
  },
  {
    icon: Settings,
    title: "Workspace defaults",
    copy: "Currency, timezone, layouts, and data preferences",
  },
];
export default function SettingsPage() {
  return (
    <div className="min-h-full">
      <PageHeader
        eyebrow="Control plane"
        title="Settings"
        description="Organization-level identity, access, connections, policy, and workspace configuration."
        actions={<StatusBadge tone="positive">SSO policy active</StatusBadge>}
      />
      <div className="grid gap-3 p-4 md:grid-cols-2">
        {settings.map((item) => (
          <button
            key={item.title}
            type="button"
            className="group flex min-h-36 items-start gap-4 border border-line bg-panel p-5 text-left hover:border-slate-600"
          >
            <span className="grid size-10 place-items-center border border-line bg-[#080c12]">
              <item.icon size={16} className="text-cyan-300" />
            </span>
            <span>
              <span className="block text-sm font-semibold text-slate-200">{item.title}</span>
              <span className="mt-2 block text-[11px] text-slate-500">{item.copy}</span>
              <span className="mt-6 block font-mono text-[8px] uppercase tracking-wider text-slate-700 group-hover:text-cyan-300">
                Open configuration →
              </span>
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}
