import type { OutputProfile, BatchExportItem } from "./types";
import { getFormatById } from "./formats";

function item(id: string): BatchExportItem | null {
  const spec = getFormatById(id);
  if (!spec) return null;
  return { spec, format: spec.defaultFormat };
}

function items(...ids: string[]): BatchExportItem[] {
  return ids.map(item).filter((x): x is BatchExportItem => x !== null);
}

export const OUTPUT_PROFILES: OutputProfile[] = [
  {
    id: "souvenir_print",
    name: "Souvenir Print",
    description: "Print-ready PDFs in travel poster sizes",
    icon: "🖨️",
    items: items(
      "print_travel_s",
      "print_travel_m",
      "print_travel_l",
      "print_a4_portrait",
    ),
  },
  {
    id: "instagram_pack",
    name: "Instagram Pack",
    description: "Feed square, portrait, and story",
    icon: "📸",
    items: items("social_ig_square", "social_ig_portrait", "stories_ig"),
  },
  {
    id: "social_bundle",
    name: "Social Bundle",
    description: "All major social platforms in one go",
    icon: "🌐",
    items: items(
      "social_ig_square",
      "social_ig_portrait",
      "stories_ig",
      "social_fb_post",
      "social_x_post",
      "social_linkedin_post",
      "social_pinterest_pin",
    ),
  },
  {
    id: "stories_pack",
    name: "Stories Pack",
    description: "9:16 vertical format for all story platforms",
    icon: "📱",
    items: items(
      "stories_ig",
      "stories_fb",
      "stories_tiktok",
      "stories_snapchat",
      "stories_whatsapp",
    ),
  },
  {
    id: "wallpaper_pack",
    name: "Wallpaper Pack",
    description: "Desktop and mobile wallpapers",
    icon: "🖥️",
    items: items(
      "wallpaper_fhd",
      "wallpaper_4k",
      "wallpaper_iphone",
      "wallpaper_android",
    ),
  },
  {
    id: "web_assets",
    name: "Web Assets",
    description: "WebP assets optimised for websites",
    icon: "🌍",
    items: items("web_og_card", "web_hero", "web_blog_cover"),
  },
  {
    id: "print_full",
    name: "Full Print Set",
    description: "All ISO and travel poster print sizes",
    icon: "🗺️",
    items: items(
      "print_a5_portrait",
      "print_a4_portrait",
      "print_a3_portrait",
      "print_travel_s",
      "print_travel_m",
      "print_travel_l",
    ),
  },
];

export function getProfileById(id: string): OutputProfile | undefined {
  return OUTPUT_PROFILES.find((p) => p.id === id);
}
