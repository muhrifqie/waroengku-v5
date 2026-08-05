import { BadgeCheck, Hammer } from "lucide-react";
import { Page, PageHeader } from "../components/ui.jsx";

export default function CheckSubs() {
  return (
    <Page>
      <PageHeader icon={BadgeCheck} title="Check Subscription" subtitle="Cek status langganan Pro/Team akun CapCut" />
      <div className="grid place-items-center rounded-[14px] border border-dashed border-border py-20 text-center">
        <Hammer size={28} className="mb-3 text-muted-fg" />
        <div className="text-[14px] font-medium">Segera hadir</div>
        <p className="mt-1 max-w-[360px] text-[12px] text-muted-fg">Pilih akun tersimpan lalu cek status subscription-nya lewat sesi login yang ada.</p>
      </div>
    </Page>
  );
}
