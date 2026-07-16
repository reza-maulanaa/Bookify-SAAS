import { t } from "@/lib/strings/id";
import { ServiceForm } from "../service-form";

export default function NewServicePage() {
  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-bold">{t.services.new}</h1>
      <ServiceForm service={null} />
    </div>
  );
}
