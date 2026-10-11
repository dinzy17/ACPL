"use client";

import { useAdmin } from "@/components/admin/AdminGate";
import { UsersPanel } from "@/components/admin/panels";

export default function Page() {
  const { admin, emit, staff } = useAdmin();
  return <UsersPanel admin={admin} emit={emit} staff={staff} />;
}
