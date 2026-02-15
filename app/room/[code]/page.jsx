"use client";
import RoomClient from "@/components/RoomClient.client";
import StorageRoomClient from "@/components/StorageRoomClient";
import { supabaseClient } from "@/lib/supabaseClient";
import React from "react";

export default function RoomPage({ params }) {
  const resolvedParams = React.use(params);
  const [roomType, setRoomType] = React.useState(null);
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    async function checkRoomType() {
      const { data, error } = await supabaseClient
        .from("rooms")
        .select("type")
        .eq("code", resolvedParams.code)
        .single();

      if (data) {
        setRoomType(data.type);
      }
      setLoading(false);
    }
    checkRoomType();
  }, [resolvedParams.code]);

  if (loading) return <div className="flex h-screen items-center justify-center">Loading room...</div>;

  if (roomType === "internet") {
    return <StorageRoomClient roomCode={resolvedParams.code} />;
  }

  return <RoomClient roomCode={resolvedParams.code} />;
}
