// app/api/create-room/route.js (server)
import { supabaseServer } from "@/lib/supabaseClient";
import { randomUUID } from "crypto";

function makeCode(len = 6) {
  return randomUUID().slice(0, len).replace(/-/g, "").toUpperCase();
}

export async function POST(req) {
  try {
    const body = await req.json();
    // Owner optional: you could read auth header and map to owner
    const owner = body?.owner || null;
    const code = makeCode(6);
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

    const { error } = await supabaseServer
      .from("rooms")
      .insert({ code, owner, expires_at: expiresAt });

    if (error) throw error;

    return new Response(JSON.stringify({ code, expiresAt }), {
      status: 201,
      headers: { "Content-Type": "application/json" }
    });
  } catch (err) {
    console.error("create-room err", err);
    return new Response(JSON.stringify({ message: err.message }), { status: 500 });
  }
}
