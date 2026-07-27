// v6.01 — uploaded photo assets: helpers shared by the carousel and the upload portal.
// Uploaded photos are referenced as "asset:<id>" tokens inside `photos` arrays;
// legacy "https://…" URLs keep working side by side.
import { apiRequest } from "./queryClient";
import type { PhotoAssetMeta, PhotoOwnerType } from "@shared/schema";

export const isAssetToken = (s: string) => s.startsWith("asset:");
export const assetIdOf = (s: string) => Number(s.slice("asset:".length));

/** Small, fast image for carousels/grids */
export const photoThumbSrc = (s: string) =>
  isAssetToken(s) ? `/api/assets/${assetIdOf(s)}/thumb` : s;

/** HD original as a browser download */
export const photoHdDownloadHref = (s: string) =>
  isAssetToken(s) ? `/api/assets/${assetIdOf(s)}/hd?download=1` : s;

const MAX_HD_BYTES = 8 * 1024 * 1024;
const THUMB_EDGE = 640;

function bufToBase64(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let bin = "";
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    bin += String.fromCharCode.apply(null, Array.from(bytes.subarray(i, i + CHUNK)));
  }
  return btoa(bin);
}

/** Browser-side auto-thumbnail: resize to ≤640px edge, JPEG q0.82 */
async function makeThumb(file: File): Promise<string> {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error("Cannot read image"));
      el.src = url;
    });
    const scale = Math.min(1, THUMB_EDGE / Math.max(img.naturalWidth, img.naturalHeight));
    const w = Math.max(1, Math.round(img.naturalWidth * scale));
    const h = Math.max(1, Math.round(img.naturalHeight * scale));
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    canvas.getContext("2d")!.drawImage(img, 0, 0, w, h);
    return canvas.toDataURL("image/jpeg", 0.82).split(",")[1];
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** Upload one image file: auto-thumbnail + HD original → returns the "asset:<id>" token */
export async function uploadPhotoAsset(
  file: File,
  ownerType: PhotoOwnerType,
  ownerId: number,
): Promise<string> {
  if (!file.type.startsWith("image/")) throw new Error(`${file.name}: not an image`);
  if (file.size > MAX_HD_BYTES) throw new Error(`${file.name}: over 8MB`);
  const [hdData, thumbData] = await Promise.all([file.arrayBuffer().then(bufToBase64), makeThumb(file)]);
  const res = await apiRequest("POST", "/api/assets", {
    ownerType,
    ownerId,
    filename: file.name.slice(0, 200),
    mime: file.type,
    thumbData,
    hdData,
  });
  const meta = (await res.json()) as PhotoAssetMeta;
  return `asset:${meta.id}`;
}

/** Fire-and-forget asset deletion (used when an uploaded photo is removed again) */
export function deletePhotoAsset(token: string) {
  if (!isAssetToken(token)) return;
  apiRequest("DELETE", `/api/assets/${assetIdOf(token)}`).catch(() => {});
}
