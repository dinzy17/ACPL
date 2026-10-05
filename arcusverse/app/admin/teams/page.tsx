"use client";

import { useAdmin } from "@/components/admin/AdminGate";
import { TeamsPanel } from "@/components/admin/panels";

export default function Page() {
  const { admin, emit } = useAdmin();
  return <TeamsPanel admin={admin} emit={emit} />;
}
