"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { Client, DOC_KEYS } from "@/lib/types";
import { Badge } from "@/components/ui";

export default function ClientsPage() {
  const supabase = createClient();
  const [clients, setClients] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [denied, setDenied] = useState(false);

  useEffect(() => {
    (async () => {
      const { data, error } = await supabase.from("clients").select("*, client_documents(*), payments(*), refunds(*)").order("conversion_date", { ascending: false });
      if (error) setDenied(true);
      setClients(data || []);
      setLoading(false);
    })();
  }, []);

  if (loading) return <div className="text-slate-500 text-sm">Loading…</div>;
  if (denied) return <div className="text-sm text-red-600">You don't have access to Client Management.</div>;
  if (!clients.length) return <div className="text-sm p-6 text-center rounded-lg bg-white border border-slate-200 text-slate-400">No clients yet. Convert a lead to get started.</div>;

  return (
    <div>
      <h2 className="text-lg font-semibold mb-4 text-ink">Client management</h2>
      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {clients.map((c) => {
          const docsReceived = DOC_KEYS.filter(([k]) => c.client_documents?.find((d: any) => d.doc_key === k)?.received).length;
          const paid = (c.payments || []).reduce((s: number, p: any) => s + Number(p.amount), 0);
          const balance = c.total_fee - paid;
          const refund = c.refunds?.[0];
          return (
            <Link key={c.id} href={`/clients/${c.id}`} className="text-left rounded-lg border border-slate-200 p-4 bg-white hover:shadow-sm transition block">
              <div className="flex items-center justify-between mb-2">
                <div>
                  <div className="font-medium text-sm text-ink">{c.name}</div>
                  <div className="text-xs text-slate-400">{c.client_code}</div>
                </div>
                <Badge tone={c.visa_status === "Approved" ? "green" : c.visa_status === "Refused" ? "red" : "blue"}>{c.visa_status}</Badge>
              </div>
              <div className="flex items-center justify-between text-xs text-slate-500">
                <span>Docs {docsReceived}/5</span>
                <span className={balance > 0 ? "text-red-600" : "text-emerald-600"}>{balance > 0 ? `₹${balance.toLocaleString("en-IN")} due` : "Fully paid"}</span>
              </div>
              {refund?.applicable && refund.status !== "Paid" && <div className="mt-2"><Badge tone="red">Refund pending</Badge></div>}
            </Link>
          );
        })}
      </div>
    </div>
  );
}
