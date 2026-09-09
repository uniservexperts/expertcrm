"use client";
import { ReactNode } from "react";
import Link from "next/link";
import { Phone } from "lucide-react";

const TONES: Record<string, string> = {
  slate: "bg-slate-100 text-slate-600",
  brass: "bg-amber-100 text-amber-700",
  red: "bg-rose-100 text-rose-700",
  green: "bg-emerald-100 text-emerald-700",
  blue: "bg-indigo-100 text-indigo-700",
  violet: "bg-violet-100 text-violet-700",
};

export function Badge({ children, tone = "slate" }: { children: ReactNode; tone?: string }) {
  return <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium whitespace-nowrap ${TONES[tone] || TONES.slate}`}>{children}</span>;
}

const STAT_TONES: Record<string, { text: string; chipBg: string; chipFg: string; border: string }> = {
  slate: { text: "text-ink", chipBg: "bg-slate-100", chipFg: "text-slate-500", border: "border-l-slate-300" },
  red: { text: "text-rose-700", chipBg: "bg-rose-100", chipFg: "text-rose-600", border: "border-l-rose-500" },
  green: { text: "text-emerald-700", chipBg: "bg-emerald-100", chipFg: "text-emerald-600", border: "border-l-emerald-500" },
  brass: { text: "text-amber-700", chipBg: "bg-amber-100", chipFg: "text-amber-600", border: "border-l-amber-500" },
  blue: { text: "text-indigo-700", chipBg: "bg-indigo-100", chipFg: "text-indigo-600", border: "border-l-indigo-500" },
  violet: { text: "text-violet-700", chipBg: "bg-violet-100", chipFg: "text-violet-600", border: "border-l-violet-500" },
};

export function StatCard({ label, value, tone = "slate", link, icon: Icon }: { label: string; value: number | string; tone?: string; link?: string; icon?: any }) {
  const t = STAT_TONES[tone] || STAT_TONES.slate;
  const content = (
    <>
      <div className="flex items-start justify-between mb-2">
        <div className="text-xs font-medium text-slate-500">{label}</div>
        {Icon && (
          <div className={`w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 ${t.chipBg}`}>
            <Icon size={14} className={t.chipFg} />
          </div>
        )}
      </div>
      <div className={`text-2xl font-bold font-display ${t.text}`}>{value}</div>
    </>
  );
  const base = `rounded-xl p-4 bg-white border border-slate-200 border-l-4 ${t.border}`;
  if (link) {
    return (
      <Link href={link} className={`${base} block hover:shadow-md hover:-translate-y-0.5 transition-all`}>
        {content}
      </Link>
    );
  }
  return <div className={base}>{content}</div>;
}

export function Btn({ children, onClick, variant = "primary", className = "", type = "button", disabled }: any) {
  const base = "inline-flex items-center gap-1.5 px-3.5 py-2 rounded-md text-sm font-medium transition disabled:opacity-50";
  const variants: Record<string, string> = {
    primary: "bg-navy text-white hover:bg-navy2",
    ghost: "bg-transparent text-navy border border-slate-200",
    danger: "bg-clay text-white",
    subtle: "bg-slate-100 text-slate-800",
  };
  return (
    <button type={type} disabled={disabled} onClick={onClick} className={`${base} ${variants[variant]} ${className}`}>
      {children}
    </button>
  );
}

export function Field({ label, children, className = "" }: { label: string; children: ReactNode; className?: string }) {
  return (
    <label className={`block ${className}`}>
      <span className="block text-xs font-medium mb-1 text-slate-500">{label}</span>
      {children}
    </label>
  );
}

export const inputCls = "w-full border border-slate-200 rounded-md px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-navy3";

export function Modal({ title, onClose, children, wide }: { title: string; onClose: () => void; children: ReactNode; wide?: boolean }) {
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto py-8 px-4 bg-navy/40">
      <div className={`w-full ${wide ? "max-w-3xl" : "max-w-lg"} rounded-lg shadow-xl bg-white`}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200">
          <h3 className="font-semibold text-base text-ink">{title}</h3>
          <button onClick={onClose} className="p-1 rounded hover:bg-slate-100 text-slate-500">✕</button>
        </div>
        <div className="p-5">{children}</div>
      </div>
    </div>
  );
}

// Consistent color identity per lead status, reused anywhere a status name
// needs a color dot (dashboard, reports) — so the same status always reads
// the same color across the app.
export function statusDotColor(status: string) {
  const map: Record<string, string> = {
    "New Lead": "bg-indigo-500",
    "Contacted": "bg-sky-500",
    "Interested": "bg-emerald-500",
    "Call Later": "bg-amber-500",
    "Will Visit Office": "bg-violet-500",
    "Price Negotiation": "bg-amber-500",
    "Waiting for Decision": "bg-amber-500",
    "Documents Discussion": "bg-violet-500",
    "Confirmed Client": "bg-emerald-600",
    "Not Interested": "bg-rose-500",
    "No Response": "bg-slate-400",
    "Cancelled": "bg-slate-400",
  };
  return map[status] || "bg-slate-400";
}

// Tap-to-call phone number. Always stop propagation — this is often placed
// inside a clickable row/card, and we don't want tapping the number to also
// trigger navigating into that row.
export function PhoneLink({ number, className = "" }: { number: string; className?: string }) {
  if (!number) return null;
  return (
    <a
      href={`tel:${number}`}
      onClick={(e) => e.stopPropagation()}
      className={`inline-flex items-center gap-1 text-navy3 hover:underline ${className}`}
    >
      <Phone size={12} className="flex-shrink-0" />
      {number}
    </a>
  );
}
