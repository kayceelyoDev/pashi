"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { supabaseClient } from "@/lib/supabaseClient";
import { nanoid } from "nanoid";
import { saveAs } from "file-saver";
import {
  ClipboardIcon,
  LinkIcon,
  PhotoIcon,
  VideoCameraIcon,
  MusicalNoteIcon,
  DocumentTextIcon,
  DocumentIcon,
  PaperClipIcon,
  ArrowDownTrayIcon,
  XMarkIcon,
  CheckCircleIcon,
  XCircleIcon,
  ClockIcon,
} from "@heroicons/react/24/outline";

const MAX_BUFFERED_AMOUNT = 16 * 1024 * 1024; 
const CHUNK_SIZE = 256 * 1024;

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
  const [receivingFile, setReceivingFile] = useState<{
    fileName: string;
    progress: number;
    size: number;
  } | null>(null);

  const fileRef = useRef<HTMLInputElement>(null);
  const channelRef = useRef<any>(null);
  const pcRef = useRef<RTCPeerConnection | null>(null);
  const dcRef = useRef<RTCDataChannel | null>(null);

  const incomingBuffer = useRef<{
    meta?: FileMeta;
    receivedBytes: number;
    streamParts: Blob[];
  }>({ receivedBytes: 0, streamParts: [] });

  const pendingFiles = useRef<File[]>([]);
  const isSending = useRef(false);

  useEffect(() => {
    const channel = supabaseClient.channel(`room-${roomCode}`);
    channelRef.current = channel;

    channel.on("broadcast", { event: "peer-joined" }, ({ payload }: any) => {
      if (!payload || payload.peerId === peerId) return;
      setConnectedPeers((prev) => (prev.includes(payload.peerId) ? prev : [...prev, payload.peerId]));
    });

    channel.on("broadcast", { event: "peer-left" }, ({ payload }: any) => {
      if (!payload) return;
      setConnectedPeers((prev) => prev.filter((p) => p !== payload.peerId));
    });

    channel.on("broadcast", { event: "signal" }, ({ payload }: any) => {
      if (!payload || payload.from === peerId) return;
      handleSignal(payload);
    });

    channel.on("broadcast", { event: "file-cancel" }, ({ payload }: any) => {
      if (!payload || payload.from === peerId) return;
      handleRemoteFileCancel(payload.fileId);
    });

    channel.subscribe((statusStr: string) => {
      if (statusStr === "SUBSCRIBED") {
        setStatus("Waiting for peer connection");
        channel.send({ type: "broadcast", event: "peer-joined", payload: { peerId } });
      }
    });

    return () => {
      channel.send({ type: "broadcast", event: "peer-left", payload: { peerId } });
      channel.unsubscribe();
    };
  }, [roomCode, peerId]);

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
    setStatus(`Transfer cancelled by peer`);
    sendNextFile();
  };

  const setupDataChannelHandlers = (dc: RTCDataChannel) => {
    dc.binaryType = "arraybuffer";

    dc.onopen = () => setStatus("Connected · Ready to transfer");
    dc.onclose = () => setStatus("Connection closed");
    dc.onerror = (err) => setStatus(`Connection error`);

    dc.onmessage = async (evt) => {
      try {
        if (typeof evt.data === "string") {
          const meta = JSON.parse(evt.data) as FileMeta;
          // Validate that we have all required fields
          if (!meta.id || !meta.fileName || !meta.size) {
            console.error("Invalid file metadata received:", meta);
            return;
          }
          incomingBuffer.current.meta = meta;
          incomingBuffer.current.receivedBytes = 0;
          incomingBuffer.current.streamParts = [];
          setStatus(`Receiving: ${meta.fileName}`);
          setReceivingFile({
            fileName: meta.fileName,
            progress: 0,
            size: meta.size
          });
        } else if (incomingBuffer.current.meta) {
          const chunk = evt.data as ArrayBuffer;
          incomingBuffer.current.streamParts.push(new Blob([chunk]));
          incomingBuffer.current.receivedBytes += chunk.byteLength;

          const progress = (incomingBuffer.current.receivedBytes / incomingBuffer.current.meta.size) * 100;
          setStatus(
            `Receiving: ${incomingBuffer.current.meta.fileName} (${progress.toFixed(0)}%)`
          );
          setReceivingFile({
            fileName: incomingBuffer.current.meta.fileName,
            progress: progress,
            size: incomingBuffer.current.meta.size
          });

          if (incomingBuffer.current.receivedBytes >= incomingBuffer.current.meta.size) {
            const blob = new Blob(incomingBuffer.current.streamParts, { 
              type: incomingBuffer.current.meta.mime || 'application/octet-stream'
            });
            
            // Create a complete file meta object with all fields validated
            const completeMeta: FileMeta = {
              id: incomingBuffer.current.meta.id,
              fileName: incomingBuffer.current.meta.fileName || 'unknown-file',
              size: incomingBuffer.current.meta.size,
              mime: incomingBuffer.current.meta.mime || 'application/octet-stream',
              blob: blob
            };
            
            setReceivedFiles((prev) => [...prev, completeMeta]);
            setStatus(`Received: ${completeMeta.fileName}`);
            setReceivingFile(null);
            
            // Reset buffer
            incomingBuffer.current.meta = undefined;
            incomingBuffer.current.receivedBytes = 0;
            incomingBuffer.current.streamParts = [];
          }
        }
      } catch (err) {
        console.error("Error receiving file:", err);
        setStatus("Error receiving file");
        setReceivingFile(null);
      }
    };
  };

  const setupConnection = (isInitiator = false) => {
    if (pcRef.current) return;

    const pc = new RTCPeerConnection({
      iceServers: [
        { urls: "stun:stun.relay.metered.ca:80" },
        { urls: "turn:standard.relay.metered.ca:80", username: "158b5b4008675d9b88b4ba97", credential: "plP3KoFPyI4pLx7e" },
        { urls: "turn:standard.relay.metered.ca:80?transport=tcp", username: "158b5b4008675d9b88b4ba97", credential: "plP3KoFPyI4pLx7e" },
        { urls: "turn:standard.relay.metered.ca:443", username: "158b5b4008675d9b88b4ba97", credential: "plP3KoFPyI4pLx7e" },
        { urls: "turns:standard.relay.metered.ca:443?transport=tcp", username: "158b5b4008675d9b88b4ba97", credential: "plP3KoFPyI4pLx7e" },
      ],
    });

    pcRef.current = pc;

    pc.onicecandidate = (e) => { if (e.candidate) sendSignal({ type: "candidate", from: peerId, data: e.candidate }); };
    pc.oniceconnectionstatechange = () => {
      if (pc.iceConnectionState === "connected") setStatus("Connected · Ready to transfer");
      else if (pc.iceConnectionState === "failed") setStatus("Connection failed");
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
    } catch { setStatus("Connection error"); }
  };

  const handleSignal = async (msg: any) => {
    const { type, data } = msg;
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
    } catch { setStatus("Connection error"); }
  };

  const addFilesToQueue = (files: FileList) => setPreSendFiles((prev) => [...prev, ...Array.from(files)]);
  const removeFromQueue = (index: number) => setPreSendFiles((prev) => prev.filter((_, i) => i !== index));

  const sendFiles = () => {
    if (!dcRef.current || dcRef.current.readyState !== "open") {
      setStatus("Connection not ready");
      return;
    }
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
          setStatus(`Cancelled: ${file.name}`);
          broadcastFileCancel(fileId);
          resolve();
        },
      };
      setSendingFiles((prev) => [...prev, sendingFile]);

      const meta: FileMeta = { 
        id: fileId, 
        fileName: file.name, 
        mime: file.type || 'application/octet-stream', 
        size: file.size 
      };
      
      try { 
        dc.send(JSON.stringify(meta)); 
      } catch { 
        sendingFile.status = "error"; 
        setStatus("Error sending metadata"); 
        resolve(); 
        return; 
      }

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
            else { sendingFile.status = "completed"; sendingFile.progress = 100; setSendingFiles((prev) => [...prev]); setStatus(`Sent: ${file.name}`); resolve(); }
          }
        };
        trySend();
      };

      readSlice();
      setStatus(`Sending: ${file.name}`);
    });
  };

  const leaveRoom = () => {
    channelRef.current?.send({ type: "broadcast", event: "peer-left", payload: { peerId } });
    router.push(`/join-room`);
  };

  const getFileIcon = (name?: string) => {
    if (!name) return <PaperClipIcon className="w-5 h-5 text-gray-500" />;
    const ext = name.split(".").pop()?.toLowerCase();
    switch (ext) {
      case "jpg": case "jpeg": case "png": case "gif": case "webp": case "svg": 
        return <PhotoIcon className="w-5 h-5 text-gray-900" />;
      case "mp4": case "mov": case "avi": case "mkv": case "webm": 
        return <VideoCameraIcon className="w-5 h-5 text-gray-900" />;
      case "mp3": case "wav": case "flac": case "aac": 
        return <MusicalNoteIcon className="w-5 h-5 text-gray-900" />;
      case "pdf": 
        return <DocumentTextIcon className="w-5 h-5 text-gray-900" />;
      case "doc": case "docx": case "xls": case "xlsx": case "ppt": case "pptx": 
        return <DocumentIcon className="w-5 h-5 text-gray-900" />;
      default: 
        return <PaperClipIcon className="w-5 h-5 text-gray-500" />;
    }
  };

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    if (bytes < 1024 * 1024 * 1024) return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
    return (bytes / (1024 * 1024 * 1024)).toFixed(1) + ' GB';
  };

  return (
    <div className="min-h-screen bg-white">
      {/* Header */}
      <div className="border-b border-gray-200">
        <div className="max-w-6xl mx-auto px-6 py-8">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-6">
            <div>
              <h1 className="text-3xl font-light text-black mb-2 tracking-tight">Room {roomCode}</h1>
              <p className="text-sm text-gray-500 font-mono">{peerId}</p>
            </div>
            <div className="flex flex-wrap gap-3">
              <button
                onClick={() => {
                  navigator.clipboard.writeText(roomCode);
                  setStatus("Code copied");
                }}
                className="flex items-center gap-2 px-5 py-2.5 border border-gray-300 hover:border-black hover:bg-gray-50 rounded-lg transition text-sm font-medium"
              >
                <ClipboardIcon className="w-4 h-4" />
                Copy Code
              </button>
              <button
                onClick={() => {
                  const url = `${window.location.origin}/join-room/${roomCode}`;
                  navigator.clipboard.writeText(url);
                  setStatus("Link copied");
                }}
                className="flex items-center gap-2 px-5 py-2.5 border border-gray-300 hover:border-black hover:bg-gray-50 rounded-lg transition text-sm font-medium"
              >
                <LinkIcon className="w-4 h-4" />
                Copy Link
              </button>
              <button
                onClick={leaveRoom}
                className="px-5 py-2.5 bg-black text-white hover:bg-gray-800 rounded-lg transition text-sm font-medium"
              >
                Leave Room
              </button>
            </div>
          </div>

          {/* Status & Connection Info */}
          <div className="mt-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pt-6 border-t border-gray-100">
            <div className="flex items-center gap-2">
              <div className={`w-2 h-2 rounded-full ${connectedPeers.length > 0 ? 'bg-black' : 'bg-gray-300'}`} />
              <span className="text-sm text-gray-600">{status}</span>
            </div>
            {connectedPeers.length > 0 && (
              <div className="flex items-center gap-3">
                <span className="text-xs text-gray-500 uppercase tracking-wider">Connected Peers</span>
                {connectedPeers.map((peer) => (
                  <span key={peer} className="px-3 py-1 bg-black text-white text-xs rounded-full font-mono">
                    {peer}
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="max-w-6xl mx-auto px-6 py-12">
        {/* Send Section */}
        <div className="mb-12">
          <h2 className="text-lg font-medium text-black mb-4">Send Files</h2>
          <div className="flex flex-col sm:flex-row gap-3">
            <label className="flex-1 cursor-pointer">
              <div className="flex items-center justify-center gap-3 px-6 py-8 border-2 border-dashed border-gray-300 rounded-lg hover:border-black hover:bg-gray-50 transition">
                <svg className="w-5 h-5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 4v16m8-8H4" />
                </svg>
                <span className="text-sm font-medium text-gray-700">Select Files</span>
              </div>
              <input
                ref={fileRef}
                type="file"
                multiple
                className="hidden"
                onChange={(e) => e.target.files && addFilesToQueue(e.target.files)}
              />
            </label>
            <button
              onClick={sendFiles}
              disabled={preSendFiles.length === 0}
              className="sm:w-32 px-6 py-8 bg-black text-white rounded-lg hover:bg-gray-800 transition font-medium text-sm disabled:opacity-30 disabled:cursor-not-allowed disabled:hover:bg-black"
            >
              Send {preSendFiles.length > 0 && `(${preSendFiles.length})`}
            </button>
          </div>
        </div>

        {/* Queue Section */}
        {preSendFiles.length > 0 && (
          <div className="mb-12">
            <h3 className="text-lg font-medium text-black mb-4">Queue · {preSendFiles.length}</h3>
            <div className="space-y-2">
              {preSendFiles.map((file, idx) => (
                <div key={idx} className="flex items-center justify-between p-4 border border-gray-200 rounded-lg hover:bg-gray-50 transition group">
                  <div className="flex items-center gap-4 min-w-0 flex-1">
                    {getFileIcon(file.name)}
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-black truncate">{file.name}</p>
                      <p className="text-xs text-gray-500 mt-0.5">{formatFileSize(file.size)}</p>
                    </div>
                  </div>
                  <button
                    onClick={() => removeFromQueue(idx)}
                    className="p-2 hover:bg-gray-200 rounded-lg transition opacity-0 group-hover:opacity-100"
                  >
                    <XMarkIcon className="w-4 h-4 text-gray-600" />
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Sending Section */}
        {sendingFiles.length > 0 && (
          <div className="mb-12">
            <h3 className="text-lg font-medium text-black mb-4">Sending</h3>
            <div className="space-y-3">
              {sendingFiles.map((f) => (
                <div key={f.id} className="p-4 border border-gray-200 rounded-lg">
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-3 min-w-0 flex-1">
                      {getFileIcon(f.file.name)}
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium text-black truncate">{f.file.name}</p>
                        <p className="text-xs text-gray-500 mt-0.5">{formatFileSize(f.file.size)}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      {f.status === "completed" && <CheckCircleIcon className="w-5 h-5 text-black" />}
                      {f.status === "cancelled" && <XCircleIcon className="w-5 h-5 text-gray-400" />}
                      {f.status === "error" && <XCircleIcon className="w-5 h-5 text-gray-600" />}
                      {f.status === "queued" && <ClockIcon className="w-5 h-5 text-gray-400" />}
                      {f.status === "sending" && (
                        <button
                          onClick={() => f.cancel?.()}
                          className="text-xs px-3 py-1 border border-gray-300 hover:border-black hover:bg-gray-50 rounded transition"
                        >
                          Cancel
                        </button>
                      )}
                    </div>
                  </div>
                  {(f.status === "sending" || f.status === "queued") && (
                    <div className="flex items-center gap-3">
                      <div className="flex-1 bg-gray-200 rounded-full h-1.5 overflow-hidden">
                        <div
                          className="bg-black h-full transition-all duration-300"
                          style={{ width: `${f.progress}%` }}
                        />
                      </div>
                      <span className="text-xs font-medium text-gray-700 min-w-[3rem] text-right">
                        {Math.round(f.progress)}%
                      </span>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Receiving Section */}
        {receivingFile && (
          <div className="mb-12">
            <h3 className="text-lg font-medium text-black mb-4">Receiving</h3>
            <div className="p-4 border border-gray-200 rounded-lg">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-3 min-w-0 flex-1">
                  {getFileIcon(receivingFile.fileName)}
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-black truncate">{receivingFile.fileName}</p>
                    <p className="text-xs text-gray-500 mt-0.5">{formatFileSize(receivingFile.size)}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-5 h-5 border-2 border-black border-t-transparent rounded-full animate-spin" />
                </div>
              </div>
              <div className="flex items-center gap-3">
                <div className="flex-1 bg-gray-200 rounded-full h-1.5 overflow-hidden">
                  <div
                    className="bg-black h-full transition-all duration-300"
                    style={{ width: `${receivingFile.progress}%` }}
                  />
                </div>
                <span className="text-xs font-medium text-gray-700 min-w-[3rem] text-right">
                  {Math.round(receivingFile.progress)}%
                </span>
              </div>
            </div>
          </div>
        )}

        {/* Received Section */}
        {receivedFiles.length > 0 && (
          <div className="mb-12">
            <h3 className="text-lg font-medium text-black mb-4">Received · {receivedFiles.length}</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {receivedFiles.map((f) => (
                <div key={f.id} className="flex items-center justify-between p-4 border border-gray-200 rounded-lg hover:bg-gray-50 transition group">
                  <div className="flex items-center gap-3 min-w-0 flex-1">
                    {getFileIcon(f.fileName)}
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-black truncate">{f.fileName}</p>
                      <p className="text-xs text-gray-500 mt-0.5">{formatFileSize(f.size)}</p>
                    </div>
                  </div>
                  {f.blob && (
                    <button
                      onClick={() => saveAs(f.blob!, f.fileName)}
                      className="p-2 bg-black text-white rounded-lg hover:bg-gray-800 transition"
                      title="Download"
                    >
                      <ArrowDownTrayIcon className="w-4 h-4" />
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Empty State */}
        {preSendFiles.length === 0 && sendingFiles.length === 0 && receivedFiles.length === 0 && (
          <div className="text-center py-20">
            <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-6">
              <svg className="w-8 h-8 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
              </svg>
            </div>
            <h3 className="text-lg font-medium text-black mb-2">No transfers yet</h3>
            <p className="text-gray-500 text-sm max-w-sm mx-auto">
              Select files to begin transferring. Your files will appear here once sent or received.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}