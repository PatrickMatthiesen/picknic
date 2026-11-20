"use client";

import { ArrowDown, ArrowUp, Camera, Images, Trash2 } from "lucide-react";
import Link from "next/link";
import { type ChangeEvent, type FormEvent, useCallback, useEffect, useState } from "react";
import type { RecipeCaptureSummary } from "@/lib/recipe-captures";
import {
  MAX_RECIPE_PHOTO_BYTES,
  MAX_RECIPE_PHOTOS,
  MAX_RECIPE_PHOTOS_BYTES,
  recipePhotoMimeTypes,
} from "@/lib/recipe-photo-limits";

type SelectedPhoto = {
  id: number;
  file: File;
};

const MB = 1024 * 1024;
const CAPTURES_URL = "/api/recipes/captures";
const PHOTO_ACCEPT = [...recipePhotoMimeTypes, "image/heic", "image/heif", ".heic", ".heif"].join(",");
const POLL_INTERVAL_MS = 4_000;
const POLL_RETRY_MS = 12_000;
const statusLabels = {
  PENDING: "Waiting to process",
  PROCESSING: "Reading photos",
  READY: "Ready to review",
  FAILED: "Could not read photos",
};

function isProcessing(capture: RecipeCaptureSummary) {
  return !capture.canRetry && (capture.status === "PENDING" || capture.status === "PROCESSING");
}

function captureUrl(captureId: string) {
  return `${CAPTURES_URL}/${encodeURIComponent(captureId)}`;
}

async function readResponse<T>(response: Response, fallback: string) {
  const payload = await response.json().catch(() => null) as { data?: T; error?: string } | null;
  if (!response.ok || payload?.data === undefined) {
    throw new Error(typeof payload?.error === "string" ? payload.error : fallback);
  }
  return payload.data;
}

function isHeic(file: File) {
  return /^image\/hei[cf]/i.test(file.type) || /\.hei[cf]$/i.test(file.name);
}

function validatePhotos(files: File[]) {
  if (files.length > MAX_RECIPE_PHOTOS) {
    throw new Error(`You can add up to ${MAX_RECIPE_PHOTOS} photos for one recipe.`);
  }

  for (const file of files) {
    const isSupportedPhoto = recipePhotoMimeTypes.includes(file.type)
      || (!file.type && /\.(jpe?g|png|webp)$/i.test(file.name));
    if (!isHeic(file) && !isSupportedPhoto) {
      throw new Error(`${file.name} must be a JPEG, PNG or WebP image.`);
    }
    if (file.size === 0 || file.size > MAX_RECIPE_PHOTO_BYTES) {
      throw new Error(`${file.name} must contain an image and be at most ${MAX_RECIPE_PHOTO_BYTES / MB} MB.`);
    }
  }

  if (files.reduce((total, file) => total + file.size, 0) > MAX_RECIPE_PHOTOS_BYTES) {
    throw new Error(`The photos must add up to ${MAX_RECIPE_PHOTOS_BYTES / MB} MB or less.`);
  }
}

async function convertHeic(file: File) {
  const url = URL.createObjectURL(file);
  try {
    const image = new Image();
    image.src = url;
    await image.decode();

    const scale = Math.min(1, 3200 / Math.max(image.naturalWidth, image.naturalHeight));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
    canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Photo conversion unavailable.");
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    const jpeg = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.9));
    if (jpeg?.type !== "image/jpeg") throw new Error("Photo conversion unavailable.");
    return new File([jpeg], `${file.name.replace(/\.hei[cf]$/i, "")}.jpg`, { type: "image/jpeg" });
  } catch {
    throw new Error(`Could not convert ${file.name}. Save a JPEG copy or retake it using your camera's Most Compatible setting.`);
  } finally {
    URL.revokeObjectURL(url);
  }
}

function PhotoPreview({ file }: { file: File }) {
  const setPreview = useCallback((image: HTMLImageElement | null) => {
    if (!image) return;
    const url = URL.createObjectURL(file);
    image.src = url;
    return () => URL.revokeObjectURL(url);
  }, [file]);

  // Blob URLs must load directly in the browser.
  // eslint-disable-next-line @next/next/no-img-element
  return <img alt="" className="size-16 shrink-0 rounded-lg object-cover" ref={setPreview} />;
}

export function RecipeCapturesClient({ initialCaptures }: { initialCaptures?: RecipeCaptureSummary[] }) {
  const [photos, setPhotos] = useState<SelectedPhoto[]>([]);
  const [nextPhotoId, setNextPhotoId] = useState(0);
  const [captures, setCaptures] = useState(initialCaptures);
  const [refreshCount, setRefreshCount] = useState(0);
  const [listError, setListError] = useState(initialCaptures ? "" : "Could not load the photo inbox.");
  const [uploadError, setUploadError] = useState("");
  const [actionError, setActionError] = useState<{ id: string; message: string }>();
  const [busy, setBusy] = useState<string>();
  const [announcement, setAnnouncement] = useState("");

  useEffect(() => {
    if (busy) return;

    const controller = new AbortController();
    let timer: number | undefined;
    let hasActiveCaptures = initialCaptures?.some(isProcessing) ?? false;

    async function loadCaptures() {
      try {
        const response = await fetch(CAPTURES_URL, { cache: "no-store", signal: controller.signal });
        const data = await readResponse<RecipeCaptureSummary[]>(response, "Could not load the photo inbox.");
        if (controller.signal.aborted) return;
        setCaptures(data);
        setListError("");
        hasActiveCaptures = data.some(isProcessing);
        if (hasActiveCaptures) timer = window.setTimeout(loadCaptures, POLL_INTERVAL_MS);
      } catch (error) {
        if (controller.signal.aborted) return;
        setListError(error instanceof Error ? error.message : "Could not load the photo inbox.");
        if (hasActiveCaptures) timer = window.setTimeout(loadCaptures, POLL_RETRY_MS);
      }
    }

    if (refreshCount > 0) void loadCaptures();
    else if (hasActiveCaptures) timer = window.setTimeout(loadCaptures, POLL_INTERVAL_MS);
    return () => {
      controller.abort();
      window.clearTimeout(timer);
    };
  }, [busy, initialCaptures, refreshCount]);

  useEffect(() => {
    function refreshOnReturn() {
      if (document.visibilityState === "visible") setRefreshCount((count) => count + 1);
    }
    document.addEventListener("visibilitychange", refreshOnReturn);
    return () => document.removeEventListener("visibilitychange", refreshOnReturn);
  }, []);

  async function addPhotos(event: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.currentTarget.files ?? []);
    event.currentTarget.value = "";
    if (files.length === 0 || busy) return;

    setUploadError("");
    const existing = photos.map(({ file }) => file);
    const shouldConvert = files.some(isHeic);
    try {
      validatePhotos([...existing, ...files]);
      if (shouldConvert) setBusy("convert");
      const selected: File[] = [];
      for (const file of files) {
        selected.push(isHeic(file) ? await convertHeic(file) : file);
      }
      if (shouldConvert) validatePhotos([...existing, ...selected]);
      setPhotos([...photos, ...selected.map((file, index) => ({ id: nextPhotoId + index, file }))]);
      setNextPhotoId(nextPhotoId + selected.length);
    } catch (error) {
      setUploadError(`${error instanceof Error ? error.message : "Could not add photos."} The new selection was not added.`);
    } finally {
      if (shouldConvert) setBusy(undefined);
    }
  }

  function movePhoto(index: number, offset: number) {
    const reordered = [...photos];
    const [photo] = reordered.splice(index, 1);
    reordered.splice(index + offset, 0, photo);
    setPhotos(reordered);
    setAnnouncement(`Moved ${photo.file.name} to position ${index + offset + 1}.`);
  }

  async function upload(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (photos.length === 0 || busy) return;

    const body = new FormData();
    for (const { file } of photos) body.append("photos", file);
    setBusy("upload");
    setUploadError("");
    try {
      const response = await fetch(CAPTURES_URL, { method: "POST", body });
      const capture = await readResponse<RecipeCaptureSummary>(response, "Could not upload the photos.");
      setCaptures((current) => [capture, ...(current ?? []).filter(({ id }) => id !== capture.id)]);
      setPhotos([]);
      setAnnouncement("Photos sent. You can return to the inbox later.");
    } catch (error) {
      setUploadError(error instanceof Error ? error.message : "Could not upload the photos.");
    } finally {
      setRefreshCount((count) => count + 1);
      setBusy(undefined);
    }
  }

  async function updateCapture(capture: RecipeCaptureSummary, method: "POST" | "DELETE") {
    if (busy) return;
    if (method === "DELETE" && !window.confirm("Remove this capture and its photos? Any recipe you saved from it stays in your library.")) return;

    setBusy(capture.id);
    setActionError(undefined);
    const fallback = method === "DELETE" ? "Could not remove the capture." : "Could not retry the capture.";
    try {
      const response = await fetch(captureUrl(capture.id), { method });
      if (method === "POST") {
        const retried = await readResponse<RecipeCaptureSummary>(response, fallback);
        setCaptures((current) => current?.map((item) => item.id === retried.id ? retried : item));
        setAnnouncement("Capture sent for another attempt.");
      } else {
        if (!response.ok) await readResponse(response, fallback);
        setCaptures((current) => current?.filter(({ id }) => id !== capture.id));
        setAnnouncement("Capture removed.");
      }
    } catch (error) {
      setActionError({ id: capture.id, message: error instanceof Error ? error.message : fallback });
    } finally {
      setRefreshCount((count) => count + 1);
      setBusy(undefined);
    }
  }

  const inputDisabled = Boolean(busy) || photos.length === MAX_RECIPE_PHOTOS;
  const pickerClassName = `app-theme-secondary-button inline-flex min-h-11 items-center gap-2 px-4 py-2 text-sm focus-within:outline focus-within:outline-offset-2 ${inputDisabled ? "opacity-50" : "cursor-pointer"}`;

  return (
    <div className="space-y-6">
      <section className="space-y-4 border-b border-[var(--divider)] pb-6" aria-labelledby="add-photos">
        <div>
          <h2 className="text-lg font-semibold" id="add-photos">Import a recipe from photos</h2>
          <p className="app-theme-muted mt-1 text-sm" id="photo-limits">
            Up to {MAX_RECIPE_PHOTOS} photos per recipe. JPEG, PNG or WebP, {MAX_RECIPE_PHOTO_BYTES / MB} MB each and {MAX_RECIPE_PHOTOS_BYTES / MB} MB total.
          </p>
        </div>
        <form className="space-y-4" onSubmit={upload}>
          <div className="flex flex-wrap gap-2">
            <label className={`capture-camera-picker ${pickerClassName}`}>
              <Camera aria-hidden="true" size={18} /> Take photo
              <input accept="image/*" aria-describedby="photo-limits" capture="environment" className="sr-only" disabled={inputDisabled} onChange={addPhotos} type="file" />
            </label>
            <label className={pickerClassName}>
              <Images aria-hidden="true" size={18} /> Choose photos
              <input accept={PHOTO_ACCEPT} aria-describedby="photo-limits" className="sr-only" disabled={inputDisabled} multiple onChange={addPhotos} type="file" />
            </label>
          </div>

          {photos.length > 0 ? (
            <div className="space-y-2">
              <p className="app-theme-muted text-sm" id="photo-order">Put the pages in reading order before sending.</p>
              <ol aria-describedby="photo-order" aria-label="Selected photos" className="space-y-2">
                {photos.map(({ id, file }, index) => (
                  <li className="app-theme-input flex flex-wrap items-center gap-2 p-2" key={id}>
                    <PhotoPreview file={file} />
                    <p className="min-w-24 flex-1 break-all text-sm">{index + 1}. {file.name}</p>
                    <div className="ml-auto flex gap-1">
                      <button aria-label={`Move photo ${index + 1} earlier`} className="app-theme-secondary-button grid size-11 place-items-center disabled:opacity-40" disabled={Boolean(busy) || index === 0} onClick={() => movePhoto(index, -1)} type="button"><ArrowUp aria-hidden="true" size={17} /></button>
                      <button aria-label={`Move photo ${index + 1} later`} className="app-theme-secondary-button grid size-11 place-items-center disabled:opacity-40" disabled={Boolean(busy) || index === photos.length - 1} onClick={() => movePhoto(index, 1)} type="button"><ArrowDown aria-hidden="true" size={17} /></button>
                      <button aria-label={`Remove photo ${index + 1}`} className="app-theme-secondary-button grid size-11 place-items-center" disabled={Boolean(busy)} onClick={() => {
                        setPhotos(photos.filter((photo) => photo.id !== id));
                        setUploadError("");
                        setAnnouncement(`Removed ${file.name}.`);
                      }} type="button"><Trash2 aria-hidden="true" size={17} /></button>
                    </div>
                  </li>
                ))}
              </ol>
            </div>
          ) : null}

          {busy === "convert" ? <p className="app-theme-muted text-sm" role="status">Preparing photos...</p> : null}
          {uploadError ? <p className="text-sm text-red-700 dark:text-red-300" role="alert">{uploadError}</p> : null}
          <button className="app-theme-primary-button min-h-11 px-4 py-2 text-sm disabled:opacity-50" disabled={Boolean(busy) || photos.length === 0} type="submit">
            {busy === "upload" ? "Sending photos..." : "Send to inbox"}
          </button>
        </form>
      </section>

      <p className="sr-only" role="status">{announcement}</p>
      <section className="space-y-3" aria-labelledby="captures">
        <h2 className="text-lg font-semibold" id="captures">Captures</h2>
        {listError ? (
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-sm text-red-700 dark:text-red-300" role="alert">{listError}</p>
            <button className="app-theme-secondary-button min-h-11 px-3 text-sm" disabled={Boolean(busy)} onClick={() => setRefreshCount(refreshCount + 1)} type="button">Refresh inbox</button>
          </div>
        ) : null}
        {captures?.length === 0 && !listError ? <p className="app-theme-muted text-sm">Your photo captures will appear here.</p> : null}
        {captures?.length ? (
          <ul className="space-y-3">
            {captures.map((capture) => (
              <li className="space-y-3 border-b border-[var(--divider)] pb-4" key={capture.id}>
                <div>
                  <h3 className="break-words font-semibold">{capture.title || "Recipe photos"}</h3>
                  <p className="app-theme-muted text-sm">
                    <time dateTime={capture.createdAt}>{new Date(capture.createdAt).toLocaleDateString()}</time>
                    {" · "}
                    <span role="status">
                      {capture.savedRecipeId ? "Saved to recipes" : capture.canRetry && capture.status !== "FAILED" ? "Processing interrupted" : statusLabels[capture.status]}
                    </span>
                  </p>
                </div>
                <details>
                  <summary className="app-theme-link cursor-pointer text-sm">Source photos ({capture.photos.length})</summary>
                  <ul className="mt-1 flex flex-wrap gap-3 text-sm">
                    {capture.photos.map(({ id }, index) => (
                      <li key={id}>
                        <a className="app-theme-link" href={`${captureUrl(capture.id)}/photos/${encodeURIComponent(id)}`} target="_blank" rel="noreferrer">
                          Photo {index + 1}
                        </a>
                      </li>
                    ))}
                  </ul>
                </details>
                {actionError?.id === capture.id ? <p className="text-sm text-red-700 dark:text-red-300" role="alert">{actionError.message}</p> : null}
                <div className="flex flex-wrap items-center gap-2">
                  {capture.savedRecipeId ? (
                    <Link className="app-theme-primary-button inline-flex min-h-11 items-center px-4 py-2 text-sm" href={`/recipes/${encodeURIComponent(capture.savedRecipeId)}`}>View recipe</Link>
                  ) : capture.status === "READY" ? (
                    <Link className="app-theme-primary-button inline-flex min-h-11 items-center px-4 py-2 text-sm" href={`/recipes/new?capture=${encodeURIComponent(capture.id)}`}>Review recipe</Link>
                  ) : null}
                  {capture.canRetry ? <button className="app-theme-secondary-button min-h-11 px-3 text-sm disabled:opacity-50" disabled={Boolean(busy)} onClick={() => void updateCapture(capture, "POST")} type="button">Retry</button> : null}
                  <button aria-label={`Remove capture from ${new Date(capture.createdAt).toLocaleString()}`} className="app-theme-secondary-button min-h-11 px-3 text-sm disabled:opacity-50" disabled={Boolean(busy)} onClick={() => void updateCapture(capture, "DELETE")} type="button">Remove capture</button>
                </div>
              </li>
            ))}
          </ul>
        ) : null}
      </section>
    </div>
  );
}
