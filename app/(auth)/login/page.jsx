"use client";
import { useState, useEffect } from "react";
import { supabaseClient } from "@/lib/supabaseClient"; // ✅ correct import
import { useRouter } from "next/navigation";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState("");
  const router = useRouter();

  useEffect(() => {
    // Listen for auth state changes
    const { data: authListener } = supabaseClient.auth.onAuthStateChange(
      (event, session) => {
        if (session) {
          // User is logged in → redirect to create-room
          router.push("/create-room");
        }
      }
    );

    return () => {
      authListener.subscription.unsubscribe();
    };
  }, [router]);

async function signIn() {
  if (!email) {
    setStatus("Please enter your email.");
    return;
  }

  setStatus("Sending magic link...");

  const { error } = await supabaseClient.auth.signInWithOtp({
    email,
    options: {
      // Change this to your create-room route
      emailRedirectTo: `${window.location.origin}/create-room`,
    },
  });

  if (error) setStatus(`Error: ${error.message}`);
  else setStatus("Check your email for the magic link.");
}


  return (
    <div style={{ padding: 20 }}>
      <h2>Sign in</h2>
      <input
        type="email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        placeholder="you@example.com"
        style={{ marginRight: 10, padding: 5 }}
      />
      <button onClick={signIn} style={{ padding: "5px 10px" }}>
        Send magic link
      </button>
      <div style={{ marginTop: 10 }}>{status}</div>
    </div>
  );
}
