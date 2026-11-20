import { describe, expect, test } from "bun:test";
import { readRecipeCapturePhotos } from "@/lib/recipe-capture-upload";
import { MAX_RECIPE_PHOTO_BYTES, MAX_RECIPE_PHOTOS_BYTES } from "@/lib/recipe-photo-limits";

const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xe0]);
const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

function upload(...files: File[]) {
  const form = new FormData();
  for (const file of files) form.append("photos", file);

  return new Request("https://picknic.test/api/recipes/captures", { method: "POST", body: form });
}

describe("recipe capture upload", () => {
  test("preserves photo order and normalizes content types from signatures", async () => {
    const request = upload(new File([jpeg], "photo"), new File([png], "recipe.png", { type: "image/png" }));
    expect(await readRecipeCapturePhotos(request)).toEqual([
      { contentType: "image/jpeg", bytes: jpeg, position: 0 },
      { contentType: "image/png", bytes: png, position: 1 },
    ]);
  });

  test("rejects a file falsely declaring an image content type", async () => {
    const request = upload(new File(["<svg/>"], "photo.png", { type: "image/png" }));
    await expect(readRecipeCapturePhotos(request)).rejects.toMatchObject({ status: 400 });
  });

  test("rejects a photo over the per-file limit", async () => {
    const bytes = new Uint8Array(MAX_RECIPE_PHOTO_BYTES + 1);
    bytes.set(jpeg);
    const request = upload(new File([bytes], "photo.jpeg", { type: "image/jpeg" }));
    await expect(readRecipeCapturePhotos(request)).rejects.toMatchObject({ status: 413 });
  });

  test("stops reading an oversized request regardless of its content-length", async () => {
    for (const contentLength of [undefined, "10"]) {
      let canceled = false;
      const body = new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(new Uint8Array(MAX_RECIPE_PHOTOS_BYTES + 128 * 1024));
        },
        cancel() {
          canceled = true;
        },
      });
      const headers = new Headers({ "content-type": "multipart/form-data; boundary=photos" });
      if (contentLength !== undefined) headers.set("content-length", contentLength);
      const request = new Request("https://picknic.test/api/recipes/captures", { method: "POST", body, headers });

      await expect(readRecipeCapturePhotos(request)).rejects.toMatchObject({ status: 413 });
      expect(canceled).toBe(true);
    }
  });
});
