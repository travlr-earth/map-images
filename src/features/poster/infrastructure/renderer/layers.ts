import { withAlpha } from "@/shared/utils/color";

export type GradientStyle = "symmetric" | "heavy-bottom" | "top-bottom" | "vignette";

function verticalFade(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  color: string,
  op: number,
  fromY: number,
  toY: number,
  dir: "top" | "bottom",
): void {
  const g = ctx.createLinearGradient(0, fromY, 0, toY);
  if (dir === "top") {
    g.addColorStop(0, withAlpha(color, op));
    g.addColorStop(1, withAlpha(color, 0));
  } else {
    g.addColorStop(0, withAlpha(color, 0));
    g.addColorStop(1, withAlpha(color, op));
  }
  ctx.fillStyle = g;
  ctx.fillRect(0, fromY, width, toY - fromY);
}

function sideFade(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  color: string,
  op: number,
  reach: number,
): void {
  const left = ctx.createLinearGradient(0, 0, width * reach, 0);
  left.addColorStop(0, withAlpha(color, op));
  left.addColorStop(1, withAlpha(color, 0));
  ctx.fillStyle = left;
  ctx.fillRect(0, 0, width * reach, height);

  const right = ctx.createLinearGradient(width, 0, width * (1 - reach), 0);
  right.addColorStop(0, withAlpha(color, op));
  right.addColorStop(1, withAlpha(color, 0));
  ctx.fillStyle = right;
  ctx.fillRect(width * (1 - reach), 0, width * reach, height);
}

/** Paints the selected edge-fade preset over the map in the theme's bg color. */
export function applyFades(
  ctx: CanvasRenderingContext2D,
  width: number, height: number,
  fadeColor: string, opacity = 1,
  style: GradientStyle = "symmetric",
): void {
  const op = Math.max(0, Math.min(1, opacity));

  if (style === "symmetric") {
    verticalFade(ctx, width, height, fadeColor, op, 0, height * 0.25, "top");
    verticalFade(ctx, width, height, fadeColor, op, height * 0.75, height, "bottom");
  } else if (style === "heavy-bottom") {
    // Lighter top, strong bottom — ideal for portrait/story where text lives at bottom
    verticalFade(ctx, width, height, fadeColor, op * 0.6, 0, height * 0.18, "top");
    verticalFade(ctx, width, height, fadeColor, op, height * 0.58, height, "bottom");
  } else if (style === "top-bottom") {
    // Heavier on both ends — good for landscape / cinematic feel
    verticalFade(ctx, width, height, fadeColor, op, 0, height * 0.32, "top");
    verticalFade(ctx, width, height, fadeColor, op, height * 0.68, height, "bottom");
    sideFade(ctx, width, height, fadeColor, op * 0.35, 0.12);
  } else if (style === "vignette") {
    // All four edges + corner darkening via layered fades
    verticalFade(ctx, width, height, fadeColor, op * 0.7, 0, height * 0.28, "top");
    verticalFade(ctx, width, height, fadeColor, op, height * 0.6, height, "bottom");
    sideFade(ctx, width, height, fadeColor, op * 0.55, 0.18);
  }
}
