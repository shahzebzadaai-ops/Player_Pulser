import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "PlayerPulser",
    short_name: "PlayerPulser",
    description: "Cricket player trading. Development build with simulated money.",
    start_url: "/home",
    display: "standalone",
    background_color: "#07111f",
    theme_color: "#07111f",
    icons: [
      { src: "/brand/icon-192.png?v=2", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/brand/icon-512.png?v=2", sizes: "512x512", type: "image/png", purpose: "any" },
    ],
  };
}
