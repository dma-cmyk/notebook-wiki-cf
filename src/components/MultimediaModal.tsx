/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useRef, useEffect } from "react";
import { Camera, Video, Mic, Square, Play, Pause, X, RefreshCw, Check, AlertCircle, Trash2, ZoomIn, ZoomOut, Zap, ZapOff } from "lucide-react";
import { ThemePreset } from "../App";

interface MultimediaModalProps {
  isOpen: boolean;
  onClose: () => void;
  activeTheme: ThemePreset;
  token: string | null;
  onProcessResult: (title: string, content: string) => void;
}

type TabType = "photo" | "video" | "audio";

export function MultimediaModal({
  isOpen,
  onClose,
  activeTheme,
  token,
  onProcessResult,
}: MultimediaModalProps) {
  const [activeTab, setActiveTab] = useState<TabType>("photo");
  const [isRecording, setIsRecording] = useState(false);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysisError, setAnalysisError] = useState<string | null>(null);

  // Streams & Recorders
  const [stream, setStream] = useState<MediaStream | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  // References to video/audio tags
  const videoRef = useRef<HTMLVideoElement>(null);
  const [capturedPhotoUrl, setCapturedPhotoUrl] = useState<string | null>(null);
  const [capturedPhotoBlob, setCapturedPhotoBlob] = useState<Blob | null>(null);

  const [recordedVideoUrl, setRecordedVideoUrl] = useState<string | null>(null);
  const [recordedVideoBlob, setRecordedVideoBlob] = useState<Blob | null>(null);

  const [recordedAudioUrl, setRecordedAudioUrl] = useState<string | null>(null);
  const [recordedAudioBlob, setRecordedAudioBlob] = useState<Blob | null>(null);

  // Cameras enumeration & switching
  const [videoDevices, setVideoDevices] = useState<MediaDeviceInfo[]>([]);
  const [selectedCameraId, setSelectedCameraId] = useState<string>("");
  const [facingMode, setFacingMode] = useState<"user" | "environment">("user");
  const [isMirrored, setIsMirrored] = useState(true);

  // Zoom feature (uses range slider bar, no swipe/pinch gestures to prevent interference with browser zoom)
  const [zoom, setZoom] = useState<number>(1);

  // Apply native track constraints zoom if supported by hardware
  useEffect(() => {
    if (!stream) return;
    const track = stream.getVideoTracks()[0];
    if (track && typeof track.applyConstraints === "function") {
      const capabilities = typeof track.getCapabilities === "function" ? track.getCapabilities() : {};
      if ("zoom" in capabilities) {
        try {
          const min = (capabilities as any).zoom.min || 1;
          const max = (capabilities as any).zoom.max || 4;
          const targetZoom = Math.min(max, Math.max(min, zoom));
          track.applyConstraints({
            advanced: [{ zoom: targetZoom } as any]
          }).catch((err) => {
            console.warn("Failed to apply native zoom constraint promise:", err);
          });
        } catch (e) {
          console.warn("Failed to apply native zoom constraint:", e);
        }
      }
    }
  }, [zoom, stream]);

  // Flashlight / Torch toggle feature
  const [hasTorch, setHasTorch] = useState<boolean>(false);
  const [isTorchOn, setIsTorchOn] = useState<boolean>(false);

  // Detect torch capability on current stream
  useEffect(() => {
    if (!stream) {
      setHasTorch(false);
      setIsTorchOn(false);
      return;
    }
    const track = stream.getVideoTracks()[0];
    if (track) {
      const checkTorchCapability = () => {
        const capabilities = typeof track.getCapabilities === "function" ? track.getCapabilities() : {};
        const supportsTorch = "torch" in capabilities;
        setHasTorch(supportsTorch);
      };
      
      checkTorchCapability();
      const timeoutId = setTimeout(checkTorchCapability, 500);
      return () => clearTimeout(timeoutId);
    } else {
      setHasTorch(false);
      setIsTorchOn(false);
    }
  }, [stream]);

  // Apply torch constraints when toggled
  useEffect(() => {
    if (!stream || !hasTorch) return;
    const track = stream.getVideoTracks()[0];
    if (track && typeof track.applyConstraints === "function") {
      try {
        track.applyConstraints({
          advanced: [{ torch: isTorchOn } as any]
        }).catch((err) => {
          console.warn("Failed to apply torch constraint promise:", err);
        });
      } catch (e) {
        console.warn("Failed to apply torch constraint:", e);
      }
    }
  }, [isTorchOn, stream, hasTorch]);

  const enumerateCameras = async (activeDeviceId?: string) => {
    try {
      if (!navigator.mediaDevices || !navigator.mediaDevices.enumerateDevices) return;
      const devices = await navigator.mediaDevices.enumerateDevices();
      const cameras = devices.filter((device) => device.kind === "videoinput");
      setVideoDevices(cameras);
      if (activeDeviceId) {
        setSelectedCameraId(activeDeviceId);
      } else if (cameras.length > 0 && !selectedCameraId) {
        setSelectedCameraId(cameras[0].deviceId);
      }
    } catch (err) {
      console.warn("Failed to enumerate devices:", err);
    }
  };

  // Automatically toggle mirror off for rear/back/environment cameras or when using environment facingMode
  useEffect(() => {
    if (facingMode === "environment") {
      setIsMirrored(false);
      return;
    }
    if (!selectedCameraId || videoDevices.length === 0) {
      setIsMirrored(facingMode === "user");
      return;
    }
    const activeDevice = videoDevices.find((d) => d.deviceId === selectedCameraId);
    if (activeDevice) {
      const label = activeDevice.label.toLowerCase();
      const isBackCamera = 
        label.includes("back") || 
        label.includes("rear") || 
        label.includes("environment") || 
        label.includes("out") || 
        label.includes("外部") || 
        label.includes("背面");
      setIsMirrored(!isBackCamera);
    } else {
      setIsMirrored(facingMode === "user");
    }
  }, [selectedCameraId, videoDevices, facingMode]);

  const handleCameraChange = async (deviceId: string) => {
    setSelectedCameraId(deviceId);
    
    // Auto detect next facing mode from device label if matched
    const device = videoDevices.find(d => d.deviceId === deviceId);
    if (device) {
      const label = device.label.toLowerCase();
      const isBackCamera = 
        label.includes("back") || 
        label.includes("rear") || 
        label.includes("environment") || 
        label.includes("out") || 
        label.includes("外部") || 
        label.includes("背面");
      setFacingMode(isBackCamera ? "environment" : "user");
    }

    if (isOpen && (activeTab === "photo" || activeTab === "video")) {
      // Stop current stream first so we can cleanly acquire the new one
      if (stream) {
        stream.getTracks().forEach((track) => track.stop());
      }
      initTabStream(activeTab, deviceId);
    }
  };

  // Switch to next available camera or toggle facingMode if enumeration isn't available
  const handleToggleCamera = async () => {
    if (videoDevices.length > 1) {
      const currentIndex = videoDevices.findIndex((d) => d.deviceId === selectedCameraId);
      const nextIndex = (currentIndex + 1) % videoDevices.length;
      const nextDevice = videoDevices[nextIndex];
      
      setSelectedCameraId(nextDevice.deviceId);
      
      const label = nextDevice.label.toLowerCase();
      const isBackCamera = 
        label.includes("back") || 
        label.includes("rear") || 
        label.includes("environment") || 
        label.includes("out") || 
        label.includes("外部") || 
        label.includes("背面");
      const nextFacing = isBackCamera ? "environment" : "user";
      setFacingMode(nextFacing);

      if (stream) {
        stream.getTracks().forEach((track) => track.stop());
      }
      initTabStream(activeTab, nextDevice.deviceId, nextFacing);
    } else {
      const nextFacing = facingMode === "user" ? "environment" : "user";
      setFacingMode(nextFacing);
      setSelectedCameraId(""); // clear selected so it falls back to facingMode constraint

      if (stream) {
        stream.getTracks().forEach((track) => track.stop());
      }
      initTabStream(activeTab, "", nextFacing);
    }
  };

  // Cleanup helper to stop camera/mic
  const stopStream = () => {
    if (stream) {
      stream.getTracks().forEach((track) => track.stop());
      setStream(null);
    }
    setHasTorch(false);
    setIsTorchOn(false);
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  };

  // Safe release of preview URLs
  const clearPreviews = () => {
    if (capturedPhotoUrl) {
      URL.revokeObjectURL(capturedPhotoUrl);
      setCapturedPhotoUrl(null);
      setCapturedPhotoBlob(null);
    }
    if (recordedVideoUrl) {
      URL.revokeObjectURL(recordedVideoUrl);
      setRecordedVideoUrl(null);
      setRecordedVideoBlob(null);
    }
    if (recordedAudioUrl) {
      URL.revokeObjectURL(recordedAudioUrl);
      setRecordedAudioUrl(null);
      setRecordedAudioBlob(null);
    }
  };

  // Reset tab states
  const resetTabStates = () => {
    stopStream();
    clearPreviews();
    setIsRecording(false);
    setRecordingSeconds(0);
    setAnalysisError(null);
    setZoom(1);
  };

  // Handle Tab Switch
  useEffect(() => {
    resetTabStates();
    if (isOpen) {
      initTabStream(activeTab);
    }
    return () => stopStream();
  }, [activeTab, isOpen]);

  // Initializing streams depending on chosen tab
  const initTabStream = async (tab: TabType, cameraId?: string, currentFacing?: "user" | "environment") => {
    try {
      const activeCameraId = cameraId || selectedCameraId;
      const activeFacing = currentFacing || facingMode;

      if (tab === "photo") {
        let videoConstraint: MediaTrackConstraints = {};
        if (activeCameraId && activeCameraId !== "") {
          videoConstraint = { deviceId: { ideal: activeCameraId } };
        } else {
          videoConstraint = { facingMode: activeFacing };
        }

        let mediaStream: MediaStream;
        try {
          mediaStream = await navigator.mediaDevices.getUserMedia({
            video: videoConstraint,
            audio: false,
          });
        } catch (err) {
          console.warn("First photo stream attempt failed, retrying with facingMode:", err);
          mediaStream = await navigator.mediaDevices.getUserMedia({
            video: { facingMode: activeFacing },
            audio: false,
          });
        }

        setStream(mediaStream);
        if (videoRef.current) {
          videoRef.current.srcObject = mediaStream;
        }
        
        // Enumerate devices once stream is acquired to ensure permissions are granted & labels are available
        const activeTrack = mediaStream.getVideoTracks()[0];
        const currentId = activeTrack?.getSettings()?.deviceId;
        await enumerateCameras(currentId || activeCameraId);
      } else if (tab === "video") {
        let videoConstraint: MediaTrackConstraints = {};
        if (activeCameraId && activeCameraId !== "") {
          videoConstraint = { deviceId: { ideal: activeCameraId } };
        } else {
          videoConstraint = { facingMode: activeFacing };
        }

        let mediaStream: MediaStream;
        try {
          mediaStream = await navigator.mediaDevices.getUserMedia({
            video: videoConstraint,
            audio: true,
          });
        } catch (err) {
          console.warn("First video stream attempt failed, retrying with facingMode:", err);
          mediaStream = await navigator.mediaDevices.getUserMedia({
            video: { facingMode: activeFacing },
            audio: true,
          });
        }

        setStream(mediaStream);
        if (videoRef.current) {
          videoRef.current.srcObject = mediaStream;
        }

        // Enumerate devices once stream is acquired to ensure permissions are granted & labels are available
        const activeTrack = mediaStream.getVideoTracks()[0];
        const currentId = activeTrack?.getSettings()?.deviceId;
        await enumerateCameras(currentId || activeCameraId);
      } else if (tab === "audio") {
        const mediaStream = await navigator.mediaDevices.getUserMedia({
          audio: true,
          video: false,
        });
        setStream(mediaStream);
      }
    } catch (err: any) {
      console.warn("Media device acquisition failed:", err);
      setAnalysisError(
        "カメラまたはマイクの取得に失敗しました。ブラウザのアクセス許可を設定してください。"
      );
    }
  };

  // Timer helper
  const startTimer = () => {
    setRecordingSeconds(0);
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = setInterval(() => {
      setRecordingSeconds((prev) => prev + 1);
    }, 1000);
  };

  const stopTimer = () => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  };

  // Format seconds -> mm:ss
  const formatTime = (secs: number) => {
    const m = Math.floor(secs / 60).toString().padStart(2, "0");
    const s = (secs % 60).toString().padStart(2, "0");
    return `${m}:${s}`;
  };

  // Tab 1: Photo - Snapshot capture
  const handleCapturePhoto = () => {
    if (!videoRef.current || !stream) return;

    const video = videoRef.current;
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth || 640;
    canvas.height = video.videoHeight || 480;

    const ctx = canvas.getContext("2d");
    if (ctx) {
      ctx.save();
      
      // Handle mirroring
      if (isMirrored) {
        ctx.translate(canvas.width, 0);
        ctx.scale(-1, 1);
      }
      
      // Handle zoom cropping (mimics zoom level on canvas)
      if (zoom > 1) {
        const cropW = canvas.width / zoom;
        const cropH = canvas.height / zoom;
        const cropX = (canvas.width - cropW) / 2;
        const cropY = (canvas.height - cropH) / 2;
        
        ctx.drawImage(
          video,
          cropX, cropY, cropW, cropH,
          0, 0, canvas.width, canvas.height
        );
      } else {
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      }
      
      ctx.restore();

      canvas.toBlob((blob) => {
        if (blob) {
          const url = URL.createObjectURL(blob);
          setCapturedPhotoUrl(url);
          setCapturedPhotoBlob(blob);
          stopStream();
        }
      }, "image/jpeg", 0.9);
    }
  };

  // Tab 2: Video - Record
  const handleStartVideoRecording = () => {
    if (!stream) return;
    chunksRef.current = [];
    const mediaRecorder = new MediaRecorder(stream, { mimeType: "video/webm;codecs=vp9,opus" });
    mediaRecorderRef.current = mediaRecorder;

    mediaRecorder.ondataavailable = (e) => {
      if (e.data && e.data.size > 0) {
        chunksRef.current.push(e.data);
      }
    };

    mediaRecorder.onstop = () => {
      const blob = new Blob(chunksRef.current, { type: "video/webm" });
      const url = URL.createObjectURL(blob);
      setRecordedVideoUrl(url);
      setRecordedVideoBlob(blob);
      stopStream();
    };

    mediaRecorder.start();
    setIsRecording(true);
    startTimer();
  };

  const handleStopVideoRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
      stopTimer();
    }
  };

  // Tab 3: Audio - Record
  const handleStartAudioRecording = () => {
    if (!stream) return;
    chunksRef.current = [];
    const mediaRecorder = new MediaRecorder(stream, { mimeType: "audio/webm" });
    mediaRecorderRef.current = mediaRecorder;

    mediaRecorder.ondataavailable = (e) => {
      if (e.data && e.data.size > 0) {
        chunksRef.current.push(e.data);
      }
    };

    mediaRecorder.onstop = () => {
      const blob = new Blob(chunksRef.current, { type: "audio/webm" });
      const url = URL.createObjectURL(blob);
      setRecordedAudioUrl(url);
      setRecordedAudioBlob(blob);
      stopStream();
    };

    mediaRecorder.start();
    setIsRecording(true);
    startTimer();
  };

  const handleStopAudioRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
      stopTimer();
    }
  };

  // Send captured blob to Backend for AI Extraction
  const handleProcessWithAI = async (blob: Blob | null, typeLabel: string, ext: string) => {
    if (!blob) return;

    setIsAnalyzing(true);
    setAnalysisError(null);

    try {
      // 1. Read blob as base64
      const reader = new FileReader();
      const base64Promise = new Promise<string>((resolve, reject) => {
        reader.onload = () => {
          const result = reader.result as string;
          const base64Data = result.split(",")[1];
          resolve(base64Data);
        };
        reader.onerror = (e) => reject(e);
      });
      reader.readAsDataURL(blob);
      const base64Data = await base64Promise;

      // 2. Call our robust backend file-analyzer
      const res = await fetch("/api/memos/analyze-file", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          fileData: base64Data,
          mimeType: blob.type || `${typeLabel}/${ext}`,
          fileName: `multimedia_${Date.now()}.${ext}`,
        }),
      });

      if (!res.ok) {
        const errJson = await res.json();
        throw new Error(errJson.error || "AI解析サーバーでエラーが発生しました。");
      }

      const data = await res.json();
      if (data.success && data.text) {
        // Success: Callback to trigger memo creation on the frontend
        const timestamp = new Date().toLocaleTimeString();
        onProcessResult(
          `${typeLabel}入力メモ - ${timestamp}`,
          data.text
        );
        onClose();
      } else {
        throw new Error("AIから有効なテキストが返されませんでした。");
      }
    } catch (err: any) {
      console.error("Multimodal analysis failed:", err);
      setAnalysisError(err.message || "ファイルの読み込み・AI解析中にエラーが発生しました。");
    } finally {
      setIsAnalyzing(false);
    }
  };

  // Close & Clean-up
  const handleCloseModal = () => {
    resetTabStates();
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-md flex items-center justify-center z-50 p-0 sm:p-4 animate-in fade-in duration-200">
      <div className="bg-white sm:rounded-2xl shadow-2xl max-w-lg w-full h-full sm:h-auto sm:max-h-[90vh] overflow-hidden flex flex-col border border-slate-200">
        
        {/* Header */}
        <div className="p-4 border-b border-slate-100 flex items-center justify-between bg-slate-50 shrink-0">
          <div>
            <h3 className="font-display font-semibold text-sm text-slate-800">
              マルチメディア入力 (カメラ/マイクから自動読込)
            </h3>
            <p className="text-[10px] text-slate-400 mt-0.5">
              撮影や録画、録音データをAIが分析してテキストメモに自動変換します。
            </p>
          </div>
          <button
            onClick={handleCloseModal}
            className="text-slate-400 hover:text-slate-600 rounded-lg p-1.5 hover:bg-slate-100 transition-colors cursor-pointer flex items-center gap-1"
          >
            <span className="sm:hidden font-semibold text-xs text-slate-500 mr-1">閉じる</span>
            <X className="w-5 h-5 sm:w-4 sm:h-4 text-slate-500" />
          </button>
        </div>

        {/* Tabs Bar */}
        <div className="flex border-b border-slate-100 bg-slate-50/50 p-1 shrink-0">
          <button
            onClick={() => setActiveTab("photo")}
            className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 text-xs font-semibold rounded-lg transition-all cursor-pointer ${
              activeTab === "photo"
                ? `bg-white text-indigo-600 shadow-xs border border-slate-200/50`
                : "text-slate-500 hover:text-slate-700 hover:bg-slate-100"
            }`}
          >
            <Camera className="w-3.5 h-3.5" />
            <span>写真を撮る</span>
          </button>
          <button
            onClick={() => setActiveTab("video")}
            className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 text-xs font-semibold rounded-lg transition-all cursor-pointer ${
              activeTab === "video"
                ? `bg-white text-indigo-600 shadow-xs border border-slate-200/50`
                : "text-slate-500 hover:text-slate-700 hover:bg-slate-100"
            }`}
          >
            <Video className="w-3.5 h-3.5" />
            <span>動画を撮る</span>
          </button>
          <button
            onClick={() => setActiveTab("audio")}
            className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 text-xs font-semibold rounded-lg transition-all cursor-pointer ${
              activeTab === "audio"
                ? `bg-white text-indigo-600 shadow-xs border border-slate-200/50`
                : "text-slate-500 hover:text-slate-700 hover:bg-slate-100"
            }`}
          >
            <Mic className="w-3.5 h-3.5" />
            <span>声で入力 (録音)</span>
          </button>
        </div>

        {/* Content Panel */}
        <div className="flex-1 p-3 sm:p-5 overflow-y-auto flex flex-col justify-start sm:justify-center min-h-[250px]">
          
          {/* Camera Settings Switcher bar */}
          {isOpen && (activeTab === "photo" || activeTab === "video") && (!capturedPhotoUrl && !recordedVideoUrl) && (
            <div className="mb-4 bg-slate-50 border border-slate-200/60 p-2.5 rounded-xl flex flex-col gap-2 shadow-2xs">
              <div className="flex flex-wrap items-center justify-between sm:justify-start gap-1.5 w-full">
                <div className="flex items-center gap-1.5">
                  <Camera className="w-4 h-4 text-indigo-500 animate-pulse" />
                  <span className="text-xs font-bold text-slate-700">カメラ調整・切り替え</span>
                </div>
                {/* Always visible Camera Toggle Button for mobile/tablet */}
                <button
                  onClick={handleToggleCamera}
                  className="sm:hidden flex items-center gap-1 text-[11px] font-bold px-2.5 py-1.5 bg-indigo-50 text-indigo-600 border border-indigo-100 rounded-lg transition-colors cursor-pointer active:scale-95 shadow-2xs shrink-0"
                  title="カメラを切り替える (イン/アウト)"
                >
                  <RefreshCw className="w-3 h-3 text-indigo-500" />
                  カメラ切替
                </button>
              </div>
              <div className="flex flex-wrap items-center gap-1.5 w-full sm:justify-end">
                {/* Camera switcher button for Desktop/Larger screen */}
                <button
                  onClick={handleToggleCamera}
                  className="hidden sm:flex items-center gap-1.5 text-xs font-bold px-3 py-1.5 bg-indigo-50 text-indigo-600 border border-indigo-100 rounded-lg transition-colors cursor-pointer active:scale-95 shadow-2xs shrink-0"
                  title="カメラを切り替える (イン/アウト)"
                >
                  <RefreshCw className="w-3.5 h-3.5 text-indigo-500" />
                  <span>カメラ切り替え</span>
                </button>

                {videoDevices.length > 1 && (
                  <select
                    value={selectedCameraId}
                    onChange={(e) => handleCameraChange(e.target.value)}
                    className="flex-1 sm:flex-initial min-w-[90px] max-w-[150px] sm:max-w-[200px] bg-white border border-slate-200 rounded-lg text-xs py-1.5 px-2 focus:outline-none text-slate-700 font-medium font-sans cursor-pointer shadow-2xs"
                  >
                    {videoDevices.map((device, idx) => (
                      <option key={device.deviceId} value={device.deviceId}>
                        {device.label || `カメラ ${idx + 1}`}
                      </option>
                    ))}
                  </select>
                )}
                
                <button
                  onClick={() => setIsMirrored(prev => !prev)}
                  className="text-xs px-2.5 py-1.5 bg-white hover:bg-slate-100 border border-slate-200 rounded-lg font-bold text-slate-600 transition-colors shrink-0 cursor-pointer shadow-2xs flex-1 sm:flex-initial text-center justify-center"
                  title="プレビューの左右を反転"
                >
                  鏡像: {isMirrored ? "反転" : "標準"}
                </button>

                <button
                  onClick={() => {
                    if (hasTorch) {
                      setIsTorchOn(prev => !prev);
                    }
                  }}
                  disabled={!hasTorch}
                  className={`text-xs px-2.5 py-1.5 border rounded-lg font-bold transition-colors shrink-0 flex items-center justify-center gap-1.5 shadow-2xs cursor-pointer flex-1 sm:flex-initial ${
                    hasTorch
                      ? isTorchOn
                        ? "bg-amber-100 border-amber-300 text-amber-700 hover:bg-amber-200"
                        : "bg-white hover:bg-slate-100 border-slate-200 text-slate-600"
                      : "bg-slate-100 border-slate-200 text-slate-400 cursor-not-allowed opacity-60"
                  }`}
                  title={hasTorch ? "ライト(フラッシュ)をオン/オフ" : "このデバイス/カメラはライトをサポートしていません"}
                >
                  {isTorchOn ? <Zap className="w-3.5 h-3.5 fill-amber-500 text-amber-600" /> : <ZapOff className="w-3.5 h-3.5" />}
                  <span>ライト: {hasTorch ? (isTorchOn ? "オン" : "オフ") : "非対応"}</span>
                </button>
              </div>
            </div>
          )}

          {/* Active Tab Views */}
          
          {/* TAB 1: PHOTO */}
          {activeTab === "photo" && (
            <div className="space-y-4">
              {!capturedPhotoUrl ? (
                <div className="space-y-3">
                  <div className="relative rounded-xl overflow-hidden bg-slate-900 aspect-[3/4] sm:aspect-video flex items-center justify-center border border-slate-800 shadow-inner select-none">
                    <video
                      ref={videoRef}
                      autoPlay
                      playsInline
                      muted
                      style={{ transform: `${isMirrored ? "scaleX(-1)" : ""} scale(${zoom})` }}
                      className="w-full h-full object-cover transition-transform duration-100 ease-out"
                    />
                    
                    {/* Floating Zoom Indicator Pill */}
                    <div className="absolute top-3 right-3 z-10 bg-black/60 backdrop-blur-md border border-white/10 px-2.5 py-1 rounded-full flex items-center gap-1.5 text-white shadow-md pointer-events-none">
                      <ZoomOut className="w-3 h-3 text-white/70" />
                      <span className="text-[10px] font-mono font-bold tracking-wider">{zoom.toFixed(1)}x</span>
                      <ZoomIn className="w-3 h-3 text-white/70" />
                    </div>

                    <div className="absolute bottom-4 left-0 right-0 flex justify-center z-20">
                      <button
                        onClick={handleCapturePhoto}
                        className="bg-white hover:bg-slate-100 text-slate-800 p-3.5 rounded-full shadow-lg transition-all hover:scale-105 active:scale-95 border-2 border-indigo-500 cursor-pointer flex items-center justify-center"
                        title="写真を撮影"
                      >
                        <Camera className="w-5 h-5 text-indigo-600" />
                      </button>
                    </div>
                  </div>

                  {/* Zoom Slider Control Block */}
                  <div className="bg-slate-50 border border-slate-200/60 p-3 rounded-xl space-y-2 shadow-2xs">
                    <div className="flex items-center justify-between text-xs font-bold text-slate-600">
                      <div className="flex items-center gap-1">
                        <ZoomOut className="w-3.5 h-3.5 text-slate-500" />
                        <span>ズーム倍率調整 (画面ズームと干渉しません)</span>
                      </div>
                      <span className="font-mono bg-indigo-50 text-indigo-700 px-2.5 py-0.5 rounded-full border border-indigo-100 text-xs">
                        {zoom.toFixed(1)}x
                      </span>
                    </div>
                    
                    <div className="flex items-center gap-3">
                      <button 
                        onClick={() => setZoom(prev => Math.max(1, parseFloat((prev - 0.2).toFixed(1))))}
                        className="p-1.5 bg-white border border-slate-200 hover:bg-slate-50 rounded-lg text-slate-600 shadow-2xs active:scale-90 transition-transform cursor-pointer"
                        title="ズームアウト"
                      >
                        <ZoomOut className="w-4 h-4" />
                      </button>
                      
                      <input
                        type="range"
                        min="1"
                        max="4"
                        step="0.1"
                        value={zoom}
                        onChange={(e) => setZoom(parseFloat(e.target.value))}
                        className="flex-1 h-1.5 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-indigo-600 focus:outline-none"
                      />
                      
                      <button 
                        onClick={() => setZoom(prev => Math.min(4, parseFloat((prev + 0.2).toFixed(1))))}
                        className="p-1.5 bg-white border border-slate-200 hover:bg-slate-50 rounded-lg text-slate-600 shadow-2xs active:scale-90 transition-transform cursor-pointer"
                        title="ズームイン"
                      >
                        <ZoomIn className="w-4 h-4" />
                      </button>
                    </div>

                    {/* Quick presets buttons */}
                    <div className="flex gap-2 pt-1 justify-center">
                      {[1, 1.5, 2, 3, 4].map((zVal) => (
                        <button
                          key={zVal}
                          onClick={() => setZoom(zVal)}
                          className={`flex-1 py-1 px-2.5 text-xs font-mono font-bold rounded-lg border transition-all cursor-pointer ${
                            Math.abs(zoom - zVal) < 0.05
                              ? "bg-indigo-600 border-indigo-600 text-white shadow-xs"
                              : "bg-white border-slate-200 text-slate-600 hover:bg-slate-50"
                          }`}
                        >
                          {zVal}x
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="rounded-xl overflow-hidden bg-slate-100 border border-slate-200 aspect-[3/4] sm:aspect-video flex items-center justify-center relative shadow-sm">
                    <img
                      src={capturedPhotoUrl}
                      alt="Captured Preview"
                      className="w-full h-full object-contain"
                    />
                    <button
                      onClick={() => {
                        clearPreviews();
                        initTabStream("photo");
                      }}
                      className="absolute top-2 right-2 bg-slate-900/80 hover:bg-slate-900 text-white p-2 rounded-lg text-xs flex items-center gap-1 transition-colors cursor-pointer"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      <span>撮り直す</span>
                    </button>
                  </div>

                  <div className="flex justify-end gap-2">
                    <button
                      onClick={() => handleProcessWithAI(capturedPhotoBlob, "画像", "jpg")}
                      disabled={isAnalyzing}
                      className={`w-full flex items-center justify-center gap-2 py-2.5 px-4 text-white font-semibold text-xs rounded-xl shadow-md transition-all cursor-pointer ${activeTheme.accentBg} ${activeTheme.accentBgHover} disabled:opacity-50`}
                    >
                      <Check className="w-4 h-4" />
                      <span>AIで解析して新規メモを作成</span>
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* TAB 2: VIDEO */}
          {activeTab === "video" && (
            <div className="space-y-4">
              {!recordedVideoUrl ? (
                <div className="space-y-3">
                  <div className="relative rounded-xl overflow-hidden bg-slate-900 aspect-[3/4] sm:aspect-video flex items-center justify-center border border-slate-800 shadow-inner select-none">
                    <video
                      ref={videoRef}
                      autoPlay
                      playsInline
                      muted
                      style={{ transform: `${isMirrored ? "scaleX(-1)" : ""} scale(${zoom})` }}
                      className="w-full h-full object-cover transition-transform duration-100 ease-out"
                    />
                    
                    {isRecording && (
                      <div className="absolute top-3 left-3 z-20 bg-red-600/95 text-white text-[10px] font-bold px-2.5 py-1 rounded-full flex items-center gap-1.5 shadow-sm animate-pulse pointer-events-none">
                        <span className="w-2 h-2 rounded-full bg-white block" />
                        <span>REC {formatTime(recordingSeconds)}</span>
                      </div>
                    )}

                    {/* Floating Zoom Indicator Pill */}
                    <div className="absolute top-3 right-3 z-10 bg-black/60 backdrop-blur-md border border-white/10 px-2.5 py-1 rounded-full flex items-center gap-1.5 text-white shadow-md pointer-events-none">
                      <ZoomOut className="w-3 h-3 text-white/70" />
                      <span className="text-[10px] font-mono font-bold tracking-wider">{zoom.toFixed(1)}x</span>
                      <ZoomIn className="w-3 h-3 text-white/70" />
                    </div>

                    <div className="absolute bottom-4 left-0 right-0 flex justify-center z-20">
                      {!isRecording ? (
                        <button
                          onClick={handleStartVideoRecording}
                          className="bg-red-600 hover:bg-red-700 text-white p-3.5 rounded-full shadow-lg transition-all hover:scale-105 active:scale-95 cursor-pointer flex items-center justify-center border-2 border-white"
                          title="ビデオ録画開始"
                        >
                          <Video className="w-5 h-5 text-white" />
                        </button>
                      ) : (
                        <button
                          onClick={handleStopVideoRecording}
                          className="bg-slate-900 hover:bg-black text-white p-3.5 rounded-full shadow-lg transition-all hover:scale-105 active:scale-95 cursor-pointer flex items-center justify-center border-2 border-white"
                          title="録画停止"
                        >
                          <Square className="w-5 h-5 text-red-500 fill-red-500" />
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Zoom Slider Control Block */}
                  <div className="bg-slate-50 border border-slate-200/60 p-3 rounded-xl space-y-2 shadow-2xs">
                    <div className="flex items-center justify-between text-xs font-bold text-slate-600">
                      <div className="flex items-center gap-1">
                        <ZoomOut className="w-3.5 h-3.5 text-slate-500" />
                        <span>ズーム倍率調整 (画面ズームと干渉しません)</span>
                      </div>
                      <span className="font-mono bg-indigo-50 text-indigo-700 px-2.5 py-0.5 rounded-full border border-indigo-100 text-xs">
                        {zoom.toFixed(1)}x
                      </span>
                    </div>
                    
                    <div className="flex items-center gap-3">
                      <button 
                        onClick={() => setZoom(prev => Math.max(1, parseFloat((prev - 0.2).toFixed(1))))}
                        className="p-1.5 bg-white border border-slate-200 hover:bg-slate-50 rounded-lg text-slate-600 shadow-2xs active:scale-90 transition-transform cursor-pointer"
                        title="ズームアウト"
                      >
                        <ZoomOut className="w-4 h-4" />
                      </button>
                      
                      <input
                        type="range"
                        min="1"
                        max="4"
                        step="0.1"
                        value={zoom}
                        onChange={(e) => setZoom(parseFloat(e.target.value))}
                        className="flex-1 h-1.5 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-indigo-600 focus:outline-none"
                      />
                      
                      <button 
                        onClick={() => setZoom(prev => Math.min(4, parseFloat((prev + 0.2).toFixed(1))))}
                        className="p-1.5 bg-white border border-slate-200 hover:bg-slate-50 rounded-lg text-slate-600 shadow-2xs active:scale-90 transition-transform cursor-pointer"
                        title="ズームイン"
                      >
                        <ZoomIn className="w-4 h-4" />
                      </button>
                    </div>

                    {/* Quick presets buttons */}
                    <div className="flex gap-2 pt-1 justify-center">
                      {[1, 1.5, 2, 3, 4].map((zVal) => (
                        <button
                          key={zVal}
                          onClick={() => setZoom(zVal)}
                          className={`flex-1 py-1 px-2.5 text-xs font-mono font-bold rounded-lg border transition-all cursor-pointer ${
                            Math.abs(zoom - zVal) < 0.05
                              ? "bg-indigo-600 border-indigo-600 text-white shadow-xs"
                              : "bg-white border-slate-200 text-slate-600 hover:bg-slate-50"
                          }`}
                        >
                          {zVal}x
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="rounded-xl overflow-hidden bg-slate-100 border border-slate-200 aspect-[3/4] sm:aspect-video flex items-center justify-center relative shadow-sm">
                    <video
                      src={recordedVideoUrl}
                      controls
                      className="w-full h-full object-contain"
                    />
                    <button
                      onClick={() => {
                        clearPreviews();
                        initTabStream("video");
                      }}
                      className="absolute top-2 right-2 bg-slate-900/80 hover:bg-slate-900 text-white p-2 rounded-lg text-xs flex items-center gap-1 transition-colors cursor-pointer"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      <span>撮り直す</span>
                    </button>
                  </div>

                  <div className="flex justify-end gap-2">
                    <button
                      onClick={() => handleProcessWithAI(recordedVideoBlob, "動画", "webm")}
                      disabled={isAnalyzing}
                      className={`w-full flex items-center justify-center gap-2 py-2.5 px-4 text-white font-semibold text-xs rounded-xl shadow-md transition-all cursor-pointer ${activeTheme.accentBg} ${activeTheme.accentBgHover} disabled:opacity-50`}
                    >
                      <Check className="w-4 h-4" />
                      <span>動画をAIで文字起こし＆分析</span>
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* TAB 3: AUDIO */}
          {activeTab === "audio" && (
            <div className="space-y-4">
              {!recordedAudioUrl ? (
                <div className="rounded-xl border-2 border-dashed border-slate-200 p-8 flex flex-col items-center justify-center bg-slate-50 aspect-video">
                  
                  {isRecording ? (
                    <div className="space-y-6 text-center">
                      <div className="flex justify-center items-center gap-1.5 h-10">
                        <span className="w-1.5 h-4 bg-indigo-500 rounded-full animate-bounce" style={{ animationDelay: "0ms" }} />
                        <span className="w-1.5 h-8 bg-indigo-600 rounded-full animate-bounce" style={{ animationDelay: "150ms" }} />
                        <span className="w-1.5 h-10 bg-indigo-700 rounded-full animate-bounce" style={{ animationDelay: "300ms" }} />
                        <span className="w-1.5 h-6 bg-indigo-600 rounded-full animate-bounce" style={{ animationDelay: "450ms" }} />
                        <span className="w-1.5 h-3 bg-indigo-500 rounded-full animate-bounce" style={{ animationDelay: "600ms" }} />
                      </div>
                      <div className="space-y-1">
                        <p className="text-sm font-semibold text-indigo-700">音声を録音中...</p>
                        <p className="text-xl font-mono font-bold text-slate-800">{formatTime(recordingSeconds)}</p>
                      </div>
                      <button
                        onClick={handleStopAudioRecording}
                        className="mx-auto bg-slate-800 hover:bg-slate-900 text-white p-3.5 rounded-full shadow-lg transition-all hover:scale-105 active:scale-95 cursor-pointer flex items-center justify-center border-2 border-white"
                        title="録音停止"
                      >
                        <Square className="w-5 h-5 text-red-500 fill-red-500" />
                      </button>
                    </div>
                  ) : (
                    <div className="text-center space-y-4">
                      <div className="w-14 h-14 bg-indigo-50 rounded-full flex items-center justify-center mx-auto text-indigo-600">
                        <Mic className="w-6 h-6" />
                      </div>
                      <div className="space-y-1">
                        <p className="text-xs font-semibold text-slate-700">マイクに向かって話してください</p>
                        <p className="text-[10px] text-slate-400">講義、インタビュー、アイデアの音声録音をMarkdown化します</p>
                      </div>
                      <button
                        onClick={handleStartAudioRecording}
                        className={`mx-auto flex items-center gap-1.5 text-white text-xs font-semibold px-4 py-2.5 rounded-xl shadow-md transition-all cursor-pointer ${activeTheme.accentBg} ${activeTheme.accentBgHover}`}
                      >
                        <Mic className="w-4 h-4" />
                        <span>録音を開始する</span>
                      </button>
                    </div>
                  )}
                  
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="rounded-xl border border-slate-200 p-6 flex flex-col items-center justify-center bg-slate-50 aspect-video relative">
                    <div className="w-12 h-12 bg-emerald-50 rounded-full flex items-center justify-center text-emerald-600 mb-3">
                      <Check className="w-5 h-5" />
                    </div>
                    <p className="text-xs font-semibold text-slate-700 mb-4">録音が正常に完了しました</p>
                    <audio
                      src={recordedAudioUrl}
                      controls
                      className="w-full max-w-xs"
                    />
                    <button
                      onClick={() => {
                        clearPreviews();
                        initTabStream("audio");
                      }}
                      className="absolute top-2 right-2 bg-slate-900/80 hover:bg-slate-900 text-white p-2 rounded-lg text-xs flex items-center gap-1 transition-colors cursor-pointer"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      <span>録音し直す</span>
                    </button>
                  </div>

                  <div className="flex justify-end gap-2">
                    <button
                      onClick={() => handleProcessWithAI(recordedAudioBlob, "音声", "webm")}
                      disabled={isAnalyzing}
                      className={`w-full flex items-center justify-center gap-2 py-2.5 px-4 text-white font-semibold text-xs rounded-xl shadow-md transition-all cursor-pointer ${activeTheme.accentBg} ${activeTheme.accentBgHover} disabled:opacity-50`}
                    >
                      <Check className="w-4 h-4" />
                      <span>音声をAIで書き起こし・Markdown化</span>
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ERROR DISPLAY */}
          {analysisError && (
            <div className="mt-4 p-3.5 bg-rose-50 border border-rose-100 rounded-xl flex items-start gap-2 text-xs text-rose-700 animate-in fade-in">
              <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
              <div>
                <p className="font-semibold text-rose-800">エラーが発生しました</p>
                <p className="mt-0.5 text-rose-600 leading-normal">{analysisError}</p>
              </div>
            </div>
          )}

        </div>

        {/* LOADING SHIELD */}
        {isAnalyzing && (
          <div className="absolute inset-0 bg-slate-900/80 backdrop-blur-xs flex flex-col items-center justify-center p-6 text-white text-center animate-in fade-in duration-200 z-50">
            <RefreshCw className="w-8 h-8 animate-spin text-indigo-400 mb-4" />
            <p className="text-sm font-semibold text-slate-100">AIがマルチメディアデータを解析中...</p>
            <p className="text-[11px] text-slate-400 mt-2 max-w-xs leading-normal">
              動画・音声の書き起こしや画像認識、PDFからのコンテンツ抽出を行っています。完了するまでブラウザを閉じずにお待ちください。
            </p>
          </div>
        )}

      </div>
    </div>
  );
}
