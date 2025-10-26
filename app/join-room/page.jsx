"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { supabaseClient } from "@/lib/supabaseClient";
import Image from "next/image";
import { Upload, Lock, Zap, ArrowRight, Home } from "lucide-react";

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
            Join Room
          </h1>
          <p className="text-gray-500 text-sm max-w-md mx-auto">
            Enter your room code to connect and transfer files securely
          </p>
        </div>

        {/* Input Section */}
        <div className="mb-8">
          <label className="block text-sm font-medium text-gray-700 mb-3">
            Room Code
          </label>
          <div className="relative">
            <input
              type="text"
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              placeholder="D0H3B"
              maxLength={5}
              className="w-full p-4 text-center text-2xl font-bold tracking-widest border border-gray-300 text-black rounded-lg focus:outline-none focus:ring-2 focus:ring-black focus:border-black transition-all duration-200"
            />
            <div className="absolute inset-y-0 right-4 flex items-center pointer-events-none">
              <Lock className="w-5 h-5 text-gray-400" />
            </div>
          </div>
          {error && (
            <div className="mt-3 p-3 bg-gray-100 border border-gray-300 rounded-lg">
              <p className="text-gray-900 text-sm font-medium text-center">
                {error}
              </p>
            </div>
          )}
        </div>

        {/* Action Buttons */}
        <div className="space-y-3 mb-12">
          <button
            onClick={joinRoom}
            disabled={loading}
            className="w-full group py-4 bg-black text-white font-medium rounded-lg hover:bg-gray-800 active:scale-[0.98] transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-black disabled:active:scale-100"
          >
            <span className="flex items-center justify-center gap-2">
              {loading ? (
                <>
                  <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                  Joining...
                </>
              ) : (
                <>
                  Join Room
                  <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
                </>
              )}
            </span>
          </button>

          <button
            onClick={() => router.push("/create-room")}
            className="w-full py-4 bg-white text-black font-medium rounded-lg hover:bg-gray-50 active:scale-[0.98] transition-all duration-200 border border-gray-300"
          >
            Create New Room
          </button>
        </div>

        {/* Features Grid */}
        <div className="grid grid-cols-3 gap-4 mb-12">
          <div className="flex flex-col items-center text-center p-4">
            <div className="w-12 h-12 bg-gray-100 rounded-full flex items-center justify-center mb-3">
              <Lock className="w-5 h-5 text-black" />
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
              <Upload className="w-5 h-5 text-black" />
            </div>
            <p className="text-xs text-gray-600">Easy</p>
          </div>
        </div>

        {/* Quick Tips */}
        <div className="p-6 bg-gray-50 rounded-lg border border-gray-200 mb-8">
          <h3 className="font-medium text-black mb-3 text-sm">Quick Tips</h3>
          <ul className="space-y-2 text-sm text-gray-600">
            <li className="flex items-start gap-2">
              <span className="text-black mt-0.5">•</span>
              <span>Verify the room code is correct before joining</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-black mt-0.5">•</span>
              <span>Only one user can join a room at a time</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-black mt-0.5">•</span>
              <span>Always leave the room after finishing your session</span>
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