"use client";

import React, { useState, useRef } from "react";
import { getCsrfToken } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { EventImage } from "@/types";
import {
  AlertCircle,
  CloudUpload,
  Image as ImageIcon,
  Link as LinkIcon,
  Loader2,
  Trash2,
  Upload,
  CheckCircle2,
  RefreshCw,
} from "lucide-react";
import { getApiBaseUrl } from "@/lib/env";

interface ImageUploadFieldProps {
  value?: EventImage | string;
  onChange: (image: EventImage) => void;
  error?: string;
  disabled?: boolean;
  eventId?: string;
}

export function ImageUploadField({
  value,
  onChange,
  error,
  disabled = false,
  eventId,
}: ImageUploadFieldProps) {
  // Normalize initial value
  const initialImage: EventImage =
    typeof value === "string"
      ? { source: "URL", url: value, publicId: null }
      : value || { source: "URL", url: "", publicId: null };

  const [activeTab, setActiveTab] = useState<"UPLOAD" | "URL">(
    initialImage.source === "CLOUDINARY" ? "UPLOAD" : "URL"
  );
  const [urlInput, setUrlInput] = useState(initialImage.url || "");
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [imagePreviewError, setImagePreviewError] = useState(false);
  const [isDragOver, setIsDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const currentUrl =
    activeTab === "UPLOAD"
      ? initialImage.source === "CLOUDINARY"
        ? initialImage.url
        : ""
      : urlInput;

  // Handle URL input change
  const handleUrlChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newUrl = e.target.value;
    setUrlInput(newUrl);
    setImagePreviewError(false);
    setUploadError(null);
    onChange({
      source: "URL",
      url: newUrl,
      publicId: null,
    });
  };

  // Upload file exclusively via authenticated Eventora backend API
  const uploadToBackend = async (file: File) => {
    const validFormats = ["image/jpeg", "image/png", "image/webp"];
    if (!validFormats.includes(file.type)) {
      setUploadError("Only JPEG, PNG, and WebP images are permitted.");
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      setUploadError("File size cannot exceed 5MB.");
      return;
    }

    setIsUploading(true);
    setUploadProgress(10);
    setUploadError(null);

    // Create temporary local preview for immediate visual feedback
    const previewUrl = URL.createObjectURL(file);

    try {
      const csrfToken = await getCsrfToken();
      const formData = new FormData();
      formData.append("banner", file);

      const baseUrl = getApiBaseUrl();
      const endpoint = eventId
        ? `${baseUrl}/events/${eventId}/banner`
        : `${baseUrl}/events/banner`;

      const xhr = new XMLHttpRequest();

      const uploadPromise = new Promise<{
        banner: {
          url: string;
          publicId: string;
          format?: string;
          width?: number;
          height?: number;
          bytes?: number;
        };
      }>((resolve, reject) => {
        xhr.upload.addEventListener("progress", (evt) => {
          if (evt.lengthComputable) {
            const percent = Math.round((evt.loaded / evt.total) * 90);
            setUploadProgress(Math.min(95, percent));
          }
        });

        xhr.onreadystatechange = () => {
          if (xhr.readyState === 4) {
            try {
              const res = JSON.parse(xhr.responseText);
              if (xhr.status >= 200 && xhr.status < 300 && res.success) {
                resolve(res.data);
              } else {
                const message =
                  res.error?.message ||
                  res.message ||
                  `Upload rejected by server (HTTP ${xhr.status})`;
                reject(new Error(message));
              }
            } catch {
              reject(
                new Error(`Upload failed with server status ${xhr.status}`)
              );
            }
          }
        };

        xhr.onerror = () => {
          reject(new Error("Network connection error during file upload"));
        };

        xhr.open("POST", endpoint, true);
        xhr.withCredentials = true;
        if (csrfToken) {
          xhr.setRequestHeader("X-CSRF-Token", csrfToken);
        }
        // Note: Do NOT set Content-Type header on xhr - let the browser set boundary for multipart FormData!
        xhr.send(formData);
      });

      const data = await uploadPromise;
      setUploadProgress(100);

      onChange({
        source: "CLOUDINARY",
        url: data.banner.url,
        publicId: data.banner.publicId,
        format: data.banner.format || null,
        width: data.banner.width || null,
        height: data.banner.height || null,
        bytes: data.banner.bytes || null,
      });
      setImagePreviewError(false);
    } catch (err: unknown) {
      const errorObj = err as Error;
      setUploadError(
        errorObj.message ||
          "Backend upload failed. You can also provide an image URL directly."
      );
    } finally {
      URL.revokeObjectURL(previewUrl);
      setIsUploading(false);
      setTimeout(() => setUploadProgress(null), 1000);
    }
  };

  const handleFileDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    if (disabled || isUploading) return;

    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      uploadToBackend(e.dataTransfer.files[0]);
    }
  };

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      uploadToBackend(e.target.files[0]);
    }
  };

  const handleRemoveImage = () => {
    setUrlInput("");
    setImagePreviewError(false);
    setUploadError(null);
    onChange({
      source: activeTab === "UPLOAD" ? "CLOUDINARY" : "URL",
      url: "",
      publicId: null,
    });
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <label className="text-xs font-semibold text-foreground">
          Event Banner Image
        </label>
        {/* Toggle Mode: Upload vs Image URL */}
        <div className="inline-flex rounded-lg border border-border bg-muted/40 p-0.5 text-xs">
          <button
            type="button"
            onClick={() => {
              setActiveTab("UPLOAD");
              setUploadError(null);
            }}
            className={`inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium transition-all ${
              activeTab === "UPLOAD"
                ? "bg-background text-foreground shadow-xs font-semibold"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <CloudUpload className="h-3.5 w-3.5" />
            Upload Image
          </button>
          <button
            type="button"
            onClick={() => {
              setActiveTab("URL");
              setUploadError(null);
            }}
            className={`inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium transition-all ${
              activeTab === "URL"
                ? "bg-background text-foreground shadow-xs font-semibold"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <LinkIcon className="h-3.5 w-3.5" />
            Use Image URL
          </button>
        </div>
      </div>

      {/* Option A: Upload Image (Drag-and-Drop via Eventora Backend) */}
      {activeTab === "UPLOAD" && (
        <div className="space-y-3">
          <input
            ref={fileInputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            onChange={handleFileInputChange}
            className="hidden"
            disabled={disabled || isUploading}
          />

          {!currentUrl ? (
            <div
              onDragOver={(e) => {
                e.preventDefault();
                setIsDragOver(true);
              }}
              onDragLeave={() => setIsDragOver(false)}
              onDrop={handleFileDrop}
              onClick={() => fileInputRef.current?.click()}
              className={`flex flex-col items-center justify-center p-6 border-2 border-dashed rounded-xl cursor-pointer transition-colors text-center ${
                isDragOver
                  ? "border-primary bg-primary/5"
                  : "border-border hover:border-foreground/40 bg-card/40 hover:bg-card/70"
              }`}
            >
              <div className="h-10 w-10 rounded-full bg-muted flex items-center justify-center text-muted-foreground mb-3">
                {isUploading ? (
                  <Loader2 className="h-5 w-5 animate-spin text-primary" />
                ) : (
                  <Upload className="h-5 w-5" />
                )}
              </div>

              {isUploading ? (
                <div className="space-y-2 w-full max-w-xs">
                  <p className="text-xs font-medium text-foreground">
                    Uploading to server...
                  </p>
                  <div className="w-full h-1.5 bg-muted rounded-full overflow-hidden">
                    <div
                      className="h-full bg-primary transition-all duration-300 rounded-full"
                      style={{ width: `${uploadProgress || 10}%` }}
                    />
                  </div>
                  <p className="text-[10px] text-muted-foreground">
                    {uploadProgress || 10}% completed
                  </p>
                </div>
              ) : (
                <>
                  <p className="text-xs font-medium text-foreground mb-1">
                    Drag and drop an image here, or{" "}
                    <span className="text-primary underline">browse files</span>
                  </p>
                  <p className="text-[11px] text-muted-foreground">
                    Supports JPEG, PNG, and WebP (up to 5MB)
                  </p>
                </>
              )}
            </div>
          ) : (
            <div className="relative rounded-xl border border-border bg-card overflow-hidden">
              <div className="relative aspect-[16/9] w-full bg-muted">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={currentUrl}
                  alt="Event Banner Preview"
                  className="h-full w-full object-cover"
                  onError={() => setImagePreviewError(true)}
                />
                <div className="absolute top-2 right-2 flex items-center gap-1.5">
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={disabled || isUploading}
                    className="h-7 px-2.5 text-[11px] gap-1 shadow-sm backdrop-blur-md bg-background/80"
                  >
                    <RefreshCw className="h-3 w-3" />
                    Replace
                  </Button>
                  <Button
                    type="button"
                    variant="destructive"
                    size="sm"
                    onClick={handleRemoveImage}
                    disabled={disabled || isUploading}
                    className="h-7 px-2.5 text-[11px] gap-1 shadow-sm"
                  >
                    <Trash2 className="h-3 w-3" />
                    Remove
                  </Button>
                </div>
                <div className="absolute bottom-2 left-2 flex items-center gap-1 bg-background/80 backdrop-blur-md px-2 py-0.5 rounded text-[10px] text-emerald-500 font-medium border border-border/50">
                  <CheckCircle2 className="h-3 w-3" />
                  Verified Cloud Asset
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Option B: Enter Image URL */}
      {activeTab === "URL" && (
        <div className="space-y-3">
          <div className="relative">
            <LinkIcon className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              type="url"
              placeholder="https://images.unsplash.com/photo-..."
              value={urlInput}
              onChange={handleUrlChange}
              disabled={disabled}
              className="pl-9 text-xs"
            />
            {urlInput && (
              <button
                type="button"
                onClick={handleRemoveImage}
                className="absolute right-3 top-2.5 text-muted-foreground hover:text-foreground"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            )}
          </div>

          {/* URL Image Live Preview */}
          {urlInput && (
            <div className="relative rounded-xl border border-border bg-card overflow-hidden">
              <div className="relative aspect-[16/9] w-full bg-muted flex items-center justify-center">
                {imagePreviewError ? (
                  <div className="text-center p-6 space-y-1">
                    <ImageIcon className="h-8 w-8 text-muted-foreground mx-auto" />
                    <p className="text-xs text-destructive font-medium">
                      Unable to load preview from this URL
                    </p>
                    <p className="text-[10px] text-muted-foreground">
                      Ensure the URL points directly to an accessible image file.
                    </p>
                  </div>
                ) : (
                  /* eslint-disable-next-line @next/next/no-img-element */
                  <img
                    src={urlInput}
                    alt="URL Banner Preview"
                    className="h-full w-full object-cover"
                    onError={() => setImagePreviewError(true)}
                  />
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Upload or Validation Error Feedback */}
      {(uploadError || error) && (
        <div className="flex items-center gap-1.5 text-[11px] text-destructive">
          <AlertCircle className="h-3.5 w-3.5 shrink-0" />
          <span>{uploadError || error}</span>
        </div>
      )}
    </div>
  );
}
