import { t } from "@/lib/strings/id";
import { StaffForm } from "../staff-form";

export default function NewStaffPage() {
  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-bold">{t.staff.new}</h1>
      <StaffForm staff={null} />
    </div>
  );
}
