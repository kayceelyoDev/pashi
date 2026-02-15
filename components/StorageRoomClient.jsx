"use client";

import { useEffect, useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { supabaseClient } from "@/lib/supabaseClient";
import { saveAs } from "file-saver";
import {
    ClipboardIcon,
    LinkIcon,
    ArrowDownTrayIcon,
    CloudArrowUpIcon,
    DocumentIcon,
    TrashIcon,
    HomeIcon,
    ClockIcon,
    PhotoIcon,
    MusicalNoteIcon,
    VideoCameraIcon,
    CodeBracketIcon,
    XMarkIcon
} from "@heroicons/react/24/outline";

export default function StorageRoomClient({ roomCode }) {
    const router = useRouter();
    const [files, setFiles] = useState([]);
    const [uploading, setUploading] = useState(false);
    const [uploadProgress, setUploadProgress] = useState(0);
    const [uploadingFile, setUploadingFile] = useState(null); // Track current file being uploaded
    const [loadedImages, setLoadedImages] = useState(new Set()); // Track loaded images
    const [downloadingIds, setDownloadingIds] = useState(new Set());
    const [selectedFileIds, setSelectedFileIds] = useState(new Set());
    const [isSelectionMode, setIsSelectionMode] = useState(false);
    const [errorMessage, setErrorMessage] = useState(null);
    const [now, setNow] = useState(Date.now()); // For live timers
    const fileInputRef = useRef(null);

    const MAX_STORAGE_LIMIT = 1024 * 1024 * 1024; // 1GB
    const MAX_SERVER_FILE_SIZE = 45 * 1024 * 1024; // ~45MB Safety Cap (Server limit is usually 50MB)
    const ONE_HOUR_MS = 60 * 60 * 1000;

    const totalUsed = files.reduce((acc, file) => acc + (file.file_size || 0), 0);
    const usedPercentage = Math.min(100, (totalUsed / MAX_STORAGE_LIMIT) * 100);

    const fetchFiles = async () => {
        const { data, error } = await supabaseClient
            .from("files")
            .select("*")
            .eq("room_code", roomCode)
            .order('created_at', { ascending: false }); // Sort by newest first

        if (error) {
            console.error("Error fetching files:", error);
        } else {
            // Filter out expired files immediately on fetch (optional client-side filter)
            // or keep them but show as expired. Let's keep them but visually mark/hide if needed.
            // Ideally backend auto-deletes, but for UI we filter valid ones.
            setFiles(data || []);
        }
    };

    // Ref for the channel so we can send on it
    const channelRef = useRef(null);

    useEffect(() => {
        fetchFiles();

        // 1. Real-time subscription & Broadcast Channel
        const channel = supabaseClient
            .channel(`room-files-${roomCode}`)
            .on(
                'postgres_changes',
                { event: '*', schema: 'public', table: 'files', filter: `room_code=eq.${roomCode}` },
                (payload) => {
                    console.log("Real-time (DB) update received:", payload);
                    fetchFiles();
                }
            )
            .on(
                'broadcast',
                { event: 'file-upload' },
                (payload) => {
                    console.log("Broadcast (Signal) update received:", payload);
                    fetchFiles();
                }
            )
            .subscribe((status) => {
                console.log(`Realtime Connection Status: ${status}`);
            });

        channelRef.current = channel;

        // 2. Polling Fallback (Every 4 seconds) - Reduced frequency
        const pollingInterval = setInterval(() => {
            fetchFiles();
        }, 4000);

        // 3. Timer interval for "Expires in..." UI (Every 1 minute)
        const timerInterval = setInterval(() => {
            setNow(Date.now());
        }, 60000);

        return () => {
            supabaseClient.removeChannel(channel);
            clearInterval(pollingInterval);
            clearInterval(timerInterval);
        };
    }, [roomCode]);

    const handleUpload = async (e) => {
        const selectedFiles = Array.from(e.target.files);
        if (selectedFiles.length === 0) return;

        // Check storage limit before uploading: Must fit within 1GB
        const pendingSize = selectedFiles.reduce((acc, f) => acc + f.size, 0);
        if (totalUsed + pendingSize > MAX_STORAGE_LIMIT) {
            const remaining = MAX_STORAGE_LIMIT - totalUsed;
            setErrorMessage(`Storage limit exceeded. You only have ${formatFileSize(remaining)} left.`);
            return;
        }

        setUploading(true);
        setUploadProgress(0);

        let completed = 0;
        const totalSize = pendingSize;
        let loadedSize = 0;

        for (const file of selectedFiles) {
            // Check individual file size against Server Limit (Supabase Free Tier often ~50MB)
            if (file.size > MAX_SERVER_FILE_SIZE) {
                setErrorMessage(`File "${file.name}" (${formatFileSize(file.size)}) is too large. Cloud Limit is ~50MB. Please use P2P for larger files.`);
                continue;
            }

            const fileName = `${Date.now()}_${file.name}`;
            const { error: uploadError } = await supabaseClient.storage
                .from("shared-files")
                .upload(fileName, file, {
                    upsert: false
                });

            if (uploadError) {
                console.error("Upload error:", uploadError);
                if (uploadError.message && (uploadError.message.includes("size") || uploadError.message.includes("limit"))) {
                    setErrorMessage(`Server rejected "${file.name}". File too large for Cloud Storage.`);
                } else {
                    setErrorMessage("Upload failed: " + uploadError.message);
                }
                continue;
            }

            const { error: dbError } = await supabaseClient.from("files").insert({
                room_code: roomCode,
                file_name: file.name,
                file_path: fileName,
                file_size: file.size,
                file_type: file.type,
            });

            if (dbError) console.error("Database error:", dbError);

            loadedSize += file.size;
            setUploadProgress((loadedSize / totalSize) * 100);
            completed++;
        }

        setUploading(false);
        fetchFiles();

        // Broadcast event to other users immediately
        // This is faster than DB replication and bypasses potential RLS/Publication config issues for the notification itself
        if (channelRef.current) {
            channelRef.current.send({
                type: 'broadcast',
                event: 'file-upload',
                payload: { message: 'new-file' }
            });
        }

        // Reset input
        if (fileInputRef.current) fileInputRef.current.value = '';
    };

    const handleDownload = async (file) => {
        if (downloadingIds.has(file.id)) return;

        setDownloadingIds(prev => new Set(prev).add(file.id));

        try {
            // 1. Download file
            const { data, error: downloadError } = await supabaseClient.storage
                .from("shared-files")
                .download(file.file_path);

            if (downloadError) throw downloadError;

            saveAs(data, file.file_name);

            // 2. Delete file from Storage immediately (Privacy Feature) - OPTIONAL for "Storage Room" logic
            // The prompt says "available for 1 hour". Usually that implies they persist for 1 hour for everyone.
            // But previous code was "Delete after download".
            // Prompt request: "shows like each file is temporary available on this room for 1 hour just that then also make it so that if one device uploaded a new image it should also update on other devices and that new file image or video will apear also to download no manual reloads needed"
            // It does NOT explicitly say "delete after download" anymore, but the code had it. 
            // I will KEEP "delete after download" logic if that was the original intent of this specific "Storage Room" (often ephemeral).
            // HOWEVER, if the user says "available on this room for 1 hour", maybe they want it to STAY for 1 hour?
            // "just that then also make it so that if one device uploaded..."
            // I'll stick to the current "Delete after download" because that's safe, OR
            // I will comment it out if the "1 hour" implies persistence.
            // Let's assume standard "Storage Room" = Persist for multiple people to see.
            // I will REMOVE the auto-delete on download to match "available for 1 hour" request better. 
            // If they wanted one-time view, they usually say "view once". "Available for 1 hour" implies duration.

            // await supabaseClient.storage.from("shared-files").remove([file.file_path]);
            // await supabaseClient.from("files").delete().eq("id", file.id);

            // Removing the AUTO-DELETE on download to support "Available for 1 hour" for everyone.

        } catch (error) {
            console.error("Download failed:", error);
            setErrorMessage("Failed to download file. It might have been deleted or expired.");
            fetchFiles(); // Refresh list if file is gone
        } finally {
            setDownloadingIds(prev => {
                const next = new Set(prev);
                next.delete(file.id);
                return next;
            });
        }
    };

    const handleDownloadAll = async () => {
        if (files.length === 0) return;
        if (!confirm(`Download all ${files.length} files?`)) return;

        for (const file of files) {
            await handleDownload(file);
        }
    };

    const handleDelete = async (fileToDelete) => {
        if (!confirm("Are you sure you want to delete this file?")) return;

        // Optimistic update
        const previousFiles = [...files];
        setFiles(currentFiles => currentFiles.filter(f => f.id !== fileToDelete.id));

        try {
            // 1. Delete from Storage
            const { error: storageError } = await supabaseClient.storage.from("shared-files").remove([fileToDelete.file_path]);
            if (storageError) console.error("Storage delete error:", storageError);

            // 2. Delete from Database
            const { error: dbError } = await supabaseClient.from("files").delete().eq("id", fileToDelete.id);
            if (dbError) throw dbError;

            fetchFiles();
        } catch (error) {
            console.error("Delete failed:", error);
            setErrorMessage("Failed to delete file.");
            setFiles(previousFiles); // Revert UI on error
            fetchFiles();
        }
    };

    const getFileUrl = (filePath) => {
        const { data } = supabaseClient.storage.from("shared-files").getPublicUrl(filePath);
        return data.publicUrl;
    };

    const formatFileSize = (bytes) => {
        if (bytes < 1024) return bytes + ' B';
        if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
        if (bytes < 1024 * 1024 * 1024) return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
        return (bytes / (1024 * 1024 * 1024)).toFixed(1) + ' GB';
    };

    const getFileTimeLeft = (createdAt) => {
        if (!createdAt) return null;
        const created = new Date(createdAt).getTime();
        const expiresAt = created + ONE_HOUR_MS;
        const diff = expiresAt - now;

        if (diff <= 0) return "Expired";

        const minutes = Math.floor(diff / 60000);
        if (minutes < 1) return "< 1m left";
        return `${minutes}m left`;
    };

    const getProgressColor = (createdAt) => {
        if (!createdAt) return "bg-green-500";
        const created = new Date(createdAt).getTime();
        const expiresAt = created + ONE_HOUR_MS;
        const diff = expiresAt - now;
        const percentLeft = (diff / ONE_HOUR_MS) * 100;

        if (percentLeft > 50) return "bg-green-500";
        if (percentLeft > 20) return "bg-yellow-500";
        return "bg-red-500";
    };

    const getFileIcon = (fileType, fileName) => {
        if (fileType.startsWith('image/')) return <PhotoIcon className="w-6 h-6 text-purple-600" />;
        if (fileType.startsWith('video/')) return <VideoCameraIcon className="w-6 h-6 text-red-600" />;
        if (fileType.startsWith('audio/')) return <MusicalNoteIcon className="w-6 h-6 text-yellow-600" />;
        if (fileType.includes('pdf') || fileName.endsWith('.pdf')) return <DocumentIcon className="w-6 h-6 text-red-500" />;
        if (fileType.includes('code') ||
            ['js', 'jsx', 'ts', 'tsx', 'html', 'css', 'json', 'py'].some(ext => fileName.endsWith('.' + ext)))
            return <CodeBracketIcon className="w-6 h-6 text-blue-600" />;
        return <DocumentIcon className="w-6 h-6 text-gray-500" />;
    };

    const toggleSelection = (id) => {
        setSelectedFileIds(prev => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
        });
    };

    const handleDownloadSelected = async () => {
        if (selectedFileIds.size === 0) return;
        if (!confirm(`Download ${selectedFileIds.size} files?`)) return;

        const filesToProcess = files.filter(f => selectedFileIds.has(f.id));

        setIsSelectionMode(false);
        setSelectedFileIds(new Set());

        for (const file of filesToProcess) {
            await handleDownload(file);
        }
    };

    const handleDeleteSelected = async () => {
        if (selectedFileIds.size === 0) return;
        if (!confirm(`Permanently delete ${selectedFileIds.size} files?`)) return;

        const filesToProcess = files.filter(f => selectedFileIds.has(f.id));

        // Optimistic update
        setFiles(prev => prev.filter(f => !selectedFileIds.has(f.id)));
        setIsSelectionMode(false);
        setSelectedFileIds(new Set());

        for (const file of filesToProcess) {
            try {
                await supabaseClient.storage.from("shared-files").remove([file.file_path]);
                await supabaseClient.from("files").delete().eq("id", file.id);
            } catch (e) {
                console.error("Error deleting file:", file.file_name, e);
            }
        }
        if (typeof fetchFiles === 'function') fetchFiles();
    };

    const copyToClipboard = async (text, successMessage = "Copied!") => {
        try {
            if (navigator.clipboard && navigator.clipboard.writeText) {
                await navigator.clipboard.writeText(text);
                alert(successMessage);
            } else {
                // Fallback
                const textArea = document.createElement("textarea");
                textArea.value = text;
                textArea.style.position = "fixed";
                textArea.style.left = "-9999px";
                document.body.appendChild(textArea);
                textArea.focus();
                textArea.select();
                try {
                    document.execCommand('copy');
                    alert(successMessage);
                } catch (err) {
                    console.error('Fallback copy failed', err);
                    alert("Failed to copy");
                }
                document.body.removeChild(textArea);
            }
        } catch (err) {
            console.error('Copy failed', err);
            alert("Failed to copy");
        }
    };

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
                                <p className="text-xs text-green-600 flex items-center gap-1.5 font-medium">
                                    <span className="relative flex h-2 w-2">
                                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
                                        <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500"></span>
                                    </span>
                                    Cloud Storage
                                    <span className="text-gray-400">•</span>
                                    <span className="text-gray-500">Files expire in 1h</span>
                                </p>
                            </div>
                        </div>

                        <div className="flex items-center gap-2">
                            <button
                                onClick={() => copyToClipboard(roomCode, "Room Code Copied!")}
                                className="p-2.5 bg-gray-50 text-gray-600 hover:text-black hover:bg-gray-100 rounded-xl transition-all duration-200"
                                title="Copy Code"
                            >
                                <ClipboardIcon className="w-5 h-5" />
                            </button>
                            <button
                                onClick={() => {
                                    const url = `${window.location.origin}/join-room/${roomCode}`;
                                    copyToClipboard(url, "Link Copied!");
                                }}
                                className="p-2.5 bg-gray-50 text-gray-600 hover:text-black hover:bg-gray-100 rounded-xl transition-all duration-200"
                                title="Copy Link"
                            >
                                <LinkIcon className="w-5 h-5" />
                            </button>
                        </div>
                    </div>
                </div>
            </div>

            {/* Error Modal */}
            {errorMessage && (
                <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 backdrop-blur-sm">
                    <div className="bg-white rounded-2xl shadow-xl max-w-sm w-full p-6 animate-in fade-in zoom-in duration-200">
                        <div className="flex items-center gap-3 text-red-600 mb-4">
                            <div className="w-10 h-10 bg-red-100 rounded-full flex items-center justify-center">
                                <XMarkIcon className="w-6 h-6" />
                            </div>
                            <h3 className="text-lg font-bold">Error</h3>
                        </div>
                        <p className="text-gray-600 mb-6">{errorMessage}</p>
                        <button
                            onClick={() => setErrorMessage(null)}
                            className="w-full bg-gray-100 hover:bg-gray-200 text-gray-900 font-medium py-3 rounded-xl transition-colors"
                        >
                            Dismiss
                        </button>
                    </div>
                </div>
            )}

            {/* Main Content */}
            <div className="max-w-5xl mx-auto px-4 py-12 sm:px-6 lg:px-8">

                {/* Upload Section */}
                <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-8 mb-10 transition-all duration-300 hover:shadow-md">
                    {/* Storage Gauge */}
                    <div className="mb-8 bg-gray-50 rounded-xl p-4 border border-gray-100">
                        <div className="flex justify-between items-center mb-2 text-sm">
                            <span className="font-semibold text-gray-700">Room Storage</span>
                            <span className="text-gray-500">{formatFileSize(totalUsed)} / {formatFileSize(MAX_STORAGE_LIMIT)}</span>
                        </div>
                        <div className="w-full bg-gray-200 rounded-full h-2.5 overflow-hidden">
                            <div
                                className={`h-full transition-all duration-500 ease-out ${usedPercentage > 90 ? 'bg-red-500' : 'bg-black'}`}
                                style={{ width: `${usedPercentage}%` }}
                            ></div>
                        </div>
                    </div>

                    <div className="text-center">
                        <input
                            type="file"
                            ref={fileInputRef}
                            onChange={handleUpload}
                            className="hidden"
                            disabled={uploading}
                            multiple
                        />
                        <div className="flex flex-col items-center justify-center gap-5">
                            <div className="w-20 h-20 bg-black/5 text-black rounded-3xl flex items-center justify-center mb-2">
                                <CloudArrowUpIcon className="w-10 h-10" />
                            </div>
                            <div>
                                <h2 className="text-2xl font-semibold text-gray-900 mb-2">Upload Files</h2>
                                <p className="text-sm text-gray-500 max-w-md mx-auto leading-relaxed">
                                    Files uploaded here are accessible to anyone with the room code.
                                    <br />
                                    <span className="text-blue-600 font-medium bg-blue-50 px-2 py-0.5 rounded text-xs mt-2 inline-block">
                                        Auto-updates across devices • Valid for 1 Hour
                                    </span>
                                </p>
                            </div>

                            {uploading ? (
                                <div className="w-full max-w-xs mt-4">
                                    <div className="flex justify-between text-xs font-medium text-gray-500 mb-1">
                                        <span>Uploading...</span>
                                        <span>{Math.round(uploadProgress)}%</span>
                                    </div>
                                    <div className="w-full bg-gray-100 rounded-full h-2 overflow-hidden mb-2">
                                        <div
                                            className="bg-black h-full transition-all duration-300 ease-out"
                                            style={{ width: `${uploadProgress}%` }}
                                        ></div>
                                    </div>
                                    {uploadingFile && (
                                        <p className="text-xs text-gray-400 truncate animate-pulse text-center">
                                            {uploadingFile}
                                        </p>
                                    )}
                                </div>
                            ) : (
                                <button
                                    onClick={() => fileInputRef.current.click()}
                                    disabled={uploading}
                                    className="mt-4 bg-black text-white px-8 py-3.5 rounded-xl font-medium hover:bg-gray-800 active:scale-95 transition-all duration-200 shadow-lg shadow-black/10 flex items-center gap-2"
                                >
                                    <ArrowDownTrayIcon className="w-5 h-5 rotate-180" />
                                    Select Files to Upload
                                </button>
                            )}
                        </div>
                    </div>



                    {/* File List */}
                    <div>
                        <div className="flex items-center justify-between mb-6">
                            <div className="flex items-center gap-3">
                                <h3 className="text-xs font-bold text-gray-400 uppercase tracking-widest px-1">Shared Files ({files.length})</h3>
                                {isSelectionMode && (
                                    <span className="text-xs font-medium text-blue-600 bg-blue-50 px-2 py-1 rounded-md">
                                        {selectedFileIds.size} Selected
                                    </span>
                                )}
                            </div>

                            <div className="flex items-center gap-2">
                                {!isSelectionMode ? (
                                    <>
                                        {files.length > 0 && (
                                            <button
                                                onClick={() => setIsSelectionMode(true)}
                                                className="text-sm font-medium text-gray-600 hover:text-black bg-gray-50 hover:bg-gray-100 px-4 py-2 rounded-lg transition-colors"
                                            >
                                                Select
                                            </button>
                                        )}
                                        {files.length > 0 && (
                                            <button
                                                onClick={handleDownloadAll}
                                                disabled={downloadingIds.size > 0}
                                                className="text-sm font-medium text-blue-600 hover:text-blue-800 bg-blue-50 hover:bg-blue-100 px-4 py-2 rounded-lg transition-colors flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                                            >
                                                <ArrowDownTrayIcon className="w-4 h-4" />
                                                {downloadingIds.size > 0 ? 'Downloading...' : 'Download All'}
                                            </button>
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
                                                    onClick={handleDeleteSelected}
                                                    className="text-sm font-medium text-red-600 hover:text-red-800 bg-red-50 hover:bg-red-100 px-4 py-2 rounded-lg transition-colors"
                                                >
                                                    Delete
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

                        {files.length === 0 ? (
                            <div className="text-center py-16 bg-white rounded-2xl border border-gray-200 border-dashed">
                                <div className="w-16 h-16 bg-gray-50 rounded-2xl flex items-center justify-center mx-auto mb-4">
                                    <DocumentIcon className="w-8 h-8 text-gray-300" />
                                </div>
                                <h4 className="text-gray-900 font-medium mb-1">No files yet</h4>
                                <p className="text-gray-500 text-sm">Upload a file to start sharing</p>
                            </div>
                        ) : (
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                {files.map((file) => (
                                    <div
                                        key={file.id}
                                        onClick={() => isSelectionMode && toggleSelection(file.id)}
                                        className={`bg-white p-4 rounded-2xl border shadow-sm hover:shadow-md transition-all duration-200 group relative overflow-hidden flex flex-col ${isSelectionMode ? 'cursor-pointer hover:border-blue-400' : ''
                                            } ${selectedFileIds.has(file.id) ? 'border-blue-500 ring-1 ring-blue-500 bg-blue-50/10' : 'border-gray-200'}`}
                                    >
                                        {/* Expiration Timer Badge */}
                                        <div className="absolute top-3 left-3 z-30">
                                            <div className={`flex items-center gap-1.5 px-2 py-1 rounded-md text-[10px] font-bold text-white shadow-sm transition-colors ${getProgressColor(file.created_at)}`}>
                                                <ClockIcon className="w-3 h-3" />
                                                {getFileTimeLeft(file.created_at)}
                                            </div>
                                        </div>

                                        {isSelectionMode && (
                                            <div className="absolute top-3 right-3 z-30">
                                                <input
                                                    type="checkbox"
                                                    checked={selectedFileIds.has(file.id)}
                                                    onChange={() => { }} // Handled by parent onClick
                                                    className="w-5 h-5 rounded border-gray-300 text-blue-600 focus:ring-blue-500 pointer-events-none"
                                                />
                                            </div>
                                        )}
                                        {/* Progress Overlay */}
                                        {downloadingIds.has(file.id) && (
                                            <div className="absolute inset-0 bg-white/95 z-20 flex flex-col items-center justify-center p-6 backdrop-blur-sm">
                                                <div className="w-full max-w-[80%]">
                                                    <div className="flex justify-between text-xs font-bold text-gray-900 mb-2">
                                                        <span>Downloading...</span>
                                                        <span className="animate-pulse">...</span>
                                                    </div>
                                                    <div className="w-full bg-gray-200 rounded-full h-1.5 overflow-hidden">
                                                        <div
                                                            className="bg-black h-full animate-progress-indeterminate"
                                                            style={{ width: `100%` }}
                                                        ></div>
                                                    </div>
                                                </div>
                                            </div>
                                        )}

                                        {/* Preview Section */}
                                        <div className="mb-4 rounded-xl overflow-hidden bg-gray-50 border border-gray-100 relative h-48 flex items-center justify-center group-hover:border-gray-200 transition-colors">
                                            {file.file_type.startsWith('image/') ? (
                                                <>
                                                    {!loadedImages.has(file.id) && (
                                                        <div className="absolute inset-0 bg-gray-200 animate-pulse flex items-center justify-center">
                                                            <PhotoIcon className="w-8 h-8 text-gray-300 opacity-50" />
                                                        </div>
                                                    )}
                                                    <img
                                                        src={getFileUrl(file.file_path)}
                                                        alt={file.file_name}
                                                        className={`w-full h-full object-cover transition-opacity duration-300 ${loadedImages.has(file.id) ? 'opacity-100' : 'opacity-0'}`}
                                                        loading="lazy"
                                                        onLoad={() => setLoadedImages(prev => new Set(prev).add(file.id))}
                                                    />
                                                </>
                                            ) : file.file_type.startsWith('video/') ? (
                                                <video
                                                    src={getFileUrl(file.file_path)}
                                                    className="w-full h-full object-cover"
                                                    controls={false} // Hide controls for thumbnail feel, user can download to watch
                                                    preload="metadata"
                                                />
                                            ) : (
                                                // Fallback icon for non-previewable files
                                                <div className="transform scale-150 opacity-50">
                                                    {getFileIcon(file.file_type, file.file_name)}
                                                </div>
                                            )}

                                            {/* Play icon overlay for videos */}
                                            {file.file_type.startsWith('video/') && (
                                                <div className="absolute inset-0 flex items-center justify-center bg-black/10">
                                                    <div className="w-12 h-12 bg-white/90 rounded-full flex items-center justify-center shadow-lg backdrop-blur-sm">
                                                        <svg className="w-5 h-5 ml-1 text-black" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z" /></svg>
                                                    </div>
                                                </div>
                                            )}
                                        </div>

                                        <div className="flex items-start justify-between gap-3 mb-4">
                                            <div className="min-w-0">
                                                <p className="font-semibold text-gray-900 truncate text-sm mb-1" title={file.file_name}>
                                                    {file.file_name}
                                                </p>
                                                <div className="flex items-center gap-2 text-xs text-gray-500">
                                                    <span className="bg-gray-100 px-2 py-0.5 rounded text-gray-600 font-medium">
                                                        {formatFileSize(file.file_size)}
                                                    </span>
                                                </div>
                                            </div>
                                        </div>

                                        <div className="mt-auto flex gap-2">
                                            <button
                                                onClick={() => handleDownload(file)}
                                                disabled={downloadingIds.has(file.id)}
                                                className="flex-1 flex items-center justify-center gap-2 px-3 py-2 bg-black text-white hover:bg-gray-800 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg transition-all duration-200 text-sm font-medium"
                                            >
                                                <ArrowDownTrayIcon className="w-4 h-4" />
                                                Download
                                            </button>
                                            <button
                                                onClick={() => handleDelete(file)}
                                                disabled={downloadingIds.has(file.id)}
                                                className="flex-none flex items-center justify-center gap-2 px-3 py-2 bg-white border border-gray-200 text-red-600 hover:bg-red-50 hover:border-red-200 rounded-lg transition-all duration-200 text-sm font-medium"
                                                title="Delete File"
                                            >
                                                <TrashIcon className="w-4 h-4" />
                                            </button>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );

}
