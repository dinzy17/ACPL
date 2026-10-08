"use client";

import { useAdmin } from "@/components/admin/AdminGate";
import { OwnersPanel } from "@/components/admin/panels";

export default function Page() {
  const { admin, emit } = useAdmin();
  return <OwnersPanel admin={admin} emit={emit} />;
}
