import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import SidebarNav from "./sidebar-nav";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase.from("profiles").select("*").eq("id", user.id).single();
  if (!profile) {
    // Auth user exists but has no profile row yet — admin needs to finish setup.
    redirect("/login");
  }

  return (
    <div className="min-h-screen flex">
      <SidebarNav profile={profile} />
      <div className="flex-1 min-w-0 flex flex-col">
        <div className="flex-1 overflow-y-auto p-6">{children}</div>
      </div>
    </div>
  );
}
