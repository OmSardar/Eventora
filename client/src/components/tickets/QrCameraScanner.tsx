"use client";

import React, { useState, useEffect, useRef, useCallback } from "react";
import { Button } from "@/components/ui/button";
import {
  Camera,
  CameraOff,
  Flashlight,
  FlashlightOff,
  FlipHorizontal,
  Image as ImageIcon,
  Loader2,
  RefreshCw,
  ShieldAlert,
  Sparkles,
  X,
} from "lucide-react";

interface QrCameraScannerProps {
  onScan: (decodedText: string) => void;
  isPaused?: boolean;
}

export function QrCameraScanner({ onScan, isPaused = false }: QrCameraScannerProps) {
  const [isScanning, setIsScanning] = useState(false);
  const [startingCamera, setStartingCamera] = useState(false);
  const [cameras, setCameras] = useState<Array<{ id: string; label: string }>>([]);
  const [selectedCameraId, setSelectedCameraId] = useState<string>("");
  const [hasTorch, setHasTorch] = useState(false);
  const [isTorchOn, setIsTorchOn] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isProcessingFile, setIsProcessingFile] = useState(false);

  const scannerRef = useRef<any>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const containerId = "eventora-qr-scanner-viewport";
  const lastScannedRef = useRef<string>("");
  const lastScannedTimeRef = useRef<number>(0);

  // Stop scanner safely
  const stopScanner = useCallback(async () => {
    if (scannerRef.current) {
      try {
        if (scannerRef.current.isScanning) {
          await scannerRef.current.stop();
        }
        await scannerRef.current.clear();
      } catch (err) {
        console.warn("Error while stopping QR scanner:", err);
      } finally {
        scannerRef.current = null;
        setIsScanning(false);
        setHasTorch(false);
        setIsTorchOn(false);
      }
    }
  }, []);

  // Handle successful scan with debounce & haptic feedback
  const handleScanSuccess = useCallback(
    (decodedText: string) => {
      const now = Date.now();
      // Debounce identical scans within 2.5 seconds
      if (lastScannedRef.current === decodedText && now - lastScannedTimeRef.current < 2500) {
        return;
      }
      lastScannedRef.current = decodedText;
      lastScannedTimeRef.current = now;

      // Haptic feedback for mobile devices
      if (typeof window !== "undefined" && "vibrate" in navigator) {
        try {
          navigator.vibrate([80, 40, 80]);
        } catch (_) {}
      }

      onScan(decodedText);
    },
    [onScan]
  );

  // Start mobile camera scanner
  const startScanner = useCallback(
    async (cameraIdOrConfig?: string | { facingMode: string }) => {
      setStartingCamera(true);
      setErrorMessage(null);

      try {
        // Dynamic import to avoid SSR issues
        const { Html5Qrcode } = await import("html5-qrcode");

        // Stop any existing instance
        await stopScanner();

        // Ensure container exists in DOM
        const container = document.getElementById(containerId);
        if (!container) {
          throw new Error("Scanner viewport container not found in DOM.");
        }

        const html5QrCode = new Html5Qrcode(containerId);
        scannerRef.current = html5QrCode;

        // Query available cameras
        try {
          const devices = await Html5Qrcode.getCameras();
          if (devices && devices.length > 0) {
            setCameras(devices.map((d) => ({ id: d.id, label: d.label || `Camera ${d.id.slice(0, 4)}` })));
          }
        } catch (_) {
          // Camera listing might fail before permission is granted; ignore
        }

        const cameraConfig =
          cameraIdOrConfig ||
          (selectedCameraId ? selectedCameraId : { facingMode: "environment" });

        const config = {
          fps: 15,
          qrbox: (viewfinderWidth: number, viewfinderHeight: number) => {
            const minEdge = Math.min(viewfinderWidth, viewfinderHeight);
            const edgeSize = Math.floor(minEdge * 0.72);
            return {
              width: Math.max(220, edgeSize),
              height: Math.max(220, edgeSize),
            };
          },
          aspectRatio: 1.0,
        };

        await html5QrCode.start(
          cameraConfig,
          config,
          (decodedText: string) => {
            handleScanSuccess(decodedText);
          },
          () => {
            // Normal frame parse failures while scanning, ignore
          }
        );

        setIsScanning(true);

        // Check torch capability
        try {
          const track = (html5QrCode as any).getRunningTrack?.();
          const capabilities = track?.getCapabilities?.();
          if (capabilities && "torch" in capabilities) {
            setHasTorch(true);
          }
        } catch (_) {}
      } catch (err: any) {
        console.error("Failed to start camera scanner:", err);
        const msg =
          err?.name === "NotAllowedError" || err?.message?.includes("Permission")
            ? "Camera access denied. Please grant camera permission in your mobile browser settings."
            : err?.name === "NotFoundError" || err?.message?.includes("NotFound")
            ? "No working camera found on this device. You can upload a QR image below."
            : err?.message || "Failed to initialize camera. Try uploading an image file instead.";
        setErrorMessage(msg);
        setIsScanning(false);
      } finally {
        setStartingCamera(false);
      }
    },
    [handleScanSuccess, selectedCameraId, stopScanner]
  );

  // Toggle torch / flashlight on mobile
  const toggleTorch = async () => {
    if (!scannerRef.current || !hasTorch) return;
    try {
      const nextTorch = !isTorchOn;
      await scannerRef.current.applyVideoConstraints({
        advanced: [{ torch: nextTorch }],
      });
      setIsTorchOn(nextTorch);
    } catch (err) {
      console.warn("Failed to toggle flashlight:", err);
    }
  };

  // Switch between front and back cameras
  const switchCamera = async () => {
    if (cameras.length <= 1) return;
    const currentIndex = cameras.findIndex((c) => c.id === selectedCameraId);
    const nextIndex = (currentIndex + 1) % cameras.length;
    const nextCamera = cameras[nextIndex];
    setSelectedCameraId(nextCamera.id);
    await startScanner(nextCamera.id);
  };

  // Handle photo/image file upload fallback
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsProcessingFile(true);
    setErrorMessage(null);

    try {
      const { Html5Qrcode } = await import("html5-qrcode");
      const tempScanner = new Html5Qrcode("temp-qr-file-processor");
      const decodedText = await tempScanner.scanFile(file, true);
      tempScanner.clear();

      if (decodedText) {
        handleScanSuccess(decodedText);
      } else {
        setErrorMessage("No valid QR code was detected in the selected image. Please try another photo.");
      }
    } catch (err: any) {
      console.warn("File scan error:", err);
      setErrorMessage("Could not detect a QR code in the uploaded image. Please ensure the code is clear and well-lit.");
    } finally {
      setIsProcessingFile(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  // Clean up on unmount
  useEffect(() => {
    return () => {
      stopScanner();
    };
  }, [stopScanner]);

  return (
    <div className="space-y-4">
      {/* Hidden container for file scan fallback */}
      <div id="temp-qr-file-processor" className="hidden" />

      {/* Main Viewfinder Box */}
      <div className="relative overflow-hidden rounded-2xl border-2 border-border/80 bg-black shadow-xl">
        {/* HTML5 QR Container */}
        <div
          id={containerId}
          className={`w-full aspect-square max-h-[380px] sm:max-h-[420px] transition-opacity duration-200 ${
            isScanning ? "opacity-100" : "opacity-0 absolute pointer-events-none"
          }`}
        />

        {/* Inactive Placeholder when camera is not running */}
        {!isScanning && (
          <div className="flex flex-col items-center justify-center p-8 text-center aspect-square max-h-[380px] bg-gradient-to-b from-card/80 to-card">
            <div className="h-16 w-16 rounded-2xl bg-primary/10 border border-primary/20 text-primary flex items-center justify-center mb-4 shadow-inner">
              <Camera className="h-8 w-8" />
            </div>
            <h3 className="text-base font-bold text-foreground">Mobile Camera Scanner</h3>
            <p className="text-xs text-muted-foreground max-w-xs mt-1 mb-5 leading-relaxed">
              Use your mobile phone or tablet back camera to scan ticket QR codes instantly at venue check-in.
            </p>

            <Button
              onClick={() => startScanner()}
              disabled={startingCamera}
              className="gap-2 h-11 px-6 font-semibold text-xs shadow-md bg-primary hover:bg-primary/90 text-primary-foreground"
            >
              {startingCamera ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span>Accessing Camera...</span>
                </>
              ) : (
                <>
                  <Camera className="h-4 w-4" />
                  <span>Start Camera Scanner</span>
                </>
              )}
            </Button>
          </div>
        )}

        {/* Live HUD Overlay when Camera is Scanning */}
        {isScanning && (
          <div className="absolute inset-0 pointer-events-none flex flex-col justify-between p-4">
            {/* Top Toolbar */}
            <div className="flex items-center justify-between pointer-events-auto">
              <div className="flex items-center gap-1.5 rounded-full bg-black/60 backdrop-blur-md px-3 py-1 text-[11px] font-medium text-white border border-white/10">
                <span className="h-2 w-2 rounded-full bg-emerald-500 animate-ping" />
                <span>Live Viewfinder</span>
              </div>

              <div className="flex items-center gap-1.5">
                {hasTorch && (
                  <Button
                    size="icon"
                    variant="ghost"
                    onClick={toggleTorch}
                    className="h-8 w-8 rounded-full bg-black/60 backdrop-blur-md text-white hover:bg-black/80 border border-white/10"
                    title={isTorchOn ? "Turn off flashlight" : "Turn on flashlight"}
                  >
                    {isTorchOn ? <FlashlightOff className="h-4 w-4 text-amber-400" /> : <Flashlight className="h-4 w-4" />}
                  </Button>
                )}

                {cameras.length > 1 && (
                  <Button
                    size="icon"
                    variant="ghost"
                    onClick={switchCamera}
                    className="h-8 w-8 rounded-full bg-black/60 backdrop-blur-md text-white hover:bg-black/80 border border-white/10"
                    title="Switch Camera"
                  >
                    <FlipHorizontal className="h-4 w-4" />
                  </Button>
                )}

                <Button
                  size="icon"
                  variant="ghost"
                  onClick={stopScanner}
                  className="h-8 w-8 rounded-full bg-black/60 backdrop-blur-md text-white hover:bg-black/80 border border-white/10"
                  title="Close Camera"
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
            </div>

            {/* Target Reticle (Framing Box with glowing corner brackets) */}
            <div className="self-center relative w-56 h-56 sm:w-64 sm:h-64 pointer-events-none">
              {/* Corner brackets */}
              <div className="absolute top-0 left-0 w-8 h-8 border-t-4 border-l-4 border-emerald-400 rounded-tl-lg" />
              <div className="absolute top-0 right-0 w-8 h-8 border-t-4 border-r-4 border-emerald-400 rounded-tr-lg" />
              <div className="absolute bottom-0 left-0 w-8 h-8 border-b-4 border-l-4 border-emerald-400 rounded-bl-lg" />
              <div className="absolute bottom-0 right-0 w-8 h-8 border-b-4 border-r-4 border-emerald-400 rounded-br-lg" />

              {/* Animated Laser Scanning Line */}
              <div className="absolute inset-x-2 h-0.5 bg-gradient-to-r from-transparent via-emerald-400 to-transparent shadow-[0_0_12px_#34d399] animate-[scannerLine_2s_ease-in-out_infinite]" />
            </div>

            {/* Bottom Status Pill */}
            <div className="text-center pointer-events-auto">
              <span className="inline-block rounded-full bg-black/70 backdrop-blur-md px-4 py-1.5 text-[11px] text-white/90 font-medium border border-white/10 shadow-lg">
                Point camera at attendee ticket QR code
              </span>
            </div>
          </div>
        )}
      </div>

      {/* Error Message */}
      {errorMessage && (
        <div className="flex items-start gap-2.5 rounded-xl border border-destructive/30 bg-destructive/10 p-3.5 text-xs text-destructive">
          <ShieldAlert className="h-4 w-4 shrink-0 mt-0.5" />
          <div className="space-y-1">
            <p className="font-semibold">Scanner Notice</p>
            <p className="text-[11px] leading-relaxed text-destructive/90">{errorMessage}</p>
          </div>
        </div>
      )}

      {/* Alternative Options: Photo Snap / File Upload */}
      <div className="flex flex-wrap items-center justify-between gap-2 pt-1 border-t border-border/40">
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          capture="environment"
          onChange={handleFileUpload}
          className="hidden"
          id="qr-file-input"
        />

        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => fileInputRef.current?.click()}
          disabled={isProcessingFile}
          className="text-xs h-9 gap-1.5 flex-1 sm:flex-initial"
        >
          {isProcessingFile ? (
            <>
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              <span>Scanning Image...</span>
            </>
          ) : (
            <>
              <ImageIcon className="h-3.5 w-3.5 text-muted-foreground" />
              <span>Upload or Snap Photo</span>
            </>
          )}
        </Button>

        {isScanning && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={stopScanner}
            className="text-xs h-9 gap-1 text-muted-foreground hover:text-foreground"
          >
            <CameraOff className="h-3.5 w-3.5" />
            <span>Pause Camera</span>
          </Button>
        )}
      </div>
    </div>
  );
}

