import { NextResponse } from "next/server";
import { createClient, createAdminClient } from "@/lib/supabase/server";

export async function POST(req: Request) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).single();
  if (profile?.role !== "admin") {
    return NextResponse.json({ error: "Only Admin can create staff accounts" }, { status: 403 });
  }

  const { full_name, email, password } = await req.json();
  if (!full_name || !email || !password) {
    return NextResponse.json({ error: "full_name, email and password are required" }, { status: 400 });
  }
  if (password.length < 8) {
    return NextResponse.json({ error: "Password must be at least 8 characters" }, { status: 400 });
  }

  const admin = createAdminClient();
  const { data: created, error: createErr } = await admin.auth.admin.createUser({
    email, password, email_confirm: true,
  });
  if (createErr || !created.user) {
    return NextResponse.json({ error: createErr?.message || "Could not create user" }, { status: 400 });
  }

  const { error: profileErr } = await admin.from("profiles").insert({
    id: created.user.id, full_name, role: "staff", active: true,
  });
  if (profileErr) {
    // Roll back the auth user so we don't leave an orphaned login.
    await admin.auth.admin.deleteUser(created.user.id);
    return NextResponse.json({ error: profileErr.message }, { status: 400 });
  }

  return NextResponse.json({ id: created.user.id, full_name, email });
}
