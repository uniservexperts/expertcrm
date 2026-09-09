"use client";
import { useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Home, ClipboardList, Calendar, Briefcase, FileText, Settings, LogOut, Menu, X } from "lucide-react";

export default function SidebarNav({ profile }: { profile: { full_name: string; role: string } }) {
  const pathname = usePathname();
  const router = useRouter();
  const [open, setOpen] = useState(false);
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
        ["/reports", "My Reports", FileText],
        ["/settings", "Settings", Settings],
      ];

  async function signOut() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  }

  return (
    <>
      {/* Mobile-only top bar with hamburger */}
      <div className="md:hidden sticky top-0 z-30 flex items-center justify-between px-4 py-3 bg-navy text-white">
        <button onClick={() => setOpen(true)} className="p-1 -ml-1" aria-label="Open menu">
          <Menu size={22} />
        </button>
        <div className="text-sm font-semibold tracking-tight">Uniserv Experts</div>
        <div className="w-6" />
      </div>

      {/* Backdrop, mobile only, while drawer is open */}
      {open && (
        <div className="md:hidden fixed inset-0 z-40 bg-black/40" onClick={() => setOpen(false)} />
      )}

      {/* Sidebar: slide-in drawer on mobile, always-visible column on desktop */}
      <div
        className={`fixed md:static top-0 left-0 h-full z-50 w-64 md:w-60 flex-shrink-0 flex flex-col bg-navy
          transform transition-transform duration-200 ease-out
          ${open ? "translate-x-0" : "-translate-x-full"} md:translate-x-0`}
      >
        <div className="px-5 py-5 border-b border-white/10 flex items-center justify-between">
          <div>
            <div className="text-white font-semibold text-sm tracking-tight">Uniserv Experts</div>
            <div className="text-xs mt-0.5 text-slate-400">{isAdmin ? "Admin console" : "Staff workspace"}</div>
          </div>
          <button onClick={() => setOpen(false)} className="md:hidden p-1 text-slate-300" aria-label="Close menu">
            <X size={20} />
          </button>
        </div>
        <div className="flex-1 py-3 overflow-y-auto">
          {items.map(([href, label, Icon]: any) => {
            const active = pathname === href;
            return (
              <Link key={href} href={href} onClick={() => setOpen(false)}
                className={`flex items-center gap-2.5 px-5 py-3 md:py-2.5 text-sm ${active ? "text-white bg-navy3" : "text-slate-300"}`}>
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
    </>
  );
}
