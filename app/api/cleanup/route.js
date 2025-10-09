
import { supabaseServer } from "@/lib/supabaseClient";

export async function GET() {
  try {
    const { error } = await supabaseServer
      .from("rooms")
      .delete()
      .lt("expires_at", new Date().toISOString());

    if (error) throw error;
    return new Response(JSON.stringify({ ok: true }), { status: 200 });
  } catch (err) {
    console.error("cleanup err", err);
    return new Response(JSON.stringify({ message: err.message }), { status: 500 });
  }
}
