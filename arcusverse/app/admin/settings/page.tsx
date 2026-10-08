"use client";

import { useAdmin } from "@/components/admin/AdminGate";
import { SettingsPanel } from "@/components/admin/panels";

export default function Page() {
  const { admin, emit, staff } = useAdmin();
  return <SettingsPanel staff={staff} admin={admin} emit={emit} />;
}
