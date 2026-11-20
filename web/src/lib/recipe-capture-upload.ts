import {
  MAX_RECIPE_PHOTO_BYTES,
  MAX_RECIPE_PHOTOS,
  MAX_RECIPE_PHOTOS_BYTES,
  recipePhotoMimeTypes,
} from "@/lib/recipe-photo-limits";

const maxMultipartBytes = MAX_RECIPE_PHOTOS_BYTES + 64 * 1024;

export class RecipeCaptureUploadError extends Error {
  constructor(message: string, public readonly status = 400) {
    super(message);
  }
}

function tooLarge() {
  return new RecipeCaptureUploadError("Recipe photos can total up to 16 MiB.", 413);
}

async function readPhotoForm(request: Request): Promise<FormData> {
  const contentType = request.headers.get("content-type");
  if (!contentType || !/^multipart\/form-data\s*;/i.test(contentType) || !request.body) {
    throw new RecipeCaptureUploadError("Send recipe photos as multipart form data.");
  }

  if (Number(request.headers.get("content-length")) > maxMultipartBytes) throw tooLarge();

  const chunks: ArrayBuffer[] = [];
  let length = 0;
  const reader = request.body.getReader();
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      length += value.byteLength;
      if (length > maxMultipartBytes) {
        void reader.cancel().catch(() => {});
        throw tooLarge();
      }
      chunks.push(Uint8Array.from(value).buffer);
    }

    return await new Response(new Blob(chunks), {
      headers: { "Content-Type": contentType },
    }).formData();
  } catch (error) {
    if (error instanceof RecipeCaptureUploadError) throw error;
    throw new RecipeCaptureUploadError("The photo upload could not be read.");
  } finally {
    reader.releaseLock();
  }
}

function detectPhotoType(bytes: Uint8Array): string | null {
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "image/jpeg";
  if ([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a].every((byte, index) => bytes[index] === byte)) {
    return "image/png";
  }

  const decoder = new TextDecoder();
  if (decoder.decode(bytes.subarray(0, 4)) === "RIFF"
      && decoder.decode(bytes.subarray(8, 12)) === "WEBP"
      && ["VP8 ", "VP8L", "VP8X"].includes(decoder.decode(bytes.subarray(12, 16)))) {
    return "image/webp";
  }

  return null;
}

export async function readRecipeCapturePhotos(request: Request) {
  const form = await readPhotoForm(request);
  const files = form.getAll("photos");
  if (!files.length || files.length > MAX_RECIPE_PHOTOS) {
    throw new RecipeCaptureUploadError(`Choose between 1 and ${MAX_RECIPE_PHOTOS} recipe photos.`);
  }

  const photos = [];
  let total = 0;
  for (const [position, file] of files.entries()) {
    if (typeof file === "string") {
      throw new RecipeCaptureUploadError("Each photo must be a JPEG, PNG, or WebP file.");
    }
    if (file.size > MAX_RECIPE_PHOTO_BYTES) {
      throw new RecipeCaptureUploadError("Each recipe photo can be up to 8 MiB.", 413);
    }

    total += file.size;
    if (total > MAX_RECIPE_PHOTOS_BYTES) throw tooLarge();

    const bytes = new Uint8Array(await file.arrayBuffer());
    const contentType = detectPhotoType(bytes);
    if (!contentType || !recipePhotoMimeTypes.some((type) => type === contentType) ||
        (file.type && file.type !== "application/octet-stream" && file.type !== contentType)) {
      throw new RecipeCaptureUploadError("Each photo must be a JPEG, PNG, or WebP file.");
    }

    photos.push({ contentType, bytes, position });
  }

  return photos;
}
