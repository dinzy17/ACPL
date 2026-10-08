"use client";

import { useAdmin } from "@/components/admin/AdminGate";
import { TournamentsPanel } from "@/components/admin/panels";

export default function Page() {
  const { admin, emit } = useAdmin();
  return <TournamentsPanel admin={admin} emit={emit} />;
}
