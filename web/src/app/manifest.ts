import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Loophole — Autonomous Republic",
    short_name: "Loophole",
    description: "Persistent political strategy on GenLayer.",
    display: "standalone",
    background_color: "#07110f",
    theme_color: "#07110f",
    start_url: "/",
    icons: [
      { src: "/brand/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/brand/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/brand/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
