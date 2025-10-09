"use client";
import { useState } from "react";
import { supabaseClient } from "@/lib/supabaseClient"; // ✅ corrected
import { useRouter } from "next/navigation";

export default function CreateRoom() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  const createRoom = async () => {
    setLoading(true);

    const code = Math.random().toString(36).substring(2, 7).toUpperCase();
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

    const { error } = await supabaseClient
      .from("rooms")
      .insert([{ code, expires_at: expiresAt }]);

    setLoading(false);

    if (!error) router.push(`/room/${code}`);
    else console.error(error);
  };

  return (
    <div>
      <h1>Create Room</h1>
      <button onClick={createRoom} disabled={loading}>
        {loading ? "Creating..." : "Create Room"}
      </button>
    </div>
  );
}
