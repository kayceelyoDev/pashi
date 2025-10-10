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

type FileMeta = {
  id: string;
  fileName: string;
  size: number;
  mime: string;
  blob?: Blob;
};

type SendingFile = {
  id: string;
  file: File;
  progress: number;
  status: "queued" | "sending" | "completed" | "cancelled" | "error";
  cancel?: () => void;
};

export default function RoomClient({ roomCode }: { roomCode: string }) {
  const router = useRouter();
  const [peerId] = useState(nanoid(8));
  const [status, setStatus] = useState("Connecting...");
  const [receivedFiles, setReceivedFiles] = useState<FileMeta[]>([]);
  const [sendingFiles, setSendingFiles] = useState<SendingFile[]>([]);
  const [preSendFiles, setPreSendFiles] = useState<File[]>([]);
  const [connectedPeers, setConnectedPeers] = useState<string[]>([]);

  const fileRef = useRef<HTMLInputElement>(null);
  const channelRef = useRef<any>(null);
  const pcRef = useRef<RTCPeerConnection | null>(null);
  const dcRef = useRef<RTCDataChannel | null>(null);

  const incomingBuffer = useRef<{ meta?: FileMeta; receivedBytes: number; streamParts: ArrayBuffer[] }>({ receivedBytes: 0, streamParts: [] });
  const pendingFiles = useRef<File[]>([]);
  const isSending = useRef(false);

  // ----------------------------
  // Setup Supabase channel
  // ----------------------------
  useEffect(() => {
    const channel = supabaseClient.channel(`room-${roomCode}`);
    channelRef.current = channel;

    // Real-time peer join/leave events
    channel.on("broadcast", { event: "peer-joined" }, ({ payload }: any) => {
      if (!payload || payload.peerId === peerId) return;
      setConnectedPeers((prev) => {
        if (!prev.includes(payload.peerId)) return [...prev, payload.peerId];
        return prev;
      });
    });

    channel.on("broadcast", { event: "peer-left" }, ({ payload }: any) => {
      if (!payload) return;
      setConnectedPeers((prev) => prev.filter((p) => p !== payload.peerId));
    });

    // Receive signals
    channel.on("broadcast", { event: "signal" }, ({ payload }: any) => {
      if (!payload || payload.from === peerId) return;
      handleSignal(payload);
    });

    // Receive file cancel broadcasts
    channel.on("broadcast", { event: "file-cancel" }, ({ payload }: any) => {
      if (!payload || payload.from === peerId) return;
      handleRemoteFileCancel(payload.fileId);
    });

    channel.subscribe((statusStr: string) => {
      if (statusStr === "SUBSCRIBED") {
        setStatus("Waiting for another peer...");
        channel.send({ type: "broadcast", event: "peer-joined", payload: { peerId } });
      }
    });

    return () => {
      channel.send({ type: "broadcast", event: "peer-left", payload: { peerId } });
      channel.unsubscribe();
    };
  }, [roomCode, peerId]);

  // Auto-connect when 2 peers
  useEffect(() => {
    if (connectedPeers.length >= 1 && !pcRef.current) {
      setupConnection(true);
    }
  }, [connectedPeers]);

  const sendSignal = (obj: any) =>
    channelRef.current?.send({ type: "broadcast", event: "signal", payload: obj });

  const broadcastFileCancel = (fileId: string) => {
    channelRef.current?.send({ type: "broadcast", event: "file-cancel", payload: { fileId, from: peerId } });
  };

  const handleRemoteFileCancel = (fileId: string) => {
    setSendingFiles((prev) =>
      prev.map((f) => (f.id === fileId ? { ...f, status: "cancelled" } : f))
    );
    pendingFiles.current = pendingFiles.current.filter(
      (f) => f.name !== sendingFiles.find((sf) => sf.id === fileId)?.file.name
    );
    setStatus(`File transfer cancelled by peer.`);
    sendNextFile(); // <-- automatically start next file
  };

  // ----------------------------
  // Setup DataChannel
  // ----------------------------
  const setupDataChannelHandlers = (dc: RTCDataChannel) => {
    dc.binaryType = "arraybuffer";

    dc.onopen = () => setStatus("Ready to send files.");
    dc.onclose = () => setStatus("Data channel closed.");
    dc.onerror = (err) => setStatus(`Data channel error: ${err}`);

    dc.onmessage = (evt) => {
      try {
        if (typeof evt.data === "string") {
          const meta = JSON.parse(evt.data) as FileMeta;
          incomingBuffer.current.meta = meta;
          incomingBuffer.current.receivedBytes = 0;
          incomingBuffer.current.streamParts = [];
        } else if (incomingBuffer.current.meta) {
          const chunk = evt.data as ArrayBuffer;
          incomingBuffer.current.streamParts.push(chunk);
          incomingBuffer.current.receivedBytes += chunk.byteLength;

          if (incomingBuffer.current.receivedBytes >= incomingBuffer.current.meta.size) {
            const blob = new Blob(incomingBuffer.current.streamParts, { type: incomingBuffer.current.meta.mime });
            setReceivedFiles((prev) => [...prev, { ...incomingBuffer.current.meta!, blob }]);
            setStatus(`Received ${incomingBuffer.current.meta.fileName}`);
            incomingBuffer.current.meta = undefined;
            incomingBuffer.current.receivedBytes = 0;
            incomingBuffer.current.streamParts = [];
          } else if (incomingBuffer.current.receivedBytes % (5 * 1024 * 1024) < chunk.byteLength) {
            setStatus(`Receiving ${incomingBuffer.current.meta.fileName} (${((incomingBuffer.current.receivedBytes / incomingBuffer.current.meta.size) * 100).toFixed(1)}%)`);
          }
        }
      } catch {
        setStatus("Error receiving file.");
      }
    };
  };

  // ----------------------------
  // Setup PeerConnection with TURN
  // ----------------------------
  const setupConnection = (isInitiator = false) => {
    if (pcRef.current) return;

    const pc = new RTCPeerConnection({
      iceServers: [
        { urls: "stun:stun.l.google.com:19302" }, // optional STUN

        {
          urls: "turn:relay1.expressturn.com:3480?transport=udp",
          username: "000000002075470587",
          credential: "6CxGtGAuHYsFZYZH7A2q78Yo",
        },
        {
          urls: "turn:relay1.expressturn.com:3480?transport=tcp", // optional TCP fallback
          username: "000000002075470587",
          credential: "6CxGtGAuHYsFZYZH7A2q78Yo",
        },
      ],
    });

    pcRef.current = pc;

    pc.onicecandidate = (e) => { if (e.candidate) sendSignal({ type: "candidate", from: peerId, data: e.candidate }); };
    pc.oniceconnectionstatechange = () => {
      if (pc.iceConnectionState === "connected") setStatus("Ready to send files.");
      else if (pc.iceConnectionState === "failed") setStatus("Connection failed.");
    };

    if (isInitiator) {
      const dc = pc.createDataChannel("file");
      dcRef.current = dc;
      setupDataChannelHandlers(dc);
      createOffer();
    } else {
      pc.ondatachannel = (event) => {
        dcRef.current = event.channel;
        setupDataChannelHandlers(dcRef.current);
      };
    }
  };

  const createOffer = async () => {
    const pc = pcRef.current!;
    try {
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      sendSignal({ type: "offer", from: peerId, data: offer });
    } catch { setStatus("Error sending offer."); }
  };

  const handleSignal = async (msg: any) => {
    const { type, data, from } = msg;
    setupConnection(false);
    const pc = pcRef.current!;
    try {
      if (type === "offer") {
        await pc.setRemoteDescription(data);
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        sendSignal({ type: "answer", from: peerId, data: answer });
      } else if (type === "answer") {
        await pc.setRemoteDescription(data);
      } else if (type === "candidate") {
        await pc.addIceCandidate(data);
      }
    } catch { setStatus("Error establishing connection."); }
  };

  // ----------------------------
  // File handling
  // ----------------------------
  const addFilesToQueue = (files: FileList) => setPreSendFiles((prev) => [...prev, ...Array.from(files)]);
  const removeFromQueue = (index: number) => setPreSendFiles((prev) => prev.filter((_, i) => i !== index));

  const sendFiles = () => {
    if (!dcRef.current || dcRef.current.readyState !== "open") { setStatus("Connection not ready for sending files."); return; }
    pendingFiles.current.push(...preSendFiles);
    setPreSendFiles([]);
    if (!isSending.current) sendNextFile();
  };

  const sendNextFile = () => {
    if (pendingFiles.current.length === 0) { isSending.current = false; return; }
    isSending.current = true;
    const file = pendingFiles.current.shift()!;
    sendFile(file).finally(() => sendNextFile());
  };

  const sendFile = (file: File) => {
    return new Promise<void>((resolve) => {
      const dc = dcRef.current!;
      const fileId = nanoid();
      let offset = 0;
      let sentBytes = 0;
      let cancelled = false;

      const sendingFile: SendingFile = {
        id: fileId, file, progress: 0, status: "queued",
        cancel: () => {
          cancelled = true;
          sendingFile.status = "cancelled";
          setSendingFiles((prev) => [...prev]);
          setStatus(`Cancelled ${file.name}`);
          broadcastFileCancel(fileId);
          sendNextFile(); // <-- automatically start next file
        },
      };
      setSendingFiles((prev) => [...prev, sendingFile]);

      const meta: FileMeta = { id: fileId, fileName: file.name, mime: file.type, size: file.size };
      try { dc.send(JSON.stringify(meta)); } catch { setStatus("Error sending file metadata."); sendingFile.status = "error"; resolve(); return; }

      const reader = new FileReader();
      const readSlice = () => { if (cancelled || offset >= file.size) return; reader.readAsArrayBuffer(file.slice(offset, offset + CHUNK_SIZE)); };
      reader.onload = (e) => {
        if (!e.target?.result || cancelled) return;
        const chunk = e.target.result as ArrayBuffer;

        const trySend = () => {
          if (cancelled) return;
          if (dc.bufferedAmount + chunk.byteLength > MAX_BUFFERED_AMOUNT) {
            dc.onbufferedamountlow = () => { dc.onbufferedamountlow = null; trySend(); };
          } else if (dc.readyState !== "open") {
            setTimeout(trySend, 50);
          } else {
            try { dc.send(chunk); } catch { sendingFile.status = "error"; setStatus(`Error sending ${file.name}`); resolve(); return; }
            sentBytes += chunk.byteLength;
            sendingFile.progress = Math.min(100, (sentBytes / file.size) * 100);
            sendingFile.status = "sending";
            setSendingFiles((prev) => [...prev]);
            offset += CHUNK_SIZE;
            if (offset < file.size) setTimeout(readSlice, 10);
            else { sendingFile.status = "completed"; sendingFile.progress = 100; setSendingFiles((prev) => [...prev]); setStatus(`Finished sending ${file.name}`); resolve(); }
          }
        };
        trySend();
      };

      readSlice();
      setStatus(`Sending ${file.name}...`);
    });
  };

  // ----------------------------
  // Leave room
  // ----------------------------
  const leaveRoom = () => {
    channelRef.current?.send({ type: "broadcast", event: "peer-left", payload: { peerId } });
    router.push(`/join-room`);
  };

  // ----------------------------
  // UI utility: file icons
  // ----------------------------
  const getFileIcon = (name?: string) => {
    if (!name) return <PaperClipIcon className="w-6 h-6 text-gray-400" />;
    const ext = name.split(".").pop()?.toLowerCase();
    switch (ext) {
      case "jpg": case "jpeg": case "png": case "gif": case "webp": return <PhotoIcon className="w-6 h-6 text-blue-500" />;
      case "mp4": case "mov": case "avi": case "mkv": return <VideoCameraIcon className="w-6 h-6 text-purple-500" />;
      case "mp3": case "wav": case "flac": return <MusicalNoteIcon className="w-6 h-6 text-green-500" />;
      case "pdf": return <DocumentTextIcon className="w-6 h-6 text-red-500" />;
      case "doc": case "docx": return <DocumentIcon className="w-6 h-6 text-blue-700" />;
      case "xls": case "xlsx": return <DocumentIcon className="w-6 h-6 text-green-700" />;
      case "ppt": case "pptx": return <DocumentIcon className="w-6 h-6 text-orange-500" />;
      default: return <PaperClipIcon className="w-6 h-6 text-gray-400" />;
    }
  };

  return (
    <div className="w-full min-h-screen flex flex-col bg-gray-100 p-4 sm:p-6 overflow-y-auto">
      {/* Instruction Banner */}
      <div className="w-full max-w-4xl mx-auto bg-blue-50 border-l-4 border-blue-400 text-blue-900 rounded-lg p-4 shadow-md mb-6 space-y-2 text-sm sm:text-base flex-shrink-0">
        <p className="font-medium">Welcome to the File Sharing Room</p>
        <ul className="list-disc ml-5 text-blue-800">
          <li><strong>Role:</strong> If you selected files, you are the <span className="font-semibold">Sender</span>.</li>
          <li><strong>Role:</strong> If you receive files, you are the <span className="font-semibold">Receiver</span>.</li>
          <li>Select files and click <strong>Send Files</strong> to start transferring.</li>
          <li>Use <strong>Cancel</strong> to stop sending a file and auto-send the next queued file.</li>
          <li>Downloaded files will appear under <strong>Received Files</strong>.</li>
        </ul>
      </div>

      {/* Status Banner */}
      <div className="w-full max-w-4xl mx-auto bg-yellow-50 border-l-4 border-yellow-400 text-yellow-900 rounded-lg p-4 shadow-md mb-6 text-sm sm:text-base flex-shrink-0">
        <p className="font-medium truncate">Status: {status}</p>
      </div>

      {/* Header & Controls */}
      <div className="w-full max-w-4xl mx-auto bg-white rounded-2xl shadow-lg p-4 sm:p-6 space-y-4 flex-shrink-0">
        <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center min-w-0">
          <div className="min-w-0">
            <h3 className="text-2xl sm:text-3xl font-semibold text-gray-800 truncate">Room: {roomCode}</h3>
            <p className="text-xs sm:text-sm text-gray-500 truncate">Peer ID: {peerId}</p>

            {connectedPeers.length > 0 && (
              <div className="mt-2">
                <p className="text-xs sm:text-sm font-medium text-gray-600 mb-1">Connected Peers:</p>
                <div className="flex flex-wrap gap-2">
                  {connectedPeers.map((peer) => (
                    <span key={peer} className="px-2 py-1 bg-green-100 text-green-800 rounded-full text-xs sm:text-sm truncate">
                      {peer}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Controls */}
        <div className="flex flex-col sm:flex-row flex-wrap gap-2 sm:gap-3 mt-4 sm:mt-6">
          <label className="flex-1 sm:flex-none flex items-center justify-center text-gray-800 gap-2 px-4 sm:px-6 py-2 sm:py-3 border border-gray-300 rounded-lg cursor-pointer hover:border-gray-400 transition font-medium text-sm sm:text-base">
            Select Files
            <input ref={fileRef} type="file" multiple className="hidden" onChange={(e) => e.target.files && addFilesToQueue(e.target.files)} />
          </label>

          <button onClick={sendFiles} className="flex-1 sm:flex-none px-4 sm:px-6 py-2 sm:py-3 bg-purple-600 text-white rounded-lg shadow hover:bg-purple-700 transition font-medium text-sm sm:text-base">
            Send Files
          </button>

          <button onClick={leaveRoom} className="flex-1 sm:flex-none px-4 sm:px-6 py-2 sm:py-3 bg-red-600 text-white rounded-lg shadow hover:bg-red-700 transition font-medium text-sm sm:text-base">
            Leave Room
          </button>
        </div>
      </div>

      {/* Files Sections */}
      <div className="flex flex-col mt-4 max-w-4xl mx-auto w-full space-y-4 flex-1">
        {/* Pre-send Files */}
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
                  <button className="flex items-center gap-1 px-2 sm:px-3 py-1 bg-red-500 text-white rounded-lg hover:bg-red-600 transition text-xs sm:text-sm" onClick={() => removeFromQueue(idx)} title="Remove this file from queue">
                    <TrashIcon className="w-4 h-4" /> Remove
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Sending Files */}
        {sendingFiles.length > 0 && (
          <div className="bg-white rounded-2xl shadow-lg p-4 sm:p-6 flex flex-col min-h-[200px] max-h-[350px] overflow-y-auto">
            <h4 className="text-lg sm:text-xl font-semibold text-gray-700 mb-2">Sending Files (Sender)</h4>
            <div className="flex flex-col gap-2">
              {sendingFiles.map((f) => (
                <div key={f.id} className="flex items-center justify-between gap-2 p-2 bg-gray-50 rounded-lg">
                  <div className="flex items-center gap-2 min-w-0 overflow-hidden">
                    {getFileIcon(f.file.name)}
                    <span className="truncate">{f.file.name}</span>
                  </div>
                  <div className="flex items-center gap-2 min-w-[120px]">
                    <span className="text-xs text-gray-600">{Math.round(f.progress)}%</span>
                    {f.status !== "completed" && f.status !== "cancelled" && (
                      <button className="px-2 py-1 bg-red-500 text-white rounded-lg text-xs" onClick={() => f.cancel?.()} title="Cancel sending this file">
                        Cancel
                      </button>
                    )}
                    {f.status === "error" && <span className="text-xs text-red-600">Error!</span>}
                    {f.status === "cancelled" && <span className="text-xs text-yellow-600">Cancelled</span>}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Received Files */}
        {receivedFiles.length > 0 && (
          <div className="bg-white rounded-2xl shadow-lg p-4 sm:p-6 flex flex-col min-h-[200px] max-h-[350px] overflow-y-auto">
            <h4 className="text-lg sm:text-xl font-semibold text-gray-700 mb-2">Received Files (Receiver)</h4>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
              {receivedFiles.map((f) => (
                <div key={f.id} className="flex items-center justify-between gap-2 p-2 sm:p-3 rounded-xl border bg-gray-50 hover:bg-gray-100 min-w-0 overflow-hidden">
                  <div className="flex items-center gap-2 sm:gap-3 min-w-0 overflow-hidden">
                    {getFileIcon(f.fileName)}
                    <span className="truncate text-gray-600">{f.fileName}</span>
                  </div>
                  {f.blob && (
                    <button
                      onClick={() => saveAs(f.blob!, f.fileName)}
                      className="flex items-center gap-1 px-2 sm:px-3 py-1 bg-green-500 text-white rounded-lg hover:bg-green-600 transition text-xs sm:text-sm"
                      title="Download this file"
                    >
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
