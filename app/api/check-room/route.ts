import { NextResponse } from "next/server";
import { supabaseClient } from "@/lib/supabaseClient";

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const code = url.searchParams.get("code")?.toUpperCase();

    if (!code) {
      return NextResponse.json({ canJoin: false, message: "Room code is required." });
    }

    const { data, error } = await supabaseClient
      .from("rooms")
      .select("occupied")
      .eq("code", code)
      .single();

    if (error && error.code !== "PGRST116") {
      console.error("Supabase error:", error);
      return NextResponse.json({ canJoin: false, message: "Database error." });
    }

    // If room exists, return occupancy status. If room doesn't exist, assume can join.
    const canJoin = data ? !data.occupied : true;

    return NextResponse.json({ canJoin, message: canJoin ? "Room is available." : "Room is occupied." });
  } catch (err) {
    console.error("Unexpected error:", err);
    return NextResponse.json({ canJoin: false, message: "Failed to check room status." });
  }
}
