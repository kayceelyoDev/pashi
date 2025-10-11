"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { supabaseClient } from "@/lib/supabaseClient";

export default function JoinRoomPage({ params }: { params: { roomCode: string } }) {
  const router = useRouter();
  const { roomCode } = params;

  useEffect(() => {
    const checkRoomCapacity = async () => {
      const { data } = await supabaseClient
        .from(`room-${roomCode}`)
        .select("*"); // Your channel or table logic to count connected peers

      // Safely get length (default to 0 if undefined)
      const peerCount = data?.length ?? 0;

      if (peerCount >= 2) router.push("/create-room");
      else router.push(`/room/${roomCode}`);
    };

    checkRoomCapacity();
  }, [roomCode, router]);

  return <div className="w-full h-screen flex items-center justify-center">Checking room availability...</div>;
}
