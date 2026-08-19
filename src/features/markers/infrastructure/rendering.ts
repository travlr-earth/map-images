import type {
  MarkerIconDefinition,
  MarkerItem,
  MarkerProjectionInput,
} from "@/features/markers/domain/types";
import { projectMarkerToCanvas } from "./projection";

function decodeImage(src: string): Promise<HTMLImageElement> {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Could not load marker icon."));
    img.src = src;
  });
}

/** Build a loadable image for the icon, recoloring inline SVG markup. */
async function iconToImage(
  icon: MarkerIconDefinition,
  color: string,
): Promise<HTMLImageElement> {
  if (icon.kind === "svg" && icon.svgMarkup) {
    const colored = icon.svgMarkup.split("currentColor").join(color);
    return decodeImage(
      `data:image/svg+xml;charset=utf-8,${encodeURIComponent(colored)}`,
    );
  }
  if (icon.dataUrl) {
    return decodeImage(icon.dataUrl);
  }
  throw new Error(`Marker icon "${icon.id}" is missing render data.`);
}

/**
 * Paint the image filled with a flat color, preserving its alpha shape.
 * Falls back to an untinted draw if a scratch canvas can't be created.
 */
function paintTinted(
  ctx: CanvasRenderingContext2D,
  image: CanvasImageSource,
  x: number,
  y: number,
  size: number,
  color: string,
) {
  const px = Math.max(1, Math.round(size));
  const scratch = document.createElement("canvas");
  scratch.width = px;
  scratch.height = px;
  const sctx = scratch.getContext("2d");
  if (!sctx) {
    ctx.drawImage(image, x, y, size, size);
    return;
  }

  sctx.drawImage(image, 0, 0, px, px);
  sctx.globalCompositeOperation = "source-in";
  sctx.fillStyle = color;
  sctx.fillRect(0, 0, px, px);
  sctx.globalCompositeOperation = "source-over";

  ctx.drawImage(scratch, x, y, size, size);
}

export async function drawMarkersOnCanvas(
  ctx: CanvasRenderingContext2D,
  markers: MarkerItem[],
  icons: MarkerIconDefinition[],
  projection: MarkerProjectionInput,
  scaleX = 1,
  scaleY = 1,
  sizeScale = 1,
) {
  await Promise.all(
    markers.map(async (marker) => {
      const icon = icons.find((candidate) => candidate.id === marker.iconId);
      if (!icon) return;

      const center = projectMarkerToCanvas(marker.lat, marker.lon, projection);
      const cx = center.x * scaleX;
      const cy = center.y * scaleY;
      const side = marker.size * Math.max(scaleX, scaleY) * sizeScale;

      const image = await iconToImage(icon, marker.color);
      const left = cx - side / 2;
      const top = cy - side / 2;

      if (icon.tintWithMarkerColor) {
        paintTinted(ctx, image, left, top, side, marker.color);
      } else {
        ctx.drawImage(image, left, top, side, side);
      }
    }),
  );
}
