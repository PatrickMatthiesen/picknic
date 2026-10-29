import { AppPageShell } from "@/app/_components/page-shell";
import { HouseholdMembers } from "./household-members";

export default function HouseholdPage() {
  return <AppPageShell currentPath="/household" title="Household" subtitle="Invite people to plan and cook together." maxWidthClassName="max-w-3xl"><HouseholdMembers /></AppPageShell>;
}
