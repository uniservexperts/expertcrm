"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Home, ClipboardList, Calendar, Briefcase, FileText, Settings, LogOut } from "lucide-react";

export default function SidebarNav({ profile }: { profile: { full_name: string; role: string } }) {
  const pathname = usePathname();
  const router = useRouter();
  const isAdmin = profile.role === "admin";

  const items = isAdmin
    ? [
        ["/dashboard", "Dashboard", Home],
        ["/leads", "Leads", ClipboardList],
        ["/followups", "Follow-up Center", Calendar],
        ["/clients", "Clients", Briefcase],
        ["/reports", "Reports", FileText],
        ["/settings", "Settings", Settings],
      ]
    : [
        ["/dashboard", "Dashboard", Home],
        ["/leads", "My Leads", ClipboardList],
        ["/followups", "Follow-up Center", Calendar],
      ];

  async function signOut() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  }

  return (
    <div className="w-60 flex-shrink-0 flex flex-col bg-navy">
      <div className="px-5 py-5 border-b border-white/10">
        <div className="text-white font-semibold text-sm tracking-tight">Meridian Immigration</div>
        <div className="text-xs mt-0.5 text-slate-400">{isAdmin ? "Admin console" : "Staff workspace"}</div>
      </div>
      <div className="flex-1 py-3">
        {items.map(([href, label, Icon]: any) => {
          const active = pathname === href;
          return (
            <Link key={href} href={href}
              className={`flex items-center gap-2.5 px-5 py-2.5 text-sm ${active ? "text-white bg-navy3" : "text-slate-300"}`}>
              <Icon size={16} /> {label}
            </Link>
          );
        })}
      </div>
      <div className="px-5 py-4 border-t border-white/10">
        <div className="text-xs text-white mb-2">{profile.full_name}</div>
        <button onClick={signOut} className="flex items-center gap-1.5 text-xs text-slate-400">
          <LogOut size={13} /> Sign out
        </button>
      </div>
    </div>
  );
}
