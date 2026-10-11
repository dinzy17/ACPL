"use client";

import { useAdmin } from "@/components/admin/AdminGate";
import { RegistrationPanel } from "@/components/admin/RegistrationPanel";

export default function Page() {
  const { admin, emit } = useAdmin();
  return <RegistrationPanel admin={admin} emit={emit} />;
}
