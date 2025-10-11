"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { supabaseClient } from "@/lib/supabaseClient";
import Image from "next/image";

export default function JoinRoom() {
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const joinRoom = async () => {
    const roomCode = code.trim().toUpperCase();
    if (!roomCode) {
      setError("Please enter a room code.");
      return;
    }

    setError("");
    setLoading(true);

    try {
      const { data, error: fetchError } = await supabaseClient
        .from("rooms")
        .select("occupied")
        .eq("code", roomCode)
        .single();

      if (fetchError) throw fetchError;

      if (data?.occupied) {
        setError("This room is currently occupied. Please create a new room.");
        return;
      }

      const { error: updateError } = await supabaseClient
        .from("rooms")
        .update({ occupied: true })
        .eq("code", roomCode);

      if (updateError) throw updateError;

      router.push(`/room/${roomCode}`);
    } catch (err) {
      console.error(err);
      setError("Failed to join the room. Try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-6 sm:p-12">
      <div className="w-full max-w-lg bg-white rounded-3xl shadow-xl p-8 sm:p-12 flex flex-col gap-6 relative">
   
        <div className="flex justify-center mb-4">
          <Image
            src="/logo1.png"
            alt="PASAHI Logo"
            width={120}
            height={120}
            className="object-contain"
          />
        </div>

   
        <h1 className="text-3xl sm:text-4xl font-extrabold text-gray-800 text-center">
          Join an Drop Zone
        </h1>
        <p className="text-gray-500 text-center sm:text-lg">
          Enter your drop zone code to connect and transfer files securely.
        </p>


        <input
          type="text"
          value={code}
          onChange={(e) => setCode(e.target.value)}
          placeholder="Enter room code (e.g., D0H3B)"
          className="w-full p-3 border text-black border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 mt-4"
        />


        {error && (
          <p className="text-red-500 text-sm text-center font-medium mt-2">
            {error}
          </p>
        )}


        <div className="flex flex-col sm:flex-row gap-4 sm:gap-6 mt-4">
          <button
            onClick={joinRoom}
            disabled={loading}
            className="flex-1 py-3 bg-blue-600 text-white font-semibold rounded-xl shadow hover:bg-blue-700 transition disabled:opacity-50"
          >
            {loading ? "Checking..." : "Join Drop Zone"}
          </button>

          <button
            onClick={() => router.push("/create-room")}
            className="flex-1 py-3 bg-gray-200 text-gray-800 font-semibold rounded-xl shadow hover:bg-gray-300 transition"
          >
            Create New Drop Zone
          </button>
        </div>

    
        <div className="mt-6 text-gray-500 text-sm sm:text-base space-y-2">
          <p>• Make sure the drop zone code is correct.</p>
          <p>• Only one user can join a drop zone at a time.</p>
          <p>• Always leave the drop zone after finishing your session.</p>
        </div>

        


        <div className="mt-6 text-center">
          <button
            onClick={() => router.push("/")}
            className="text-sm text-blue-600 hover:underline"
          >
            Back to Home
          </button>
        </div>
      </div>
    </div>
  );
}
