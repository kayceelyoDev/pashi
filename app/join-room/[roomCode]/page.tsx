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
        .select("*"); // channel or table logic to count connected peers

      // Safely get length (default to 0 if undefined)
      const peerCount = data?.length ?? 0;

      if (peerCount >= 2) router.push("/create-room");
      else router.push(`/room/${roomCode}`);
    };

    checkRoomCapacity();
  }, [roomCode, router]);

  return <div className="w-full h-screen flex items-center justify-center bg-gray-100">
  <div className="bg-white rounded-2xl shadow-lg p-8 flex flex-col items-center gap-4 animate-fadeIn">

    <div className="w-12 h-12 border-4 border-blue-400 border-t-transparent border-solid rounded-full animate-spin"></div>

   
    <h2 className="text-xl sm:text-2xl font-semibold text-gray-800 text-center">
      Checking room availability...
    </h2>

    
    {roomCode && (
      <p className="text-sm sm:text-base text-gray-500 text-center">
        Room Code: <span className="font-medium text-gray-700">{roomCode}</span>
      </p>
    )}


    <p className="text-xs sm:text-sm text-gray-400 text-center">
      Please wait while we check the room capacity.
    </p>
  </div>
</div>
;
}
