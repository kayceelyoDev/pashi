"use client";
import { useState, Suspense } from "react";
import { supabaseClient } from "@/lib/supabaseClient";
import { useRouter, useSearchParams } from "next/navigation";
import Image from "next/image";
import { Plus, Users, Shield, Zap, ArrowRight, Home, Sparkles } from "lucide-react";

function CreateRoomContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const type = searchParams.get("type") || "p2p"; // Default to 'p2p' if not specified

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
        .insert([{ code, expires_at: expiresAt, occupied: false, type }]);
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
    <div className="min-h-screen bg-white flex items-center justify-center p-6">
      <div className="w-full max-w-lg">
        {/* Logo */}
        <div className="flex justify-center mb-12">
          <Image
            src="/logo1.png"
            alt="PASAHI Logo"
            width={80}
            height={80}
            className="object-contain"
          />
        </div>

        {/* Main Content */}
        <div className="text-center mb-12">
          <h1 className="text-4xl font-light text-black mb-4 tracking-tight">
            PASAHI
          </h1>
          <p className="text-gray-500 text-sm max-w-md mx-auto">
            Secure file transfer made simple. Create a room or join an existing one to start sharing files instantly.
          </p>
        </div>

        {/* Status Message */}
        {status && (
          <div className="mb-8 p-4 bg-gray-50 text-gray-900 rounded-lg border border-gray-200 text-center text-sm font-medium">
            {status}
          </div>
        )}

        {/* Action Buttons */}
        <div className="space-y-3 mb-12">
          <button
            onClick={createRoom}
            disabled={loading}
            className="w-full group py-4 bg-black text-white font-medium rounded-lg hover:bg-gray-800 active:scale-[0.98] transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-black disabled:active:scale-100"
          >
            <span className="flex items-center justify-center gap-2">
              {loading ? (
                <>
                  <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                  Creating...
                </>
              ) : (
                <>
                  <Plus className="w-5 h-5" />
                  Create Room
                  <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
                </>
              )}
            </span>
          </button>

          <button
            onClick={() => router.push("/join-room")}
            className="w-full py-4 bg-white text-black font-medium rounded-lg hover:bg-gray-50 active:scale-[0.98] transition-all duration-200 border border-gray-300 flex items-center justify-center gap-2"
          >
            <Users className="w-5 h-5" />
            Join Room
          </button>
        </div>

        {/* Features Grid */}
        <div className="grid grid-cols-3 gap-4 mb-12">
          <div className="flex flex-col items-center text-center p-4">
            <div className="w-12 h-12 bg-gray-100 rounded-full flex items-center justify-center mb-3">
              <Shield className="w-5 h-5 text-black" />
            </div>
            <p className="text-xs text-gray-600">Secure</p>
          </div>
          <div className="flex flex-col items-center text-center p-4">
            <div className="w-12 h-12 bg-gray-100 rounded-full flex items-center justify-center mb-3">
              <Zap className="w-5 h-5 text-black" />
            </div>
            <p className="text-xs text-gray-600">Fast</p>
          </div>
          <div className="flex flex-col items-center text-center p-4">
            <div className="w-12 h-12 bg-gray-100 rounded-full flex items-center justify-center mb-3">
              <Sparkles className="w-5 h-5 text-black" />
            </div>
            <p className="text-xs text-gray-600">Simple</p>
          </div>
        </div>

        {/* Important Notes */}
        <div className="p-6 bg-gray-50 rounded-lg border border-gray-200 mb-8">
          <h3 className="font-medium text-black mb-3 text-sm">Important Notes</h3>
          <ul className="space-y-2 text-sm text-gray-600">
            <li className="flex items-start gap-2">
              <span className="text-black mt-0.5">•</span>
              <span>Do not refresh the page while in a room</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-black mt-0.5">•</span>
              <span>Always leave the room after use</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-black mt-0.5">•</span>
              <span>Only one user can occupy a new room initially</span>
            </li>
          </ul>
        </div>

        {/* Footer */}
        <div className="text-center">
          <button
            onClick={() => router.push("/")}
            className="inline-flex items-center gap-2 text-sm text-gray-500 hover:text-black font-medium transition-colors duration-200"
          >
            <Home className="w-4 h-4" />
            Back to Home
          </button>
        </div>
      </div>
    </div>
  );
}

export default function CreateRoom() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-white flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-gray-200 border-t-black rounded-full animate-spin"></div>
      </div>
    }>
      <CreateRoomContent />
    </Suspense>
  );
}