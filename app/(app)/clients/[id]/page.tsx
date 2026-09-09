"use client";
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { DOC_KEYS, fmtDate, todayStr } from "@/lib/types";
import { Badge, Btn, Field, inputCls, PhoneLink } from "@/components/ui";

export default function ClientDetailPage() {
  const { id } = useParams<{ id: string }>();
  const supabase = createClient();
  const [client, setClient] = useState<any>(null);
  const [docs, setDocs] = useState<any[]>([]);
  const [payments, setPayments] = useState<any[]>([]);
  const [slot, setSlot] = useState<any>(null);
  const [refund, setRefund] = useState<any>(null);
  const [fee, setFee] = useState(0);
  const [payAmt, setPayAmt] = useState("");
  const [payRemark, setPayRemark] = useState("");
  const [loading, setLoading] = useState(true);
  const [denied, setDenied] = useState(false);

  async function load() {
    const { data: c, error } = await supabase.from("clients").select("*").eq("id", id).single();
    if (error || !c) { setDenied(true); setLoading(false); return; }
    setClient(c); setFee(c.total_fee);
    const [{ data: d }, { data: p }, { data: s }, { data: r }] = await Promise.all([
      supabase.from("client_documents").select("*").eq("client_id", id),
      supabase.from("payments").select("*").eq("client_id", id).order("payment_date"),
      supabase.from("slots").select("*").eq("client_id", id).single(),
      supabase.from("refunds").select("*").eq("client_id", id).single(),
    ]);
    setDocs(d || []); setPayments(p || []); setSlot(s); setRefund(r);
    setLoading(false);
  }
  useEffect(() => { load(); }, [id]);

  if (loading) return <div className="text-slate-500 text-sm">Loading…</div>;
  if (denied || !client) return <div className="text-sm text-red-600">You don't have access to this client record.</div>;

  const paid = payments.reduce((s, p) => s + Number(p.amount), 0);
  const balance = fee - paid;
  const docsReceived = docs.filter((d) => d.received).length;

  async function toggleDoc(doc: any) {
    await supabase.from("client_documents").update({ received: !doc.received, received_date: !doc.received ? todayStr() : null }).eq("id", doc.id);
    load();
  }
  async function saveFee() {
    await supabase.from("clients").update({ total_fee: Number(fee) }).eq("id", id);
    load();
  }
  async function addPayment() {
    if (!payAmt || Number(payAmt) <= 0) return;
    await supabase.from("payments").insert({ client_id: id, amount: Number(payAmt), remarks: payRemark });
    setPayAmt(""); setPayRemark(""); load();
  }
  async function saveSlot(patch: any) {
    await supabase.from("slots").update(patch).eq("client_id", id);
    load();
  }
  async function changeVisa(newStatus: string) {
    const { error } = await supabase.rpc("set_visa_status", { p_client_id: id, p_new_status: newStatus });
    if (error) { alert(error.message); return; }
    load();
  }
  async function confirmRefund() {
    await supabase.from("refunds").update({ status: "Paid", refund_date: todayStr() }).eq("client_id", id);
    load();
  }

  return (
    <div>
      <h2 className="text-lg font-semibold mb-4 text-ink">{client.client_code} — {client.name}</h2>
      <div className="grid md:grid-cols-2 gap-6">
        <div className="space-y-5">
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div><div className="text-xs text-slate-400">Mobile</div><PhoneLink number={client.mobile} className="text-sm" /></div>
            <div><div className="text-xs text-slate-400">Converted</div><div>{fmtDate(client.conversion_date)}</div></div>
          </div>

          <div>
            <div className="text-xs font-medium mb-2 flex items-center justify-between text-slate-500"><span>DOCUMENTS</span><span>{docsReceived} / 5</span></div>
            <div className="h-1.5 rounded-full mb-3 bg-slate-200"><div className="h-1.5 rounded-full bg-emerald-600" style={{ width: `${(docsReceived / 5) * 100}%` }} /></div>
            <div className="space-y-1.5">
              {DOC_KEYS.map(([k, label]) => {
                const doc = docs.find((d) => d.doc_key === k);
                return (
                  <label key={k} className={`flex items-center justify-between text-sm py-1 px-2 rounded ${doc?.received ? "bg-emerald-50" : "bg-slate-100"}`}>
                    <span className="flex items-center gap-2"><input type="checkbox" checked={!!doc?.received} onChange={() => toggleDoc(doc)} />{label}</span>
                    <span className="text-xs text-slate-400">{doc?.received ? fmtDate(doc.received_date) : "Pending"}</span>
                  </label>
                );
              })}
            </div>
          </div>

          <div>
            <div className="text-xs font-medium mb-2 text-slate-500">VISA STATUS</div>
            <select className={inputCls} value={client.visa_status} onChange={(e) => changeVisa(e.target.value)}>
              {["Pending with VFS", "Approved", "Refused"].map((s) => <option key={s}>{s}</option>)}
            </select>
            {client.visa_status === "Refused" && (
              <div className="mt-2 p-2.5 rounded-md text-sm bg-red-50 text-red-700">₹10,000 refund may be applicable.</div>
            )}
          </div>

          {refund?.applicable && (
            <div className="p-3 rounded-md bg-amber-50">
              <div className="text-xs font-medium mb-2 text-slate-500">REFUND</div>
              <div className="text-sm mb-2">Amount: ₹{refund.amount.toLocaleString("en-IN")} · Status: <Badge tone={refund.status === "Paid" ? "green" : "brass"}>{refund.status}</Badge></div>
              {refund.status !== "Paid" && <Btn variant="subtle" onClick={confirmRefund}>Confirm refund paid</Btn>}
            </div>
          )}
        </div>

        <div className="space-y-5">
          <div>
            <div className="text-xs font-medium mb-2 text-slate-500">PAYMENTS</div>
            <Field label="Total service fee" className="mb-2">
              <input type="number" className={inputCls} value={fee} onChange={(e) => setFee(Number(e.target.value))} onBlur={saveFee} />
            </Field>
            <div className="text-sm mb-2 flex justify-between"><span className="text-slate-500">Paid</span><span>₹{paid.toLocaleString("en-IN")}</span></div>
            <div className="text-sm mb-3 flex justify-between font-medium"><span className="text-slate-500">Balance</span><span className={balance > 0 ? "text-red-600" : "text-emerald-600"}>₹{balance.toLocaleString("en-IN")}</span></div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mb-2">
              <input type="number" placeholder="Amount" className={inputCls} value={payAmt} onChange={(e) => setPayAmt(e.target.value)} />
              <input placeholder="Remarks" className={inputCls} value={payRemark} onChange={(e) => setPayRemark(e.target.value)} />
            </div>
            <Btn variant="subtle" onClick={addPayment}>Record payment</Btn>
          </div>

          <div>
            <div className="text-xs font-medium mb-2 text-slate-500">SLOT / APPOINTMENT</div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mb-2">
              <input type="date" className={inputCls} value={slot?.slot_date || ""} onChange={(e) => saveSlot({ slot_date: e.target.value })} />
              <input type="time" className={inputCls} value={slot?.slot_time || ""} onChange={(e) => saveSlot({ slot_time: e.target.value })} />
            </div>
            <input placeholder="Center / location" className={inputCls + " mb-2"} value={slot?.location || ""} onChange={(e) => saveSlot({ location: e.target.value })} />
            <label className="flex items-center gap-2 text-xs text-slate-500">
              <input type="checkbox" checked={!!slot?.info_sent} onChange={(e) => saveSlot({ info_sent: e.target.checked, info_sent_date: e.target.checked ? todayStr() : null })} />
              Information sent to client
            </label>
          </div>
        </div>
      </div>
    </div>
  );
}
