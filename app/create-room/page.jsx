"use client";
import { useState } from "react";
import { supabaseClient } from "@/lib/supabaseClient";
import { useRouter } from "next/navigation";
import Image from "next/image";

export default function CreateRoom() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState("");

  const createRoom = async () => {
    setLoading(true);
    setStatus("");

    const code = Math.random().toString(36).substring(2, 7).toUpperCase();
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

    try {
      const { error } = await supabaseClient
        .from("rooms")
        .insert([{ code, expires_at: expiresAt, occupied: false }]);
      if (error) throw error;

      setStatus(`Room ${code} created successfully! Redirecting...`);
      router.push(`/room/${code}`);
    } catch (err) {
      console.error(err);
      setStatus("Failed to create room. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-6 sm:p-12">
      <div className="w-full max-w-lg bg-white rounded-3xl shadow-xl p-8 sm:p-12 flex flex-col gap-6">
        {/* Logo */}
        <div className="flex justify-center mb-4">
          <Image
            src="/logo1.png"
            alt="PASAHI Logo"
            width={120}
            height={120}
            className="object-contain"
          />
        </div>

        {/* Heading */}
        <h1 className="text-3xl sm:text-4xl font-extrabold text-gray-800 text-center">
          Welcome to PASAHI
        </h1>
        <p className="text-gray-500 text-center sm:text-lg">
          Easily transfer files securely. Create a new room or join an existing one.
        </p>

        {/* Status Message */}
        {status && (
          <div className="p-3 bg-yellow-50 text-yellow-800 rounded-lg border border-yellow-200 shadow-sm text-center font-medium">
            {status}
          </div>
        )}

        {/* Action Buttons */}
        <div className="flex flex-col sm:flex-row gap-4 sm:gap-6 mt-4">
          <button
            onClick={createRoom}
            disabled={loading}
            className="flex-1 py-3 bg-blue-600 text-white font-semibold rounded-xl shadow hover:bg-blue-700 transition disabled:opacity-50"
          >
            {loading ? "Creating Room..." : "Create Room"}
          </button>

          <button
            onClick={() => router.push("/join-room")}
            className="flex-1 py-3 bg-gray-200 text-gray-800 font-semibold rounded-xl shadow hover:bg-gray-300 transition"
          >
            Join Room
          </button>
        </div>

        {/* Reminders */}
        <div className="mt-6 text-gray-500 text-sm sm:text-base space-y-2">
          <p>• Do not refresh the page while in a room.</p>
          <p>• Always leave the room after use.</p>
          <p>• Only one user can occupy a new room initially.</p>
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
