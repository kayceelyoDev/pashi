"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { supabaseClient } from "@/lib/supabaseClient";
import { nanoid } from "nanoid";
import { saveAs } from "file-saver";
import {
  PhotoIcon,
  VideoCameraIcon,
  MusicalNoteIcon,
  DocumentTextIcon,
  DocumentIcon,
  PaperClipIcon,
  TrashIcon,
} from "@heroicons/react/24/outline";

const MAX_BUFFERED_AMOUNT = 16 * 1024 * 1024; // 16 MB
const CHUNK_SIZE = 64 * 1024; // 64 KB

type FileMeta = { id: string; fileName: string; size: number; mime: string; blob?: Blob };
type SendingFile = { id: string; file: File; progress: number; status: "queued" | "sending" | "completed" | "cancelled"; cancel?: () => void; };

export default function RoomClient({ roomCode }: { roomCode: string }) {
  const router = useRouter();
  const [peerId] = useState(nanoid(8));
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [receivedFiles, setReceivedFiles] = useState<FileMeta[]>([]);
  const [sendingFiles, setSendingFiles] = useState<SendingFile[]>([]);
  const [preSendFiles, setPreSendFiles] = useState<File[]>([]);
  const [connectedPeers, setConnectedPeers] = useState<string[]>([]);

  const fileRef = useRef<HTMLInputElement>(null);
  const channelRef = useRef<any>(null);
  const pcRef = useRef<RTCPeerConnection | null>(null);
  const dcRef = useRef<RTCDataChannel | null>(null);

  const incomingBuffer = useRef<{ meta?: FileMeta; receivedBytes: number; streamParts: ArrayBuffer[]; cancelled: boolean; }>({ receivedBytes: 0, streamParts: [], cancelled: false });
  const pendingFiles = useRef<File[]>([]);
  const isSending = useRef(false);


  const formatSize = (size: number) => size < 1024 ? `${size} B` : size < 1024 * 1024 ? `${(size/1024).toFixed(2)} KB` : `${(size/(1024*1024)).toFixed(2)} MB`;

  
useEffect(() => {
  const setupChannel = async () => {
    const channel = supabaseClient.channel(`room-${roomCode}`);
    channelRef.current = channel;

    channel.on("broadcast", { event: "signal" }, ({ payload }: any) => {
      if (!payload || payload.from === peerId) return;
      handleSignal(payload);
      setConnectedPeers(prev =>
        prev.includes(payload.from) ? prev : [...prev, payload.from]
      );
    });

    await channel.subscribe((status: string) => {
      if (status === "SUBSCRIBED") setStatus("Connected to room.");
    });
  };

  setupChannel();

  // Cleanup
  return () => {
    channelRef.current?.unsubscribe();
  };
}, [roomCode, peerId]);

  const sendSignal = (obj: any) => channelRef.current?.send({ type: "broadcast", event: "signal", payload: obj });

  // -------------------------
  // Data Channel Handlers
  // -------------------------
  const setupDataChannelHandlers = (dc: RTCDataChannel) => {
    dc.binaryType = "arraybuffer";

    dc.onopen = () => setStatus("Data channel open, ready to send files.");
    dc.onclose = () => setStatus("Data channel closed.");
    dc.onerror = (e) => setError("Data channel error occurred.");

    dc.onmessage = (evt) => {
      try {
        if (typeof evt.data === "string") {
          const msg = JSON.parse(evt.data);
          if (msg.type === "cancel") handleCancel(msg.fileId);
          else {
            incomingBuffer.current.meta = { ...msg };
            incomingBuffer.current.receivedBytes = 0;
            incomingBuffer.current.streamParts = [];
            incomingBuffer.current.cancelled = false;
          }
        } else {
          handleIncomingChunk(evt.data as ArrayBuffer);
        }
      } catch { setError("Failed to process incoming data."); }
    };
  };

  const handleCancel = (fileId: string) => {
    if (incomingBuffer.current.meta?.id === fileId) {
      incomingBuffer.current.cancelled = true;
      setStatus(`Transfer cancelled: ${incomingBuffer.current.meta.fileName}`);
      incomingBuffer.current.meta = undefined;
      incomingBuffer.current.receivedBytes = 0;
      incomingBuffer.current.streamParts = [];
    }
  };

  const handleIncomingChunk = (chunk: ArrayBuffer) => {
    const meta = incomingBuffer.current.meta;
    if (!meta || incomingBuffer.current.cancelled) return;

    incomingBuffer.current.streamParts.push(chunk);
    incomingBuffer.current.receivedBytes += chunk.byteLength;

    if (incomingBuffer.current.receivedBytes >= meta.size) {
      const blob = new Blob(incomingBuffer.current.streamParts, { type: meta.mime });
      setReceivedFiles(prev => [...prev, { ...meta, blob }]);
      setStatus(`Received ${meta.fileName}`);
      incomingBuffer.current.meta = undefined;
      incomingBuffer.current.receivedBytes = 0;
      incomingBuffer.current.streamParts = [];
    } else if (incomingBuffer.current.receivedBytes % (5 * 1024 * 1024) < chunk.byteLength) {
      setStatus(`Receiving ${meta.fileName} (${((incomingBuffer.current.receivedBytes/meta.size)*100).toFixed(1)}%)`);
    }
  };

  // -------------------------
  // WebRTC Setup
  // -------------------------
  const setupConnection = (isInitiator = false) => {
    if (pcRef.current) return;
    const pc = new RTCPeerConnection({ iceServers: [{ urls: "stun:stun.l.google.com:19302" }] });
    pcRef.current = pc;

    pc.onicecandidate = e => { if (e.candidate) sendSignal({ type: "candidate", from: peerId, data: e.candidate }); };
    pc.onconnectionstatechange = () => { if (pc.connectionState === "disconnected") setStatus("Peer disconnected."); };

    if (isInitiator) {
      const dc = pc.createDataChannel("file");
      dcRef.current = dc;
      setupDataChannelHandlers(dc);
    } else pc.ondatachannel = e => { dcRef.current = e.channel; setupDataChannelHandlers(dcRef.current); };
  };

  const handleSignal = async (msg: any) => {
    const { type, data } = msg;
    setupConnection(false);
    const pc = pcRef.current!;
    if (type === "offer") { await pc.setRemoteDescription(data); const answer = await pc.createAnswer(); await pc.setLocalDescription(answer); sendSignal({ type: "answer", from: peerId, data: answer }); }
    else if (type === "answer" && pc.signalingState === "have-local-offer") await pc.setRemoteDescription(data);
    else if (type === "candidate") try { await pc.addIceCandidate(data); } catch { console.warn("Failed to add ICE candidate"); }
  };

  const announce = async () => {
    setupConnection(true);
    const pc = pcRef.current!;
    const dc = dcRef.current!;
    setupDataChannelHandlers(dc);
    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    sendSignal({ type: "offer", from: peerId, data: offer });
  };

  // -------------------------
  // File Sending Helpers
  // -------------------------
  const addFilesToQueue = (files: FileList) => setPreSendFiles(prev => [...prev, ...Array.from(files)]);
  const removeFromQueue = (index: number) => setPreSendFiles(prev => prev.filter((_, i) => i !== index));

  const sendFiles = () => {
    if (preSendFiles.length === 0) return;
    pendingFiles.current.push(...preSendFiles);
    setPreSendFiles([]);
    if (!isSending.current) sendNextFile();
  };

  const sendNextFile = () => {
    if (!pendingFiles.current.length) { isSending.current = false; return; }
    isSending.current = true;
    const file = pendingFiles.current.shift()!;
    sendFile(file).finally(() => sendNextFile());
  };

  const sendFile = (file: File) => new Promise<void>((resolve) => {
    const dc = dcRef.current;
    if (!dc || dc.readyState !== "open") { setError("Connection not ready."); resolve(); return; }

    const fileId = nanoid();
    let offset = 0, sentBytes = 0, cancelled = false;

    const sendingFile: SendingFile = {
      id: fileId, file, progress: 0, status: "queued", cancel: () => { cancelled = true; sendingFile.status = "cancelled"; setSendingFiles(prev => [...prev]); setStatus(`Cancelled ${file.name}`); dc.send(JSON.stringify({ type: "cancel", fileId })); resolve(); }
    };
    setSendingFiles(prev => [...prev, sendingFile]);

    dc.send(JSON.stringify({ id: fileId, fileName: file.name, mime: file.type, size: file.size }));

    const reader = new FileReader();
    const readSlice = () => { if (!cancelled && offset < file.size) reader.readAsArrayBuffer(file.slice(offset, offset + CHUNK_SIZE)); };

    reader.onload = (e) => {
      if (!e.target?.result || cancelled) return;
      const chunk = e.target.result as ArrayBuffer;
      const trySend = () => {
        if (cancelled) return;
        if (dc.bufferedAmount + chunk.byteLength > MAX_BUFFERED_AMOUNT) dc.onbufferedamountlow = () => { dc.onbufferedamountlow = null; trySend(); };
        else if (dc.readyState !== "open") setTimeout(trySend, 50);
        else {
          dc.send(chunk);
          sentBytes += chunk.byteLength;
          sendingFile.progress = Math.min(100, (sentBytes / file.size) * 100);
          sendingFile.status = "sending";
          setSendingFiles(prev => [...prev]);
          offset += CHUNK_SIZE;
          offset < file.size ? setTimeout(readSlice, 10) : (sendingFile.status = "completed", sendingFile.progress = 100, setSendingFiles(prev => [...prev]), setStatus(`Finished sending ${file.name}`), resolve());
        }
      };
      trySend();
    };
    readSlice();
    setStatus(`Sending ${file.name}...`);
  });

  const leaveRoom = async () => {
    if (!confirm("Are you sure you want to leave the room?")) return;
    try {
      const { error } = await supabaseClient.from("rooms").update({ occupied: false }).eq("code", roomCode);
      if (error) throw error;
      router.push(`/join-room`);
      setStatus("You have left the room.");
    } catch { setError("Failed to leave the room. Try again."); }
  };

  const getFileIcon = (name?: string) => {
    if (!name) return <PaperClipIcon className="w-6 h-6 text-gray-400" />;
    const ext = name.split(".").pop()?.toLowerCase();
    switch (ext) {
      case "jpg": case "jpeg": case "png": case "gif": case "webp": return <PhotoIcon className="w-6 h-6 text-blue-500" />;
      case "mp4": case "mov": case "avi": case "mkv": return <VideoCameraIcon className="w-6 h-6 text-purple-500" />;
      case "mp3": case "wav": case "flac": return <MusicalNoteIcon className="w-6 h-6 text-green-500" />;
      case "pdf": return <DocumentTextIcon className="w-6 h-6 text-red-500" />;
      case "doc": case "docx": case "xls": case "xlsx": case "ppt": case "pptx": return <DocumentIcon className="w-6 h-6 text-blue-700" />;
      default: return <PaperClipIcon className="w-6 h-6 text-gray-400" />;
    }
  };

  return (
    <div className="w-full min-h-screen flex flex-col bg-gray-100 p-4 sm:p-6 overflow-y-auto">
      <div className="w-full max-w-4xl mx-auto bg-yellow-50 border-l-4 border-yellow-400 text-yellow-900 rounded-lg p-4 shadow-md mb-6 space-y-2 text-sm sm:text-base flex-shrink-0">
        <p className="font-medium">Please do not refresh the page while in the room; it may disrupt file transfers or connections.</p>
        <p className="font-medium">Always click "Leave Room" when finished to make the room available for others.</p>
        <p className="font-medium">Avoid opening multiple tabs with the same room to prevent connection conflicts.</p>
        <p className="font-medium">Ensure all file transfers are complete before leaving the room to prevent data loss.</p>
      </div>

      <div className="w-full max-w-4xl mx-auto bg-white rounded-2xl shadow-lg p-4 sm:p-6 space-y-4 flex-shrink-0">
        <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center min-w-0">
          <div className="min-w-0">
            <h3 className="text-2xl sm:text-3xl font-semibold text-gray-800 truncate">Room: {roomCode}</h3>
            <div className="min-w-0 mt-1">
              <p className="text-xs sm:text-sm text-gray-500 truncate">Peer ID: {peerId}</p>
              {connectedPeers.length > 0 && (
                <div className="mt-2">
                  <p className="text-xs sm:text-sm font-medium text-gray-600 mb-1">Connected Peers:</p>
                  <div className="flex flex-wrap gap-2">
                    {connectedPeers.map((peer) => (
                      <span key={peer} className="px-2 py-1 bg-green-100 text-green-800 rounded-full text-xs sm:text-sm truncate">{peer}</span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
          {status && (
            <div className="mt-2 sm:mt-0 p-2 sm:p-3 bg-yellow-50 border border-yellow-200 text-yellow-800 rounded-lg shadow-sm text-center text-sm sm:text-base">{status}</div>
          )}

          {error && <div className="max-w-4xl mx-auto mb-4 p-3 bg-red-100 text-red-800 rounded-lg shadow">{error}</div>}
        </div>

        <div className="flex flex-col sm:flex-row flex-wrap gap-2 sm:gap-3 mt-4 sm:mt-6">
          <button onClick={announce} className="flex-1 sm:flex-none px-4 sm:px-6 py-2 sm:py-3 bg-blue-600 text-white rounded-lg shadow hover:bg-blue-700 transition font-medium text-sm sm:text-base">Announce / Connect</button>
          <label className="flex-1 sm:flex-none flex items-center justify-center text-gray-800 gap-2 px-4 sm:px-6 py-2 sm:py-3 border border-gray-300 rounded-lg cursor-pointer hover:border-gray-400 transition font-medium text-sm sm:text-base">
            Select Files
            <input ref={fileRef} type="file" multiple className="hidden" onChange={(e) => e.target.files && addFilesToQueue(e.target.files)} />
          </label>
          <button onClick={sendFiles} className="flex-1 sm:flex-none px-4 sm:px-6 py-2 sm:py-3 bg-purple-600 text-white rounded-lg shadow hover:bg-purple-700 transition font-medium text-sm sm:text-base">Send Files</button>
          <button onClick={leaveRoom} className="flex-1 sm:flex-none px-4 sm:px-6 py-2 sm:py-3 bg-red-600 text-white rounded-lg shadow hover:bg-red-700 transition font-medium text-sm sm:text-base">Leave Room</button>
        </div>
      </div>

      <div className="flex flex-col mt-4 max-w-4xl mx-auto w-full space-y-4 flex-1">
        {preSendFiles.length > 0 && (
          <div className="bg-white rounded-2xl shadow-lg p-4 sm:p-6 flex flex-col min-h-[200px] max-h-[350px] overflow-y-auto">
            <h4 className="text-lg sm:text-xl font-semibold text-gray-700 mb-2">Files Ready to Send</h4>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
              {preSendFiles.map((file, idx) => (
                <div key={idx} className="flex flex-col sm:flex-row items-start sm:items-center justify-between p-2 sm:p-3 rounded-xl border bg-gray-50 hover:bg-gray-100 min-w-0 overflow-hidden">
                  <div className="flex items-center gap-2 sm:gap-3 mb-2 sm:mb-0 min-w-0 overflow-hidden">
                    {getFileIcon(file.name)}
                    <div className="flex flex-col overflow-hidden min-w-0">
                      <span className="font-medium text-gray-800 text-sm sm:text-base truncate">{file.name}</span>
                      <span className="text-gray-500 text-xs sm:text-sm truncate">{Math.round(file.size / 1024)} KB</span>
                    </div>
                  </div>
                  <button className="flex items-center gap-1 px-2 sm:px-3 py-1 bg-red-500 text-white rounded-lg hover:bg-red-600 transition text-xs sm:text-sm" onClick={() => removeFromQueue(idx)}>
                    <TrashIcon className="w-4 h-4" /> Remove
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {sendingFiles.length > 0 && (
          <div className="bg-white rounded-2xl shadow-lg p-4 sm:p-6 flex flex-col min-h-[200px] max-h-[350px] overflow-y-auto">
            <h4 className="text-lg sm:text-xl font-semibold text-gray-700 mb-2">Sending Files</h4>
            <div className="flex flex-col gap-2">
              {sendingFiles.map((f) => (
                <div key={f.id} className="flex items-center justify-between gap-2 p-2 bg-gray-50 rounded-lg">
                  <div className="flex items-center gap-2 min-w-0 overflow-hidden">
                    {getFileIcon(f.file.name)}
                    <span className="truncate text-black">{f.file.name}</span>
                  </div>
                  <div className="flex items-center gap-2 min-w-[120px]">
                    <span className="text-xs text-gray-600">{Math.round(f.progress)}%</span>
                    {f.status !== "completed" && (
                      <button className="px-2 py-1 bg-red-500 text-white rounded-lg text-xs" onClick={() => f.cancel?.()}>
                        Cancel
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {receivedFiles.length > 0 && (
          <div className="bg-white rounded-2xl shadow-lg p-4 sm:p-6 flex flex-col min-h-[200px] max-h-[350px] overflow-y-auto">
            <h4 className="text-lg sm:text-xl font-semibold text-gray-700 mb-2">Received Files</h4>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
              {receivedFiles.map((f) => (
                <div key={f.id} className="flex items-center justify-between gap-2 p-2 sm:p-3 rounded-xl border bg-gray-50 hover:bg-gray-100 min-w-0 overflow-hidden">
                  <div className="flex items-center gap-2 sm:gap-3 min-w-0 overflow-hidden">
                    {getFileIcon(f.fileName)}
                    <span className="truncate">{f.fileName}</span>
                  </div>
                  {f.blob && (
                    <button onClick={() => saveAs(f.blob!, f.fileName)} className="flex items-center gap-1 px-2 sm:px-3 py-1 bg-green-500 text-white rounded-lg hover:bg-green-600 transition text-xs sm:text-sm">
                      Download
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
