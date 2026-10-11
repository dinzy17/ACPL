"use client";

import { useAdmin } from "@/components/admin/AdminGate";
import { AuctionsPanel } from "@/components/admin/panels";

export default function Page() {
  const { admin, emit } = useAdmin();
  return <AuctionsPanel admin={admin} emit={emit} />;
}
