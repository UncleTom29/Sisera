import { PageHeader } from "../../../components/page-header";
import { WorkspaceSettings } from "../../../components/workspace-settings";

export default function SettingsPage() {
  return (
    <div>
      <PageHeader
        eyebrow="Workspace preferences"
        title="Settings"
        description="Control market refresh and activity alerts for this browser."
      />
      <WorkspaceSettings />
    </div>
  );
}
