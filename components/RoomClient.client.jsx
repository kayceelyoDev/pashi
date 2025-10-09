"use client";

import React, { useEffect, useRef, useState } from "react";
import { supabaseClient } from "@/lib/supabaseClient";
import { nanoid } from "nanoid";
import { saveAs } from "file-saver";

const CHUNK_SIZE = 64 * 1024;
const ICE_SERVERS = [{ urls: "stun:stun.l.google.com:19302" }];

export default function RoomClient({ roomCode }) {
  const [peerId] = useState(nanoid(8));
  const [role, setRole] = useState("viewer");
  const [peers, setPeers] = useState([]);
  const [incomingPreviews, setIncomingPreviews] = useState([]);
  const [receivedFiles, setReceivedFiles] = useState(() => {
    if (typeof window !== "undefined") {
      return JSON.parse(localStorage.getItem("receivedFiles") || "[]");
    }
    return [];
  });
  const [status, setStatus] = useState("");

  const channelRef = useRef(null);
  const pcMap = useRef(new Map());
  const dcMap = useRef(new Map());
  const incomingBuffers = useRef({});
  const fileRef = useRef();

  useEffect(() => {
    const channel = supabaseClient.channel(`room-${roomCode}`);
    channelRef.current = channel;

    channel.on("broadcast", { event: "signal" }, ({ payload }) => {
      if (!payload || payload.from === peerId) return;
      handleSignal(payload);
    });

    channel.subscribe((status) => {
      if (status === "SUBSCRIBED") setStatus("Connected to room.");
    });

    return () => channel.unsubscribe();
  }, [roomCode, peerId]);

  function sendSignal(obj) {
    channelRef.current?.send({ type: "broadcast", event: "signal", payload: obj });
  }

  function makePC(remotePeerId) {
    const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });

    pc.onicecandidate = (e) => {
      if (e.candidate) sendSignal({ type: "candidate", from: peerId, to: remotePeerId, data: e.candidate });
    };

    pc.ondatachannel = (e) => {
      const dc = e.channel;
      dc.binaryType = "arraybuffer";

      dc.onmessage = (evt) => {
        if (typeof evt.data === "string") {
          incomingBuffers.current[remotePeerId] = { meta: JSON.parse(evt.data), chunks: [] };
        } else {
          incomingBuffers.current[remotePeerId].chunks.push(evt.data);
        }
      };

      dc.onclose = () => {
        const buffer = incomingBuffers.current[remotePeerId];
        if (!buffer) return;

        const blob = new Blob(buffer.chunks, { type: buffer.meta.mime });
        const newFile = { fileName: buffer.meta.fileName, blob, mime: buffer.meta.mime, size: buffer.meta.size };

        setReceivedFiles((prev) => {
          const updated = [...prev, newFile];
          localStorage.setItem("receivedFiles", JSON.stringify(updated.map(f => ({ fileName: f.fileName, mime: f.mime, size: f.size }))));
          return updated;
        });

        setIncomingPreviews((prev) =>
          prev.filter(p => p.from !== remotePeerId || p.meta.fileName !== buffer.meta.fileName)
        );
        delete incomingBuffers.current[remotePeerId];
      };
    };

    return pc;
  }

  async function createOffer(remotePeerId) {
    const pc = makePC(remotePeerId);
    const dc = pc.createDataChannel("file");
    dc.binaryType = "arraybuffer";

    pcMap.current.set(remotePeerId, pc);
    dcMap.current.set(remotePeerId, dc);

    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    sendSignal({ type: "offer", from: peerId, to: remotePeerId, data: offer });
  }

  async function handleSignal(msg) {
    const { type, from, to, data } = msg;

    if (type === "join") {
      if (!peers.includes(from)) setPeers((p) => [...p, from]);
      if (role === "sender" && from !== peerId) createOffer(from);
    }

    if (type === "offer" && to === peerId) {
      const pc = makePC(from);
      await pc.setRemoteDescription(data);
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      pcMap.current.set(from, pc);
      sendSignal({ type: "answer", from: peerId, to: from, data: answer });
    }

    if (type === "answer" && to === peerId) {
      const pc = pcMap.current.get(from);
      if (pc) await pc.setRemoteDescription(data);
    }

    if (type === "candidate" && to === peerId) {
      const pc = pcMap.current.get(from);
      if (pc && data) pc.addIceCandidate(data).catch(console.warn);
    }

    if (type === "preview" && to === peerId) {
      setIncomingPreviews((prev) => [...prev, { from, meta: data }]);
      setStatus(`Incoming file preview from ${from}: ${data.fileName}`);
    }

    if (type === "start-transfer" && role === "sender") {
      const dc = dcMap.current.get(from);
      const file = fileRef.current?.files?.[0];
      if (!dc || !file || file.name !== data.fileName) return;

      // send meta
      dc.send(JSON.stringify({ fileName: file.name, mime: file.type, size: file.size }));

      const reader = new FileReader();
      let offset = 0;

      const readSlice = (o) => reader.readAsArrayBuffer(file.slice(o, o + CHUNK_SIZE));

      reader.onload = (e) => {
        dc.send(e.target.result);
        offset += e.target.result.byteLength;
        if (offset < file.size) readSlice(offset);
      };

      readSlice(0);
      setStatus(`Sending ${file.name} to ${from}...`);
    }
  }

  function sendPreview() {
    const file = fileRef.current?.files?.[0];
    if (!file) return alert("Pick a file first.");
    const meta = { fileName: file.name, size: file.size, mime: file.type };
    peers.forEach(p => sendSignal({ type: "preview", from: peerId, to: p, data: meta }));
    setStatus(`Sent preview for ${file.name}`);
  }

  function acceptPreview(fromPeer, meta) {
    sendSignal({ type: "start-transfer", from: peerId, to: fromPeer, data: { fileName: meta.fileName } });
    setStatus(`Accepted file ${meta.fileName} from ${fromPeer}`);
  }

  function becomeSender() {
    setRole("sender");
    peers.forEach(p => createOffer(p));
  }

  const getFileIcon = (mime) => {
    if (mime.includes("pdf")) return "📄";
    if (mime.includes("image")) return "🖼️";
    if (mime.includes("video")) return "🎬";
    return "📁";
  };

  return (
    <div className="p-6 max-w-3xl mx-auto space-y-6">
      <h3 className="text-2xl font-bold">Room: {roomCode}</h3>
      <div className="text-gray-600">Peer ID: {peerId}</div>
      {status && <div className="mt-2 p-2 bg-yellow-100 text-yellow-800 rounded">{status}</div>}

      <div className="mt-4 space-x-2">
        <button className="px-4 py-2 bg-blue-600 text-white rounded" onClick={() => sendSignal({ type: "join", from: peerId })}>Announce</button>
        <button className="px-4 py-2 bg-green-600 text-white rounded" onClick={becomeSender}>Become Sender</button>
      </div>

      <div className="mt-4 flex items-center space-x-2">
        <input ref={fileRef} type="file" className="border rounded px-2 py-1" />
        <button className="px-4 py-2 bg-purple-600 text-white rounded" onClick={sendPreview}>Send File Preview</button>
      </div>

      <div className="mt-6">
        <h4 className="text-xl font-semibold mb-2">Incoming Previews:</h4>
        {incomingPreviews.length === 0 ? <div className="text-gray-500">No incoming files.</div> :
          <ul className="space-y-2">
            {incomingPreviews.map((x, idx) => (
              <li key={idx} className="flex items-center justify-between p-2 border rounded">
                <span>{getFileIcon(x.meta.mime)} {x.meta.fileName} ({Math.round(x.meta.size / 1024)} KB) from {x.from}</span>
                <button className="px-3 py-1 bg-green-500 text-white rounded" onClick={() => acceptPreview(x.from, x.meta)}>Accept</button>
              </li>
            ))}
          </ul>
        }
      </div>

      <div className="mt-6">
        <h4 className="text-xl font-semibold mb-2">Received Files:</h4>
        {receivedFiles.length === 0 ? <div className="text-gray-500">No files received yet.</div> :
          <ul className="space-y-2">
            {receivedFiles.map((file, idx) => (
              <li key={idx} className="flex items-center justify-between p-2 border rounded">
                <span>{getFileIcon(file.mime)} {file.fileName} ({Math.round(file.size / 1024)} KB)</span>
                <button className="px-3 py-1 bg-blue-500 text-white rounded" onClick={() => saveAs(file.blob, file.fileName)}>Download</button>
              </li>
            ))}
          </ul>
        }
      </div>
    </div>
  );
}
