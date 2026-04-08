import type { NextConfig } from "next"

const nextConfig: NextConfig = {
  allowedDevOrigins: ["172.20.10.5"],
  serverExternalPackages: ["firebase-admin"],
  typescript: {
    ignoreBuildErrors: true,
  },
  turbopack: {},
  webpack: (config, { isServer }) => {
    if (!isServer) {
      config.resolve.fallback = {
        ...config.resolve.fallback,
        "firebase-admin": false,
        "firebase-admin/app": false,
        "firebase-admin/firestore": false,
      }
    }
    return config
  },
  images: {
    unoptimized: true,
    remotePatterns: [
      {
        protocol: "https",
        hostname: "res.cloudinary.com",
        pathname: "/**",
      },
      {
        protocol: "https",
        hostname: "firebasestorage.googleapis.com",
        pathname: "/**",
      },
      {
        protocol: "https",
        hostname: "lh3.googleusercontent.com",
        pathname: "/**",
      },
    ],
  },
}

export default nextConfig