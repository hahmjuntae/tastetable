import type { NextConfig } from "next";

// 배포는 정적 내보내기 + Worker API, 내보내기 때는 route.ts 를 빼서 /api 를 Worker 가 처리
const isExport = process.env.STATIC_EXPORT === "1";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  ...(isExport ? { output: "export", pageExtensions: ["tsx"], images: { unoptimized: true } } : {}),
};

export default nextConfig;
