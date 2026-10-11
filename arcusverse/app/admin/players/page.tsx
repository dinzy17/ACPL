"use client";

import { useAdmin } from "@/components/admin/AdminGate";
import { PlayersPanel } from "@/components/admin/panels";

export default function Page() {
  const { admin, emit } = useAdmin();
  return <PlayersPanel admin={admin} emit={emit} />;
}
