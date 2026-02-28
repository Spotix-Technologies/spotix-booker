// app/manifest.js  (or app/manifest.ts)

export default function manifest() {
  return {
    name: "Spotix Booker - Event Management Platform",
    short_name: "Spotix Booker",
    description: "Create, manage, and sell tickets for your events",
    start_url: "/",
    display: "standalone",
    background_color: "#ffffff",
    theme_color: "#6b2fa5",
    orientation: "portrait-primary",
    icons: [
      {
        src: "/full-logo.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "maskable",
      },
      {
        src: "/full-logo.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
    categories: ["business", "productivity", "entertainment", "events", "tickets", "management"],
    lang: "en-US",
    dir: "ltr",
    scope: "/",
    related_applications: [],
    prefer_related_applications: false,
  };
}