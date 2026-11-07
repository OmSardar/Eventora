/** @type {import('next').NextConfig} */
const nextConfig = {
  eslint: {
    ignoreDuringBuilds: true,
  },
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "images.unsplash.com",
      },
    ],
  },
  async rewrites() {
    const backendUrl =
      process.env.INTERNAL_API_URL ||
      process.env.NEXT_PUBLIC_API_URL ||
      "http://localhost:5000/api/v1";
    const cleanBackendUrl = backendUrl.replace(/\/+$/, "");

    return [
      {
        source: "/api/v1/:path*",
        destination: `${cleanBackendUrl}/:path*`,
      },
    ];
  },
};

export default nextConfig;
