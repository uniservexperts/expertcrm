"use client";
import { ReactNode } from "react";

const TONES: Record<string, string> = {
  slate: "bg-slate-100 text-slate-600",
  brass: "bg-amber-50 text-amber-700",
  red: "bg-red-50 text-red-700",
  green: "bg-emerald-50 text-emerald-700",
  blue: "bg-blue-50 text-blue-700",
};

export function Badge({ children, tone = "slate" }: { children: ReactNode; tone?: string }) {
  return <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium whitespace-nowrap ${TONES[tone] || TONES.slate}`}>{children}</span>;
}

export function StatCard({ label, value, tone = "slate" }: { label: string; value: number | string; tone?: string }) {
  const colors: Record<string, string> = { slate: "text-ink", red: "text-red-700", green: "text-emerald-700", brass: "text-amber-700", blue: "text-blue-700" };
  return (
    <div className="rounded-lg p-4 bg-white border border-slate-200">
      <div className="text-xs font-medium mb-1 text-slate-500">{label}</div>
      <div className={`text-2xl font-semibold ${colors[tone] || colors.slate}`}>{value}</div>
    </div>
  );
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
