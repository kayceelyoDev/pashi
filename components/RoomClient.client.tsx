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
  HomeIcon,
  ComputerDesktopIcon,
  SignalIcon,
  CodeBracketIcon,
  CloudArrowUpIcon,
  TrashIcon,
  BoltIcon,
} from "@heroicons/react/24/outline";

// Optimized for speed/stability balance
const MAX_BUFFERED_AMOUNT = 16 * 1024 * 1024; 
const CHUNK_SIZE = 256 * 1024;

type FileMeta = {
  id: string;
  fileName: string;
  size: number;
  mime: string;
  blob?: Blob;
  previewUrl?: string;
};

type SendingFile = {
  id: string;
  file: File;
  progress: number;
  status: "queued" | "sending" | "completed" | "cancelled" | "error";
  cancel?: () => void;
  previewUrl?: string;
};

export default function RoomClient({ roomCode }: { roomCode: string }) {
  const router = useRouter();
  // Persistent Peer ID
  // Persistent Peer ID with hydration fix
  const [peerId, setPeerId] = useState<string>("");

  useEffect(() => {
      const key = `pasahi_peer_${roomCode}`;
      const stored = localStorage.getItem(key);
      if (stored) {
          setPeerId(stored);
      } else {
          const newId = nanoid(8);
          localStorage.setItem(key, newId);
          setPeerId(newId);
      }
  }, [roomCode]);

  const [status, setStatus] = useState("Connecting...");
  const [receivedFiles, setReceivedFiles] = useState<FileMeta[]>([]);
  const [sendingFiles, setSendingFiles] = useState<SendingFile[]>([]);
  const [preSendFiles, setPreSendFiles] = useState<(File & { previewUrl?: string })[]>([]);
  const [connectedPeers, setConnectedPeers] = useState<string[]>([]);
  const [receivingFile, setReceivingFile] = useState<{
    fileName: string;
    progress: number;
    size: number;
  } | null>(null);

  const [selectedFileIds, setSelectedFileIds] = useState<Set<string>>(new Set());
  const [isSelectionMode, setIsSelectionMode] = useState(false);

  const toggleSelection = (id: string) => {
    setSelectedFileIds(prev => {
        const next = new Set(prev);
        if (next.has(id)) next.delete(id);
        else next.add(id);
        return next;
    });
  };

  const handleDownloadSelected = () => {
      receivedFiles.filter(f => selectedFileIds.has(f.id)).forEach(f => {
          if (f.blob) saveAs(f.blob, f.fileName);
      });
      setSelectedFileIds(new Set());
      setIsSelectionMode(false);
  };

  const handleRemoveSelected = () => {
      if(!confirm(`Remove ${selectedFileIds.size} files from history?`)) return;
      setReceivedFiles(prev => prev.filter(f => !selectedFileIds.has(f.id)));
      setSelectedFileIds(new Set());
      setIsSelectionMode(false);
  };

  const fileRef = useRef<HTMLInputElement>(null);
  const channelRef = useRef<any>(null);
  const pcRef = useRef<RTCPeerConnection | null>(null);
  const dcRef = useRef<RTCDataChannel | null>(null);

  const incomingBuffer = useRef<{
    meta?: FileMeta;
    receivedBytes: number;
    streamParts: ArrayBuffer[];
    lastUpdate?: number;
  }>({ receivedBytes: 0, streamParts: [] });

  const pendingFiles = useRef<{ file: File; id: string }[]>([]);
  const isSending = useRef(false);

  // Cleanup object URLs to avoid memory leaks
  useEffect(() => {
    return () => {
      preSendFiles.forEach(f => f.previewUrl && URL.revokeObjectURL(f.previewUrl));
      sendingFiles.forEach(f => f.previewUrl && URL.revokeObjectURL(f.previewUrl));
      receivedFiles.forEach(f => f.previewUrl && URL.revokeObjectURL(f.previewUrl));
    };
  }, []);

  useEffect(() => {
    const channel = supabaseClient.channel(`room-${roomCode}`);
    channelRef.current = channel;

    channel.on("broadcast", { event: "peer-joined" }, ({ payload }: any) => {
      if (!payload || payload.peerId === peerId) return;
      
      setConnectedPeers((prev) => {
        // If we already know this peer, they might have reloaded.
        if (prev.includes(payload.peerId)) {
            // Force reset connection if they are re-joining
            if (pcRef.current) {
                console.log("Existing peer re-joined, resetting connection...");
                pcRef.current.close();
                pcRef.current = null;
                setStatus("Peer reloaded. Reconnecting...");
            }
            // Announce presence so they know to connect to us
            channel.send({ type: "broadcast", event: "peer-presence", payload: { peerId } });
            return prev;
        }
        
        // If it's a new peer, announce our presence
        channel.send({ type: "broadcast", event: "peer-presence", payload: { peerId } });
        return [...prev, payload.peerId];
      });
    });
    
    // New event to handle presence replies
    channel.on("broadcast", { event: "peer-presence" }, ({ payload }: any) => {
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
        setStatus("Waiting for peer connection...");
        channel.send({ type: "broadcast", event: "peer-joined", payload: { peerId } });
      }
    });

    return () => {
      channel.send({ type: "broadcast", event: "peer-left", payload: { peerId } });
      channel.unsubscribe();
    };
  }, [roomCode, peerId]);
  
  // Reconnect function
  const handleReconnect = () => {
      setStatus("Reconnecting...");
      
      // Close existing connections
      if (pcRef.current) {
          pcRef.current.close();
          pcRef.current = null;
      }
      if (dcRef.current) {
          dcRef.current.close();
          dcRef.current = null;
      }
      
      // Re-announce presence to force handshake
      channelRef.current?.send({ type: "broadcast", event: "peer-joined", payload: { peerId } });
      
      // If we know of peers, try initiating again
      if (connectedPeers.length > 0) {
          setupConnection(true);
      }
  };

  useEffect(() => {
    if (connectedPeers.length >= 1 && !pcRef.current) {
      // Just wait a bit for stable connection
      setTimeout(() => setupConnection(true), 1000);
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
      (f) => f.file.name !== sendingFiles.find((sf) => sf.id === fileId)?.file.name
    );
    setStatus(`Transfer cancelled by peer`);
    processQueue();
  };

  const setupDataChannelHandlers = (dc: RTCDataChannel) => {
    dc.binaryType = "arraybuffer";

    dc.onopen = () => setStatus("Connected · Ready to transfer");
    dc.onclose = () => setStatus("Connection closed");
    dc.onerror = (err) => setStatus(`Connection error`);

    dc.onmessage = async (evt) => {
      try {
        if (typeof evt.data === "string") {
          if (evt.data.startsWith("CANCEL:")) {
             const fileId = evt.data.split(":")[1];
             handleRemoteFileCancel(fileId);
             return;
          }
          const meta = JSON.parse(evt.data) as FileMeta;
          // Validate that we have all required fields
          if (!meta.id || !meta.fileName || !meta.size) {
            console.error("Invalid file metadata received:", meta);
            return;
          }
          incomingBuffer.current.meta = meta;
          incomingBuffer.current.receivedBytes = 0;
          incomingBuffer.current.streamParts = [];
          incomingBuffer.current.lastUpdate = Date.now();
          
          setStatus(`Receiving: ${meta.fileName}`);
          setReceivingFile({
            fileName: meta.fileName,
            progress: 0,
            size: meta.size
          });
        } else if (incomingBuffer.current.meta) {
          const chunk = evt.data as ArrayBuffer;
          incomingBuffer.current.streamParts.push(chunk); // Store raw buffer, not Blob yet
          incomingBuffer.current.receivedBytes += chunk.byteLength;

          // Throttled UI Update (every 200ms)
          const now = Date.now();
          const isComplete = incomingBuffer.current.receivedBytes >= incomingBuffer.current.meta.size;
          
          if (isComplete || now - (incomingBuffer.current.lastUpdate || 0) > 200) {
              const progress = (incomingBuffer.current.receivedBytes / incomingBuffer.current.meta.size) * 100;
              setStatus(
                `Receiving: ${incomingBuffer.current.meta.fileName} (${progress.toFixed(0)}%)`
              );
              setReceivingFile({
                fileName: incomingBuffer.current.meta.fileName,
                progress: progress,
                size: incomingBuffer.current.meta.size
              });
              incomingBuffer.current.lastUpdate = now;
          }

          if (isComplete) {
            const blob = new Blob(incomingBuffer.current.streamParts, { 
              type: incomingBuffer.current.meta.mime || 'application/octet-stream'
            });
            
            // Create preview URL for received file if it's an image/video
            let previewUrl;
            if (incomingBuffer.current.meta.mime.startsWith('image/') || incomingBuffer.current.meta.mime.startsWith('video/')) {
               previewUrl = URL.createObjectURL(blob);
            }

            const completeMeta: FileMeta = {
              id: incomingBuffer.current.meta.id,
              fileName: incomingBuffer.current.meta.fileName || 'unknown-file',
              size: incomingBuffer.current.meta.size,
              mime: incomingBuffer.current.meta.mime || 'application/octet-stream',
              blob: blob,
              previewUrl
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
    if (pcRef.current) {
        // If connection is already stable, don't recreate
        if(pcRef.current.signalingState === 'stable' && pcRef.current.iceConnectionState === 'connected') return;
        
        // If not stable, close and retry
        pcRef.current.close();
        pcRef.current = null;
    }

    console.log("Setting up connection, Initiator:", isInitiator);

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
      console.log("ICE State Change:", pc.iceConnectionState);
      if (pc.iceConnectionState === "connected") setStatus("Connected · Ready to transfer");
      else if (pc.iceConnectionState === "failed") setStatus("Connection failed");
      else if (pc.iceConnectionState === "disconnected") setStatus("Disconnected");
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

    // Ensure PC exists
    if (!pcRef.current) {
        setupConnection(false);
    }
    const pc = pcRef.current!;

    try {
      if (type === "offer") {
        // Glare handling: If we are not stable, we need to rollback to accept the new offer
        // This effectively makes us a "polite" peer for collisions
        if (pc.signalingState !== "stable") {
             console.log("Signaling collision detected. Rolling back local offer to accept remote.");
             await Promise.all([
                 pc.setLocalDescription({type: "rollback"}),
                 pc.setRemoteDescription(data)
             ]);
        } else {
             await pc.setRemoteDescription(data);
        }
        
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        sendSignal({ type: "answer", from: peerId, data: answer });
      } else if (type === "answer") {
        // Only accept answer if we are waiting for it
        if (pc.signalingState === "have-local-offer" || pc.signalingState === "have-local-pranswer") {
            await pc.setRemoteDescription(data);
        } else {
            console.warn("Ignored remote answer in state:", pc.signalingState);
        }
      } else if (type === "candidate") {
        try {
           if(pc.remoteDescription) {
               await pc.addIceCandidate(data);
           } else {
               // Logic to queue candidates could go here, but for now ignoring is safer than crashing
           }
        } catch (candidateErr) {
            console.error("Error adding ice candidate:", candidateErr);
        }
      }
    } catch (e) { 
        console.error("Signaling error:", e);
    }
  };

  const addFilesToQueue = (fileList: FileList) => {
    const newFiles = Array.from(fileList).map(file => {
        let previewUrl;
        if (file.type.startsWith('image/') || file.type.startsWith('video/')) {
            previewUrl = URL.createObjectURL(file);
        }
        return Object.assign(file, { previewUrl });
    });
    setPreSendFiles((prev) => [...prev, ...newFiles]);
  };
  
  const removeFromQueue = (index: number) => {
      const fileToRemove = preSendFiles[index];
      if (fileToRemove.previewUrl) URL.revokeObjectURL(fileToRemove.previewUrl);
      setPreSendFiles((prev) => prev.filter((_, i) => i !== index));
  };

  const sendFiles = () => {
    if (!dcRef.current || dcRef.current.readyState !== "open") {
      setStatus("Connection not ready. Try reconnecting.");
      return;
    }

    // 1. Move all Pre-Send files to Sending state (Queued)
    const filesToQueue = [...preSendFiles];
    setPreSendFiles([]); // Clear pre-send queue

    const newSendingFiles: SendingFile[] = filesToQueue.map(file => ({
        id: nanoid(),
        file: file,
        progress: 0,
        status: "queued",
        previewUrl: file.previewUrl,
        cancel: () => { /* defined later, but we need ID first */ }
    }));

    // Update UI immediately to show them as queued
    setSendingFiles(prev => {
        const updated = [...prev, ...newSendingFiles];
        // Re-attach cancel handlers that need granular access if needed, 
        // or we handle cancellation by checking current status in the loop.
        return updated;
    });

    // 2. Add to processing queue
    // We map generic file objects to the specific IDs we just created to track them
    const queueItems = newSendingFiles.map(sf => ({ file: sf.file, id: sf.id }));
    pendingFiles.current.push(...queueItems);

    // 3. Trigger processor if idle
    if (!isSending.current) processQueue();
  };

  const processQueue = async () => {
    if (pendingFiles.current.length === 0) { 
        isSending.current = false; 
        return; 
    }
    isSending.current = true;
    const item = pendingFiles.current.shift()!;
    
    // Check if this file was cancelled while in queue
    // We can check this by looking up the latest state, but simplified: 
    // The sendFile logic will handle "cancelled" check.
    
    try {
        await sendFile(item.file, item.id);
    } catch (err) {
        console.error("Error sending file:", err);
    }
    
    // Recursive process next
    processQueue();
  };

  const sendFile = (file: File, fileId: string) => {
    return new Promise<void>((resolve) => {
      const dc = dcRef.current!;
      let offset = 0;
      let sentBytes = 0;
      let cancelled = false;

      // Update status to "sending"
      setSendingFiles(prev => prev.map(sf => 
          sf.id === fileId ? { ...sf, status: "sending", cancel: () => { cancelled = true; } } : sf
      ));

      // 1. Send Metadata
      const meta: FileMeta = { 
        id: fileId, 
        fileName: file.name, 
        mime: file.type || 'application/octet-stream', 
        size: file.size 
      };
      
      try { 
        dc.send(JSON.stringify(meta)); 
      } catch (err) {
        console.error("Meta send error", err);
        setSendingFiles(prev => prev.map(sf => sf.id === fileId ? { ...sf, status: "error" } : sf));
        resolve(); 
        return; 
      }

      const reader = new FileReader();
      const readSlice = () => { 
          if (cancelled) {
              // Notify receiver of cancellation
              try { dc.send("CANCEL:" + fileId); } catch {}
              setSendingFiles(prev => prev.map(sf => sf.id === fileId ? { ...sf, status: "cancelled" } : sf));
              resolve();
              return;
          }
          if (offset >= file.size) return; 
          reader.readAsArrayBuffer(file.slice(offset, offset + CHUNK_SIZE)); 
      };

      reader.onload = (e) => {
        if (!e.target?.result || cancelled) return;
        const chunk = e.target.result as ArrayBuffer;

        const trySend = () => {
          if (cancelled) return;
          
          // Strict backpressure check
          if (dc.bufferedAmount > MAX_BUFFERED_AMOUNT) {
            // Wait for buffer to drain
            dc.onbufferedamountlow = () => { 
                dc.onbufferedamountlow = null; 
                trySend(); 
            };
            return;
          } 
          
          if (dc.readyState !== "open") {
             setSendingFiles(prev => prev.map(sf => sf.id === fileId ? { ...sf, status: "error" } : sf));
             resolve();
             return;
          }

          try { 
              dc.send(chunk); 
          } catch (err: any) {
              // Handle "Queue is full" specifically
              if (err.name === 'OperationError' || err.message?.includes('queue is full')) {
                  // Wait a bit and retry
                  setTimeout(trySend, 50);
                  return;
              }
              console.error("Send error:", err);
              setSendingFiles(prev => prev.map(sf => sf.id === fileId ? { ...sf, status: "error" } : sf));
              resolve(); 
              return; 
          }
          
          sentBytes += chunk.byteLength;
          offset += CHUNK_SIZE;

          // Update Progress
          setSendingFiles(prev => prev.map(sf => 
              sf.id === fileId ? { ...sf, progress: Math.min(100, (sentBytes / file.size) * 100) } : sf
          ));
          
          if (offset < file.size) {
               // Use setImmediate-like behavior or microtask to avoid stack overflow but keep speed
               // Promise.resolve().then(readSlice); 
               // Or just direct call if we trust the loop break from IO
               readSlice(); 
          } else { 
              setSendingFiles(prev => prev.map(sf => sf.id === fileId ? { ...sf, status: "completed", progress: 100 } : sf));
              setStatus(`Sent: ${file.name}`); 
              resolve(); 
          }
        };
        trySend();
      };

      readSlice();
    });
  };

  const leaveRoom = () => {
    channelRef.current?.send({ type: "broadcast", event: "peer-left", payload: { peerId } });
    router.push(`/create-room`); // Fixed redirect
  };
  
  const getFileIcon = (mime: string, name: string) => {
    if (mime.startsWith('image/')) return <PhotoIcon className="w-6 h-6 text-purple-600" />;
    if (mime.startsWith('video/')) return <VideoCameraIcon className="w-6 h-6 text-red-600" />;
    if (mime.startsWith('audio/')) return <MusicalNoteIcon className="w-6 h-6 text-yellow-600" />;
    if (mime.includes('pdf') || name.endsWith('.pdf')) return <DocumentTextIcon className="w-6 h-6 text-red-500" />;
    if (mime.includes('code') || 
        ['js', 'jsx', 'ts', 'tsx', 'html', 'css', 'json', 'py'].some(ext => name.endsWith('.' + ext))) 
        return <CodeBracketIcon className="w-6 h-6 text-blue-600" />;
    return <DocumentIcon className="w-6 h-6 text-gray-500" />;
  };

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    if (bytes < 1024 * 1024 * 1024) return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
    return (bytes / (1024 * 1024 * 1024)).toFixed(1) + ' GB';
  };
  
  const copyToClipboard = async (text: string, successMessage: string) => {
    // ... existing implementation ...
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(text);
        setStatus(successMessage);
      } else {
        // Fallback for non-secure contexts (like HTTP LAN)
        const textArea = document.createElement("textarea");
        textArea.value = text;
        textArea.style.position = "fixed"; 
        textArea.style.left = "-9999px";
        document.body.appendChild(textArea);
        textArea.focus();
        textArea.select();
        try {
          document.execCommand('copy');
          setStatus(successMessage);
        } catch (err) {
          console.error('Fallback copy failed', err);
          setStatus("Failed to copy");
        }
        document.body.removeChild(textArea);
      }
    } catch (err) {
      console.error('Copy failed', err);
      setStatus("Failed to copy");
    }
  };

  // Prevent rendering until peerId is available to avoid hydration mismatch
  if (!peerId) return <div className="min-h-screen flex items-center justify-center bg-gray-50"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div></div>;

  return (
    <div className="min-h-screen bg-gray-50 font-sans">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 sticky top-0 z-10 shadow-sm">
        <div className="max-w-6xl mx-auto px-4 py-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
               <button onClick={() => router.push('/')} className="p-2 hover:bg-gray-100 rounded-full transition-colors duration-200">
                  <HomeIcon className="w-5 h-5 text-gray-600" />
               </button>
               <div>
                  <h1 className="text-xl font-bold text-gray-900 tracking-tight">Room: {roomCode}</h1>
                  <p className="text-xs text-blue-600 flex items-center gap-1.5 font-medium">
                    <span className="relative flex h-2 w-2">
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75"></span>
                        <span className="relative inline-flex rounded-full h-2 w-2 bg-blue-500"></span>
                    </span>
                    Same Network (P2P)
                    <span className="text-gray-400">•</span>
                    <span className="text-gray-500">ID: {peerId}</span>
                  </p>
               </div>
            </div>
            
            <div className="flex items-center gap-2">
                 <div className="flex -space-x-2 mr-2">
                    {connectedPeers.map((peer, i) => (
                        <div key={peer} className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center text-xs text-white font-medium ring-2 ring-white" title={`Peer: ${peer}`}>
                            {peer.substring(0, 2).toUpperCase()}
                        </div>
                    ))}
                    {connectedPeers.length === 0 && (
                        <div className="px-3 py-1 bg-yellow-100 text-yellow-700 text-xs rounded-full font-medium flex items-center gap-1 animate-pulse">
                            <SignalIcon className="w-3 h-3" /> Waiting for peers...
                        </div>
                    )}
                 </div>

              <button
                onClick={() => copyToClipboard(roomCode, "Code copied")}
                className="p-2.5 bg-gray-50 text-gray-600 hover:text-black hover:bg-gray-100 rounded-xl transition-all duration-200"
                title="Copy Code"
              >
                <ClipboardIcon className="w-5 h-5" />
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="max-w-6xl mx-auto px-4 py-12 sm:px-6 lg:px-8">
         
         {/* Peer Status Banner - Ready (Green) */}
         {connectedPeers.length > 0 && status.includes("Ready") && (
             <div className="mb-8 bg-green-50 border border-green-100 rounded-xl p-4 flex items-center justify-between gap-3 shadow-sm">
                 <div className="flex items-center gap-3">
                    <CheckCircleIcon className="w-5 h-5 text-green-600" />
                    <span className="font-medium text-green-800">Direct P2P Connection Established</span>
                 </div>
                 {/* Manual override always available when connected */}
                 <button 
                    onClick={handleReconnect}
                    className="text-xs font-medium bg-white text-gray-600 px-3 py-1.5 rounded-lg border border-gray-200 hover:text-black hover:border-gray-400 transition"
                 >
                    Reconnect
                 </button>
             </div>
         )}

         {/* Status / Error Banner (Dynamic) */}
         {(!status.includes("Ready") && !status.includes("Connecting") && !status.includes("Waiting")) && (
             <div className={`mb-8 border rounded-xl p-4 flex items-center justify-between gap-3 shadow-sm ${
                 (status.toLowerCase().includes("error") || status.toLowerCase().includes("fail") || status.toLowerCase().includes("close") || status.toLowerCase().includes("disconnect") || status.toLowerCase().includes("not ready")) 
                    ? "bg-red-50 border-red-100 text-red-800"
                    : (status.toLowerCase().includes("sent") || status.toLowerCase().includes("received") || status.toLowerCase().includes("sending") || status.toLowerCase().includes("receiving")) 
                        ? "bg-blue-50 border-blue-100 text-blue-800"
                        : "bg-amber-50 border-amber-100 text-amber-800"
             }`}>
                 <div className="flex items-center gap-3">
                    {(status.toLowerCase().includes("error") || status.toLowerCase().includes("fail") || status.toLowerCase().includes("close") || status.toLowerCase().includes("disconnect")) 
                        ? <XCircleIcon className="w-5 h-5"/> 
                        : (status.toLowerCase().includes("sent") || status.toLowerCase().includes("received")) 
                            ? <CheckCircleIcon className="w-5 h-5"/> 
                            : <SignalIcon className="w-5 h-5"/>}
                    <span className="font-medium">{status}</span>
                 </div>
                 
                 {(status.toLowerCase().includes("error") || status.toLowerCase().includes("fail") || status.toLowerCase().includes("close") || status.toLowerCase().includes("disconnect") || status.toLowerCase().includes("not ready")) && (
                     <button 
                        onClick={handleReconnect}
                        className="text-xs font-medium bg-white text-gray-600 px-3 py-1.5 rounded-lg border border-gray-200 hover:text-black hover:border-gray-400 transition"
                     >
                        Reconnect
                     </button>
                 )}
             </div>
         )}
         
        {/* Send Section */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-8 mb-10 text-center transition-all duration-300 hover:shadow-md">
            <input
                ref={fileRef}
                type="file"
                multiple
                className="hidden"
                onChange={(e) => e.target.files && addFilesToQueue(e.target.files)}
            />
             <div className="flex flex-col items-center justify-center gap-5">
                 <div className="w-20 h-20 bg-blue-50 text-blue-600 rounded-3xl flex items-center justify-center mb-2">
                    <CloudArrowUpIcon className="w-10 h-10" />
                 </div>
                 <div>
                    <h2 className="text-2xl font-semibold text-gray-900 mb-2">Send Files</h2>
                    <p className="text-sm text-gray-500 max-w-md mx-auto leading-relaxed">
                       Transferred directly between devices on the same network.
                       <br/>
                       <span className="text-xs text-gray-400">No size limits • End-to-End Encrypted</span>
                    </p>
                 </div>
                 
                 <div className="flex gap-3 mt-4">
                    <button
                        onClick={() => fileRef.current?.click()}
                        className="bg-black text-white px-8 py-3.5 rounded-xl font-medium hover:bg-gray-800 active:scale-95 transition-all duration-200 shadow-lg shadow-black/10 flex items-center gap-2"
                    >
                        <ComputerDesktopIcon className="w-5 h-5" />
                        Select Files
                    </button>
                    {preSendFiles.length > 0 && (
                        <button
                            onClick={sendFiles}
                            className="bg-blue-600 text-white px-8 py-3.5 rounded-xl font-medium hover:bg-blue-700 active:scale-95 transition-all duration-200 shadow-lg shadow-blue-600/20 flex items-center gap-2"
                        >
                            <BoltIcon className="w-5 h-5" />
                            Send ({preSendFiles.length})
                        </button>
                     )}
                 </div>
             </div>
        </div>

        {/* Queue Section */}
        {preSendFiles.length > 0 && (
          <div className="mb-12">
            <h3 className="text-xs font-bold text-gray-400 mb-6 uppercase tracking-widest px-1">Queue ({preSendFiles.length})</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {preSendFiles.map((file, idx) => (
                <div key={idx} className="bg-white p-4 rounded-2xl border border-gray-200 shadow-sm hover:shadow-md transition-all duration-200 group relative flex flex-col">
                  {/* Preview */}
                  <div className="mb-4 rounded-xl overflow-hidden bg-gray-50 border border-gray-100 relative h-32 flex items-center justify-center">
                       {file.previewUrl ? (
                           file.type.startsWith('image/') ? 
                               <img src={file.previewUrl} className="w-full h-full object-cover" /> :
                               <video src={file.previewUrl} className="w-full h-full object-cover" />
                       ) : (
                           <div className="transform scale-150 opacity-50">{getFileIcon(file.type, file.name)}</div>
                       )}
                  </div>
                  
                  <div className="flex items-start justify-between gap-3 mb-2">
                      <div className="min-w-0">
                        <p className="font-semibold text-gray-900 truncate text-sm mb-1">{file.name}</p>
                         <p className="text-xs text-gray-500">{formatFileSize(file.size)}</p>
                      </div>
                  </div>
                  
                  <button
                    onClick={() => removeFromQueue(idx)}
                    className="mt-auto w-full py-2 flex items-center justify-center gap-2 text-red-600 hover:bg-red-50 rounded-lg transition text-sm font-medium"
                  >
                    <TrashIcon className="w-4 h-4" /> Remove
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Sending Section */}
        {sendingFiles.length > 0 && (
          <div className="mb-12">
            <h3 className="text-xs font-bold text-gray-400 mb-6 uppercase tracking-widest px-1">Sending ({sendingFiles.length})</h3>
            <div className="space-y-4">
              {sendingFiles.map((f) => (
                <div key={f.id} className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm flex items-center gap-4">
                   <div className="w-12 h-12 bg-gray-50 rounded-lg overflow-hidden flex-shrink-0 flex items-center justify-center border border-gray-100">
                        {f.previewUrl ? (
                            f.file.type.startsWith('image/') ? 
                                <img src={f.previewUrl} className="w-full h-full object-cover" /> :
                                <video src={f.previewUrl} className="w-full h-full object-cover" />
                        ) : getFileIcon(f.file.type, f.file.name)}
                   </div>
                   
                   <div className="flex-1 min-w-0">
                       <div className="flex justify-between items-center mb-2">
                           <p className="font-medium text-gray-900 truncate text-sm">{f.file.name}</p>
                           <span className="text-xs font-medium text-gray-500">{Math.round(f.progress)}%</span>
                       </div>
                       <div className="w-full bg-gray-100 rounded-full h-1.5 overflow-hidden">
                           <div 
                               className={`h-full transition-all duration-300 ${f.status === 'error' ? 'bg-red-500' : 'bg-blue-600'}`}
                               style={{ width: `${f.progress}%` }}
                           ></div>
                       </div>
                       <div className="flex justify-between mt-1">
                           <span className="text-xs text-gray-400">{f.status}</span>
                           {f.status === 'sending' && (
                               <button onClick={f.cancel} className="text-xs text-red-500 hover:text-red-700 font-medium">Cancel</button>
                           )}
                       </div>
                   </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Receiving Section */}
        {/* Receiving & Received Section (Unified with Toolbar) */}
        {(receivingFile || receivedFiles.length > 0) && (
          <div className="mb-12">
            <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-3">
                    <h3 className="text-lg font-medium text-black">
                        Received History ({receivedFiles.length + (receivingFile ? 1 : 0)})
                    </h3>
                    {isSelectionMode && (
                        <span className="text-xs font-medium text-blue-600 bg-blue-50 px-2 py-1 rounded-md">
                            {selectedFileIds.size} Selected
                        </span>
                    )}
                </div>
                
                <div className="flex items-center gap-2">
                    {!isSelectionMode ? (
                        <>
                             {receivedFiles.length > 0 && (
                                <>
                                 <button
                                    onClick={() => setIsSelectionMode(true)}
                                    className="text-sm font-medium text-gray-600 hover:text-black bg-gray-50 hover:bg-gray-100 px-4 py-2 rounded-lg transition-colors"
                                >
                                    Select
                                </button>
                                <button
                                    onClick={() => {
                                        receivedFiles.forEach(f => {
                                            if (f.blob) saveAs(f.blob, f.fileName);
                                        });
                                    }}
                                    className="text-sm font-medium text-blue-600 hover:text-blue-800 bg-blue-50 hover:bg-blue-100 px-4 py-2 rounded-lg transition-colors flex items-center gap-2"
                                >
                                    <ArrowDownTrayIcon className="w-4 h-4" />
                                    Download All
                                </button>
                                </>
                             )}
                        </>
                    ) : (
                        <>
                            <button
                                onClick={() => {
                                    setIsSelectionMode(false);
                                    setSelectedFileIds(new Set());
                                }}
                                className="text-sm font-medium text-gray-500 hover:text-gray-700 px-3 py-2"
                            >
                                Cancel
                            </button>
                            {selectedFileIds.size > 0 && (
                                <>
                                    <button
                                        onClick={handleRemoveSelected}
                                        className="text-sm font-medium text-red-600 hover:text-red-800 bg-red-50 hover:bg-red-100 px-4 py-2 rounded-lg transition-colors flex items-center gap-2"
                                    >
                                        <TrashIcon className="w-4 h-4" />
                                        Remove
                                    </button>
                                    <button
                                        onClick={handleDownloadSelected}
                                        className="text-sm font-medium text-blue-600 hover:text-blue-800 bg-blue-50 hover:bg-blue-100 px-4 py-2 rounded-lg transition-colors flex items-center gap-2"
                                    >
                                        <ArrowDownTrayIcon className="w-4 h-4" />
                                        Download ({selectedFileIds.size})
                                    </button>
                                </>
                            )}
                        </>
                    )}
                </div>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {/* Active Receiving Card */}
                {receivingFile && (
                 <div className="bg-white p-4 rounded-2xl border border-blue-200 shadow-sm flex flex-col relative group ring-2 ring-blue-50">
                    <div className="absolute top-3 right-3 z-10 bg-white/80 backdrop-blur-sm rounded-full p-1">
                        <ArrowDownTrayIcon className="w-5 h-5 text-blue-600 animate-bounce" />
                    </div>

                    {/* Preview Placeholder */}
                    <div className="mb-4 rounded-xl overflow-hidden bg-gray-50 border border-gray-100 relative h-40 flex items-center justify-center">
                        <div className="transform scale-150 opacity-50 flex flex-col items-center gap-2">
                             <DocumentIcon className="w-12 h-12 text-gray-400" />
                        </div>
                        
                        {/* Progress Overlay */}
                        <div className="absolute inset-0 bg-white/80 backdrop-blur-[2px] z-20 flex flex-col items-center justify-center p-6">
                            <div className="w-full text-center">
                                <p className="text-xs font-bold text-gray-900 mb-2 uppercase tracking-wider">
                                    Receiving...
                                </p>
                                <div className="flex justify-between text-[10px] font-medium text-gray-500 mb-1 px-1">
                                    <span>{receivingFile.progress.toFixed(0)}%</span>
                                </div>
                                <div className="w-full bg-gray-200 rounded-full h-1.5 overflow-hidden">
                                    <div className="bg-blue-600 h-full transition-all duration-300" style={{ width: `${receivingFile.progress}%` }}></div>
                                </div>
                            </div>
                        </div>
                    </div>

                    <div className="min-w-0 mt-auto">
                         <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0">
                                <p className="font-semibold text-gray-900 truncate text-sm mb-0.5" title={receivingFile.fileName}>{receivingFile.fileName}</p>
                                <p className="text-xs text-gray-500">{formatFileSize(receivingFile.size)}</p>
                            </div>
                         </div>
                    </div>
                 </div>
                )}

                {/* Completed Received Files */}
                {[...receivedFiles].reverse().map((f) => (
                 <div 
                    key={f.id} 
                    onClick={() => isSelectionMode && toggleSelection(f.id)}
                    className={`bg-white p-4 rounded-2xl border shadow-sm transition-all duration-200 group relative flex flex-col ${
                        isSelectionMode ? 'cursor-pointer hover:border-blue-400' : ''
                    } ${selectedFileIds.has(f.id) ? 'border-blue-500 ring-1 ring-blue-500 bg-blue-50/10' : 'border-gray-200 hover:shadow-md'}`}
                 >
                    {isSelectionMode && (
                      <div className="absolute top-3 right-3 z-10">
                          <input 
                            type="checkbox" 
                            checked={selectedFileIds.has(f.id)}
                            onChange={() => {}} 
                            className="w-5 h-5 rounded border-gray-300 text-blue-600 focus:ring-blue-500 pointer-events-none"
                          />
                      </div>
                    )}

                    {/* Status Badge (only if not selecting) */}
                    {!isSelectionMode && (
                        <div className="absolute top-3 right-3 z-10 bg-white/50 backdrop-blur-sm rounded-full p-1 pointer-events-none">
                            <CheckCircleIcon className="w-5 h-5 text-green-500" />
                        </div>
                    )}

                    {/* Preview */}
                    <div className="mb-4 rounded-xl overflow-hidden bg-gray-50 border border-gray-100 relative h-40 flex items-center justify-center group-hover:border-blue-200 transition-colors">
                        {f.previewUrl ? (
                            f.mime.startsWith('image/') ? 
                                <img src={f.previewUrl} className="w-full h-full object-cover" /> :
                                <div className="flex flex-col items-center gap-2">
                                    <VideoCameraIcon className="w-10 h-10 text-gray-400" />
                                    <span className="text-xs text-gray-400 font-medium">Video</span>
                                </div>
                        ) : (
                            <div className="transform scale-150 opacity-50">{getFileIcon(f.mime, f.fileName)}</div>
                        )}
                        
                        {/* Hover Overlay for Download (Only when not selecting) */}
                        {!isSelectionMode && (
                            <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity duration-200 flex items-center justify-center backdrop-blur-[1px]">
                                 <button
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        f.blob && saveAs(f.blob, f.fileName);
                                    }}
                                    className="bg-white text-black px-4 py-2 rounded-lg font-medium text-sm transform scale-95 group-hover:scale-100 transition-transform shadow-xl flex items-center gap-2"
                                 >
                                    <ArrowDownTrayIcon className="w-4 h-4" /> Download
                                 </button>
                            </div>
                        )}
                    </div>

                    <div className="min-w-0 mt-auto">
                         <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0">
                                <p className="font-semibold text-gray-900 truncate text-sm mb-0.5" title={f.fileName}>{f.fileName}</p>
                                <p className="text-xs text-gray-500">{formatFileSize(f.size)}</p>
                            </div>
                         </div>
                    </div>
                    
                    {!isSelectionMode && f.blob && (
                        <button
                          onClick={(e) => {
                              e.stopPropagation();
                              saveAs(f.blob!, f.fileName);
                          }}
                          className="mt-3 w-full py-2 bg-gray-100 hover:bg-black hover:text-white rounded-lg transition text-xs font-medium flex items-center justify-center gap-2 md:hidden"
                        >
                          <ArrowDownTrayIcon className="w-3 h-3" /> Download
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