"use client";
import RoomClient from "@/components/RoomClient.client";
import React from "react";

export default function RoomPage({ params }) {
  const resolvedParams = React.use(params); 

  return <RoomClient roomCode={resolvedParams.code} />;
}
