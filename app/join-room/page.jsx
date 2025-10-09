"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

export default function JoinRoom() {
  const [code, setCode] = useState("");
  const router = useRouter();

  function join() {
    if (!code.trim()) return alert("Please enter a room code.");
    router.push(`/room/${code.trim().toUpperCase()}`);
  }

  return (
    <div style={{ padding: 24 }}>
      <h2>Join a Room</h2>
      <input
        value={code}
        onChange={(e) => setCode(e.target.value)}
        placeholder="Enter room code (e.g. D0H3B)"
        style={{ padding: 8, marginRight: 8 }}
      />
      <button onClick={join}>Join</button>
    </div>
  );
}
