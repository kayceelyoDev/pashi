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

const CHUNK_SIZE = 256 * 1024; // 256 KB per chunk
const MAX_BUFFERED_AMOUNT = 16 * 1024 * 1024; // 16 MB safe buffer

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
  status: "queued" | "sending" | "completed" | "cancelled";
  cancel?: () => void;
};
export default function RoomClient({ roomCode }: { roomCode: string }) {
  const router = useRouter();
  const [peerId] = useState(nanoid(8));
  const [status, setStatus] = useState("");
  const [receivedFiles, setReceivedFiles] = useState<FileMeta[]>([]);
  const [sendingFiles, setSendingFiles] = useState<SendingFile[]>([]);
  const [preSendFiles, setPreSendFiles] = useState<File[]>([]);

  const fileRef = useRef<HTMLInputElement>(null);
  const channelRef = useRef<any>(null);
  const pcRef = useRef<RTCPeerConnection | null>(null);
  const dcRef = useRef<RTCDataChannel | null>(null);
  const incomingBuffer = useRef<{ meta?: FileMeta; chunks: ArrayBuffer[] }>({ chunks: [] });
  const pendingFiles = useRef<File[]>([]);
  const isSending = useRef(false);

  // ----------------------------
  // Setup Supabase channel
  // ----------------------------
  useEffect(() => {
    const channel = supabaseClient.channel(`room-${roomCode}`);
    channelRef.current = channel;

    channel.on("broadcast", { event: "signal" }, ({ payload }: any) => {
      if (!payload || payload.from === peerId) return;
      handleSignal(payload);
    });

    channel.subscribe((status: string) => {
      if (status === "SUBSCRIBED") setStatus("Connected to room.");
    });

    return () => {
      channel.unsubscribe();
    };
  }, [roomCode, peerId]);

  const sendSignal = (obj: any) =>
    channelRef.current?.send({ type: "broadcast", event: "signal", payload: obj });

  // ----------------------------
  // Setup DataChannel
  // ----------------------------
  const setupDataChannelHandlers = (dc: RTCDataChannel) => {
    dc.binaryType = "arraybuffer";

    dc.onopen = () => setStatus("Data channel open, ready to send files.");
    dc.onclose = () => setStatus("Data channel closed.");

    dc.onmessage = (evt) => {
      if (typeof evt.data === "string") {
        const meta = JSON.parse(evt.data) as FileMeta;
        if (!receivedFiles.find((f) => f.id === meta.id)) {
          incomingBuffer.current.meta = meta;
          incomingBuffer.current.chunks = [];
        } else {
          incomingBuffer.current.meta = undefined;
          incomingBuffer.current.chunks = [];
        }
      } else if (incomingBuffer.current.meta) {
        incomingBuffer.current.chunks.push(evt.data);
        const receivedSize = incomingBuffer.current.chunks.reduce(
          (acc, c) => acc + c.byteLength,
          0
        );
        if (receivedSize >= incomingBuffer.current.meta.size) {
          const blob = new Blob(incomingBuffer.current.chunks, {
            type: incomingBuffer.current.meta.mime,
          });
          setReceivedFiles((prev) => [...prev, { ...incomingBuffer.current.meta!, blob }]);
          setStatus(`Received ${incomingBuffer.current.meta.fileName}`);
          incomingBuffer.current.meta = undefined;
          incomingBuffer.current.chunks = [];
        }
      }
    };
  };

  // ----------------------------
  // Setup PeerConnection
  // ----------------------------
  const setupConnection = (isInitiator = false) => {
    if (pcRef.current) return;

    const pc = new RTCPeerConnection({ iceServers: [{ urls: "stun:stun.l.google.com:19302" }] });
    pcRef.current = pc;

    pc.onicecandidate = (e) => {
      if (e.candidate) sendSignal({ type: "candidate", from: peerId, data: e.candidate });
    };

    if (isInitiator) {
      const dc = pc.createDataChannel("file");
      dcRef.current = dc;
      setupDataChannelHandlers(dc);
    } else {
      pc.ondatachannel = (event) => {
        dcRef.current = event.channel;
        setupDataChannelHandlers(dcRef.current);
      };
    }
  };

  const handleSignal = async (msg: any) => {
    const { type, data } = msg;
    setupConnection(false);
    const pc = pcRef.current!;

    if (type === "offer") {
      await pc.setRemoteDescription(data);
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      sendSignal({ type: "answer", from: peerId, data: answer });
    }

    if (type === "answer" && pc.signalingState === "have-local-offer") {
      await pc.setRemoteDescription(data);
    }

    if (type === "candidate") {
      try {
        await pc.addIceCandidate(data);
      } catch (err) {
        console.warn("Failed to add ICE candidate:", err);
      }
    }
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

  // ----------------------------
  // File Icon
  // ----------------------------
  const getFileIcon = (name?: string) => {
    if (!name) return <PaperClipIcon className="w-6 h-6 text-gray-400" />;
    const ext = name.split(".").pop()?.toLowerCase();
    switch (ext) {
      case "jpg":
      case "jpeg":
      case "png":
      case "gif":
      case "webp":
        return <PhotoIcon className="w-6 h-6 text-blue-500" />;
      case "mp4":
      case "mov":
      case "avi":
      case "mkv":
        return <VideoCameraIcon className="w-6 h-6 text-purple-500" />;
      case "mp3":
      case "wav":
      case "flac":
        return <MusicalNoteIcon className="w-6 h-6 text-green-500" />;
      case "pdf":
        return <DocumentTextIcon className="w-6 h-6 text-red-500" />;
      case "doc":
      case "docx":
        return <DocumentIcon className="w-6 h-6 text-blue-700" />;
      case "xls":
      case "xlsx":
        return <DocumentIcon className="w-6 h-6 text-green-700" />;
      case "ppt":
      case "pptx":
        return <DocumentIcon className="w-6 h-6 text-orange-500" />;
      default:
        return <PaperClipIcon className="w-6 h-6 text-gray-400" />;
    }
  };

  // ----------------------------
  // Pre-send queue
  // ----------------------------
  const addFilesToQueue = (files: FileList) => {
    setPreSendFiles((prev) => [...prev, ...Array.from(files)]);
  };

  const removeFromQueue = (index: number) => {
    setPreSendFiles((prev) => prev.filter((_, i) => i !== index));
  };

  // ----------------------------
  // Send files queue (multiple support)
  // ----------------------------
  const sendFiles = () => {
    if (preSendFiles.length === 0) return;
    pendingFiles.current.push(...preSendFiles);
    setPreSendFiles([]);
    if (!isSending.current) sendNextFile();
  };

  const sendNextFile = () => {
    if (pendingFiles.current.length === 0) {
      isSending.current = false;
      return;
    }
    isSending.current = true;
    const file = pendingFiles.current.shift()!;
    sendFile(file).finally(() => sendNextFile());
  };

const sendFile = (file: File) => {
  return new Promise<void>((resolve) => {
    const dc = dcRef.current;
    if (!dc || dc.readyState !== "open") {
      alert("Connection not ready.");
      resolve();
      return;
    }

    const fileId = nanoid();
    let offset = 0;
    let sentBytes = 0;
    const CHUNK = 128 * 1024; // 128 KB for large files

    const sendingFile: SendingFile = {
      id: fileId,
      file,
      progress: 0,
      status: "queued",
      cancel: () => {
        cancelled = true;
        sendingFile.status = "cancelled";
        setSendingFiles((prev) => [...prev]);
        setStatus(`Cancelled ${file.name}`);
      },
    };
    setSendingFiles((prev) => [...prev, sendingFile]);

    let cancelled = false;

    // Send metadata first
    const meta: FileMeta = {
      id: fileId,
      fileName: file.name,
      mime: file.type,
      size: file.size,
    };
    dc.send(JSON.stringify(meta));

    const reader = new FileReader();

    const readSlice = () => {
      if (cancelled || offset >= file.size) return;

      const slice = file.slice(offset, offset + CHUNK);
      reader.readAsArrayBuffer(slice);
    };

    reader.onload = (e) => {
      if (!e.target?.result || cancelled) return;

      const chunk = e.target.result as ArrayBuffer;

      const trySend = () => {
        if (cancelled) return;

        if (dc.bufferedAmount + chunk.byteLength > MAX_BUFFERED_AMOUNT) {
          // Wait for buffered amount to decrease
          dc.onbufferedamountlow = () => {
            dc.onbufferedamountlow = null;
            trySend();
          };
        } else if (dc.readyState !== "open") {
          setTimeout(trySend, 100);
        } else {
          dc.send(chunk);
          sentBytes += chunk.byteLength;
          sendingFile.progress = Math.min(100, (sentBytes / file.size) * 100);
          sendingFile.status = "sending";
          setSendingFiles((prev) => [...prev]);

          offset += CHUNK;
          if (offset < file.size) readSlice();
          else {
            sendingFile.status = "completed";
            sendingFile.progress = 100;
            setSendingFiles((prev) => [...prev]);
            setStatus(`Finished sending ${file.name}`);
            resolve();
          }
        }
      };

      trySend();
    };

    readSlice();
    setStatus(`Sending ${file.name}...`);
  });
};


  // Add this function inside your RoomClient component
  const leaveRoom = async () => {
    try {
      const { error } = await supabaseClient
        .from("rooms")
        .update({ occupied: false })
        .eq("code", roomCode);

      if (error) throw error;
      router.push(`/join-room`);
      setStatus("You have left the room.");
      // Optionally, you can redirect the user back to a lobby or join page
      // router.push("/join-room");
    } catch (err) {
      console.error(err);
      setStatus("Failed to leave the room. Try again.");
    }
  };

  // Add this state near your other useState declarations
  const [connectedPeers, setConnectedPeers] = useState<string[]>([]);

  // Inside your Supabase channel broadcast handler, update peers:
  useEffect(() => {
    const channel = supabaseClient.channel(`room-${roomCode}`);
    channelRef.current = channel;

    channel.on("broadcast", { event: "signal" }, ({ payload }: any) => {
      if (!payload || payload.from === peerId) return;

      handleSignal(payload);

      // Add the sender to connected peers if not already there
      setConnectedPeers((prev) => {
        if (!prev.includes(payload.from)) return [...prev, payload.from];
        return prev;
      });
    });

    channel.subscribe((status: string) => {
      if (status === "SUBSCRIBED") setStatus("Connected to room.");
    });

    return () => {
      channel.unsubscribe();
    };
  }, [roomCode, peerId]);

  // ----------------------------
  // UI
  // ----------------------------
  return (
    <div className="w-full min-h-screen flex flex-col bg-gray-100 p-4 sm:p-6 overflow-y-auto">
      {/* Reminder Banner */}
      <div className="w-full max-w-4xl mx-auto bg-yellow-50 border-l-4 border-yellow-400 text-yellow-900 rounded-lg p-4 shadow-md mb-6 space-y-2 text-sm sm:text-base flex-shrink-0">
        <p className="font-medium">Please do not refresh the page while in the room; it may disrupt file transfers or connections.</p>
        <p className="font-medium">Always click "Leave Room" when finished to make the room available for others.</p>
        <p className="font-medium">Avoid opening multiple tabs with the same room to prevent connection conflicts.</p>
        <p className="font-medium">Ensure all file transfers are complete before leaving the room to prevent data loss.</p>
      </div>

      {/* Header & Controls */}
      <div className="w-full max-w-4xl mx-auto bg-white rounded-2xl shadow-lg p-4 sm:p-6 space-y-4 flex-shrink-0">
        <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center min-w-0">
          <div className="min-w-0">
            <h3 className="text-2xl sm:text-3xl font-semibold text-gray-800 truncate">Room: {roomCode}</h3>
            {/* Peer ID & Connected Peers */}
            <div className="min-w-0 mt-1">
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
          {status && (
            <div className="mt-2 sm:mt-0 p-2 sm:p-3 bg-yellow-50 border border-yellow-200 text-yellow-800 rounded-lg shadow-sm text-center text-sm sm:text-base">
              {status}
            </div>
          )}
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

      {/* File Sections */}
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
                  <button className="flex items-center gap-1 px-2 sm:px-3 py-1 bg-red-500 text-white rounded-lg hover:bg-red-600 transition text-xs sm:text-sm" onClick={() => removeFromQueue(idx)}>
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
            <h4 className="text-lg sm:text-xl font-semibold text-gray-700 mb-2">Sending Files</h4>
            <div className="space-y-2">
              {sendingFiles.map((f) => (
                <div key={f.id} className="flex flex-col sm:flex-row items-start sm:items-center justify-between p-2 sm:p-3 rounded-lg border bg-gray-50 min-w-0 overflow-hidden">
                  <div className="flex-1 w-full min-w-0 overflow-hidden">
                    <p className="font-medium text-gray-800 text-sm sm:text-base truncate">{f.file.name}</p>
                    <div className="h-2 bg-gray-200 rounded-full mt-1 overflow-hidden">
                      <div className="h-full bg-blue-500 transition-all" style={{ width: `${f.progress}%` }} />
                    </div>
                  </div>
                  <div className="ml-0 sm:ml-4 mt-1 sm:mt-0 text-sm sm:text-base text-gray-600 text-right min-w-0">
                    <p>{f.progress.toFixed(1)}%</p>
                    <p>{f.status}</p>
                  </div>
                  {f.status !== "completed" && f.status !== "cancelled" && (
                    <button onClick={f.cancel} className="mt-2 sm:mt-0 px-3 py-1 bg-red-500 text-white rounded-lg hover:bg-red-600 transition text-sm">
                      Cancel
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Received Files */}
        {receivedFiles.length > 0 && (
          <div className="bg-white rounded-2xl shadow-lg p-4 sm:p-6 flex flex-col min-h-[200px] max-h-[350px] overflow-y-auto">
            <h4 className="text-lg sm:text-xl font-semibold text-gray-700 mb-2">Received Files</h4>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
              {receivedFiles.map((file) => (
                <div key={file.id} className="flex flex-col sm:flex-row items-start sm:items-center justify-between p-2 sm:p-3 rounded-lg border bg-gray-50 hover:bg-gray-100 min-w-0 overflow-hidden">
                  <div className="flex items-center gap-2 sm:gap-3 mb-2 sm:mb-0 min-w-0 overflow-hidden">
                    {getFileIcon(file.fileName)}
                    <div className="flex flex-col overflow-hidden min-w-0">
                      <span className="text-gray-800 font-medium text-sm sm:text-base truncate">{file.fileName}</span>
                      <span className="text-gray-500 text-xs sm:text-sm truncate">{Math.round(file.size / 1024)} KB</span>
                    </div>
                  </div>
                  <button onClick={() => file.blob && saveAs(file.blob, file.fileName)} disabled={!file.blob} className="px-4 py-1 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition text-sm sm:text-base">
                    Download
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>

  );
}
