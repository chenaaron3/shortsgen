"use client";

import Head from "next/head";
import Link from "next/link";
import { CheckCircle2, Loader2, Upload, X } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { useDropzone } from "react-dropzone";

import { AuthRequiredLayout } from "~/components/layouts/AuthRequiredLayout";
import { Button } from "~/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "~/components/ui/card";
import { Textarea } from "~/components/ui/textarea";
import {
  DEFAULT_MASCOT_DESCRIPTION,
  DEFAULT_MASCOT_IMAGE_SRC,
  DEFAULT_STYLE_PROMPT,
} from "~/lib/brandDefaults";
import { cn } from "~/lib/utils";
import { api } from "~/utils/api";

function avatarContentType(file: File): "image/png" | "image/jpeg" | "image/webp" {
  const t = file.type;
  if (t === "image/png" || t === "image/jpeg" || t === "image/webp") {
    return t;
  }
  const name = file.name.toLowerCase();
  if (name.endsWith(".png")) return "image/png";
  if (name.endsWith(".jpg") || name.endsWith(".jpeg")) return "image/jpeg";
  if (name.endsWith(".webp")) return "image/webp";
  return "image/png";
}

function BrandForm() {
  const { data: latest, isLoading, refetch } = api.brand.latest.useQuery();
  const create = api.brand.create.useMutation();
  const presign = api.brand.presignAvatarUpload.useMutation();

  const [stylePrompt, setStylePrompt] = useState("");
  const [mascotDescription, setMascotDescription] = useState("");
  const [previewSrc, setPreviewSrc] = useState<string | null>(null);
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [hydrated, setHydrated] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  /** Shown while save runs; drives button + status copy. */
  const [savePhase, setSavePhase] = useState<
    "idle" | "brand" | "presign" | "put"
  >("idle");
  const [showSaved, setShowSaved] = useState(false);
  const [savedWithAvatar, setSavedWithAvatar] = useState(false);
  const previewSrcRef = useRef<string | null>(null);
  previewSrcRef.current = previewSrc;

  useEffect(() => {
    if (hydrated || isLoading) return;
    if (!latest) {
      setStylePrompt(DEFAULT_STYLE_PROMPT);
      setMascotDescription(DEFAULT_MASCOT_DESCRIPTION);
      setPreviewSrc(DEFAULT_MASCOT_IMAGE_SRC);
      setPendingFile(null);
    } else {
      setStylePrompt(latest.style_prompt ?? "");
      setMascotDescription(latest.mascot_description ?? "");
      setPreviewSrc(latest.avatarUrl ?? DEFAULT_MASCOT_IMAGE_SRC);
      setPendingFile(null);
    }
    setHydrated(true);
  }, [latest, hydrated, isLoading]);

  const loadLatestIntoForm = () => {
    setSaveError(null);
    setPreviewSrc((prev) => {
      if (prev?.startsWith("blob:")) URL.revokeObjectURL(prev);
      return null;
    });
    if (!latest) {
      setStylePrompt(DEFAULT_STYLE_PROMPT);
      setMascotDescription(DEFAULT_MASCOT_DESCRIPTION);
      setPreviewSrc(DEFAULT_MASCOT_IMAGE_SRC);
      setPendingFile(null);
      return;
    }
    setStylePrompt(latest.style_prompt ?? "");
    setMascotDescription(latest.mascot_description ?? "");
    setPreviewSrc(latest.avatarUrl ?? DEFAULT_MASCOT_IMAGE_SRC);
    setPendingFile(null);
  };

  const applyImageFile = useCallback((f: File) => {
    setPreviewSrc((prev) => {
      if (prev?.startsWith("blob:")) URL.revokeObjectURL(prev);
      return URL.createObjectURL(f);
    });
    setPendingFile(f);
  }, []);

  const onDrop = useCallback(
    (acceptedFiles: File[]) => {
      const f = acceptedFiles[0];
      if (f) applyImageFile(f);
    },
    [applyImageFile],
  );

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      "image/png": [".png"],
      "image/jpeg": [".jpg", ".jpeg"],
      "image/webp": [".webp"],
    },
    maxFiles: 1,
    multiple: false,
  });

  const clearAvatarPreview = () => {
    setPreviewSrc((prev) => {
      if (prev?.startsWith("blob:")) URL.revokeObjectURL(prev);
      return null;
    });
    setPendingFile(null);
  };

  const onSave = async () => {
    setSaveError(null);
    setShowSaved(false);
    setSavedWithAvatar(false);
    setIsSaving(true);
    setSavePhase("brand");
    const willUploadAvatar = !!pendingFile;
    try {
      const created = await create.mutateAsync({
        style_prompt: stylePrompt || undefined,
        mascot_description: mascotDescription || undefined,
        avatarContentType: pendingFile
          ? avatarContentType(pendingFile)
          : undefined,
      });

      let avatarUrl = created.avatarUrl;

      if (pendingFile) {
        const ct = avatarContentType(pendingFile);
        setSavePhase("presign");
        const { uploadUrl } = await presign.mutateAsync({
          brandId: created.id,
          contentType: ct,
        });
        setSavePhase("put");
        const putRes = await fetch(uploadUrl, {
          method: "PUT",
          body: pendingFile,
          headers: { "Content-Type": ct },
        });
        if (!putRes.ok) {
          throw new Error(`Avatar upload failed (${putRes.status})`);
        }
        avatarUrl = created.avatarUrl;
      }

      setStylePrompt(created.style_prompt ?? "");
      setMascotDescription(created.mascot_description ?? "");
      setPreviewSrc((prev) => {
        if (prev?.startsWith("blob:")) URL.revokeObjectURL(prev);
        return avatarUrl ?? DEFAULT_MASCOT_IMAGE_SRC;
      });
      setPendingFile(null);
      setSavedWithAvatar(willUploadAvatar);
      setShowSaved(true);
      void refetch();
    } catch (e) {
      const message =
        e instanceof TypeError && e.message === "Failed to fetch"
          ? "Avatar upload failed (usually S3 CORS: the bucket must allow PUT). Redeploy with updated bucket CORS or add PUT to your bucket’s CORS in AWS."
          : e instanceof Error
            ? e.message
            : "Save failed";
      setSaveError(message);
    } finally {
      setIsSaving(false);
      setSavePhase("idle");
    }
  };

  useEffect(() => {
    return () => {
      const p = previewSrcRef.current;
      if (p?.startsWith("blob:")) URL.revokeObjectURL(p);
    };
  }, []);

  if (isLoading) {
    return <p className="text-muted-foreground">Loading brand settings…</p>;
  }

  const busy = isSaving || create.isPending || presign.isPending;

  const phaseLabel =
    savePhase === "brand"
      ? "Saving brand…"
      : savePhase === "presign"
        ? "Preparing upload…"
        : savePhase === "put"
          ? "Uploading image…"
          : null;

  const buttonLabel = busy
    ? savePhase === "put"
      ? "Uploading…"
      : savePhase === "presign"
        ? "Almost done…"
        : "Saving…"
    : "Save";

  return (
    <div>
      <Card>
        <CardHeader>
          <CardTitle>Brand</CardTitle>
          <CardDescription>
            Style and reference avatar for generated images. Applies to new videos you create.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <label className="mb-1 block text-sm font-medium" htmlFor="style">
              Style prompt
            </label>
            <Textarea
              id="style"
              rows={6}
              placeholder="Visual style appended to each scene (e.g. line art, palette, background)."
              value={stylePrompt}
              onChange={(e) => setStylePrompt(e.target.value)}
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium" htmlFor="mascot">
              Mascot description
            </label>
            <Textarea
              id="mascot"
              rows={3}
              placeholder="Short description of the character (used for text-to-image models)."
              value={mascotDescription}
              onChange={(e) => setMascotDescription(e.target.value)}
            />
          </div>
          <div>
            <p className="mb-1 text-sm font-medium">Reference avatar image</p>
            {!hydrated ? (
              <div
                className="h-36 animate-pulse rounded-md bg-muted"
                aria-hidden
              />
            ) : previewSrc ? (
              <div className="relative inline-block max-w-full">
                <button
                  type="button"
                  className="absolute -right-2 -top-2 z-20 flex h-8 w-8 items-center justify-center rounded-full border border-border bg-background text-foreground shadow-sm ring-offset-background transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50"
                  aria-label="Remove image"
                  onClick={clearAvatarPreview}
                  disabled={busy}
                >
                  <X className="h-4 w-4" />
                </button>
                <div className="relative">
                  {/* eslint-disable-next-line @next/next/no-img-element -- user-uploaded or static preview */}
                  <img
                    src={previewSrc}
                    alt="Avatar preview"
                    className={cn(
                      "max-h-48 max-w-full rounded-md border border-border",
                      busy && pendingFile && "opacity-70",
                    )}
                  />
                  {busy && pendingFile && phaseLabel && (
                    <div
                      className="absolute inset-0 flex flex-col items-center justify-center gap-2 rounded-md bg-background/80 px-3 text-center backdrop-blur-sm"
                      aria-live="polite"
                    >
                      <Loader2
                        className="h-8 w-8 animate-spin text-primary"
                        aria-hidden
                      />
                      <span className="text-xs font-medium text-foreground">
                        {phaseLabel}
                      </span>
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <div
                {...getRootProps({
                  className: cn(
                    "flex cursor-pointer flex-col items-center justify-center rounded-md border-2 border-dashed px-4 py-8 text-center text-sm transition-colors outline-none",
                    "border-border bg-muted/20 hover:bg-muted/40",
                    "focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
                    isDragActive && "border-primary bg-primary/5",
                  ),
                })}
              >
                <input {...getInputProps({ "aria-label": "Upload reference avatar image" })} />
                <Upload className="mb-2 h-8 w-8 text-muted-foreground" aria-hidden />
                <span className="text-foreground">
                  {isDragActive ? "Drop image here" : "Drag and drop an image, or click to browse"}
                </span>
                <span className="mt-1 text-xs text-muted-foreground">PNG, JPEG, or WebP</span>
              </div>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button onClick={() => void onSave()} disabled={busy}>
              {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />}
              {buttonLabel}
            </Button>
            <Button type="button" variant="outline" onClick={loadLatestIntoForm} disabled={busy}>
              Discard changes
            </Button>
          </div>
          {busy && phaseLabel && !pendingFile && (
            <p
              className="flex items-center gap-2 text-sm text-muted-foreground"
              aria-live="polite"
            >
              <Loader2 className="h-4 w-4 shrink-0 animate-spin" aria-hidden />
              {phaseLabel}
            </p>
          )}
          {!saveError && !busy && showSaved && (
            <p className="flex items-center gap-2 text-sm text-muted-foreground">
              <CheckCircle2 className="h-4 w-4 shrink-0 text-green-600 dark:text-green-500" aria-hidden />
              {savedWithAvatar ? "Saved. Avatar uploaded." : "Saved."}
            </p>
          )}
          {saveError && (
            <p className="text-sm text-destructive">{saveError}</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

export default function BrandPage() {
  return (
    <AuthRequiredLayout>
      <Head>
        <title>Brand | Shortgen</title>
      </Head>
      <main className="min-h-screen bg-background px-4 py-8 text-foreground">
        <div className="mx-auto max-w-2xl">
          <Link href="/" className="mb-6 inline-block text-muted-foreground hover:text-foreground">
            ← Back
          </Link>
          <h1 className="mb-6 text-2xl font-bold">Brand settings</h1>
          <BrandForm />
        </div>
      </main>
    </AuthRequiredLayout>
  );
}
