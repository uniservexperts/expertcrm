"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const supabase = createClient();

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr("");
    setLoading(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setLoading(false);
    if (error) { setErr(error.message); return; }
    router.push("/dashboard");
    router.refresh();
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4 bg-navy">
      <div className="w-full max-w-sm">
        <div className="text-center mb-6">
          <div className="text-2xl font-semibold text-white tracking-tight">Meridian Immigration</div>
          <div className="text-sm mt-1 text-slate-300">Internal follow-up &amp; case CRM</div>
        </div>
        <form onSubmit={submit} className="rounded-lg p-6 bg-white space-y-4">
          <div>
            <label className="block text-xs font-medium mb-1 text-slate-500">Email</label>
            <input type="email" required className="w-full border border-slate-200 rounded-md px-3 py-2 text-sm outline-none"
              value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@meridian.example" />
          </div>
          <div>
            <label className="block text-xs font-medium mb-1 text-slate-500">Password</label>
            <input type="password" required className="w-full border border-slate-200 rounded-md px-3 py-2 text-sm outline-none"
              value={password} onChange={(e) => setPassword(e.target.value)} />
          </div>
          {err && <div className="text-xs text-red-600">{err}</div>}
          <button type="submit" disabled={loading} className="w-full py-2 rounded-md bg-navy text-white text-sm font-medium disabled:opacity-50">
            {loading ? "Signing in…" : "Sign in"}
          </button>
        </form>
      </div>
    </div>
  );
}
