/** @type {import('next').NextConfig} */
const isProd = process.env.NODE_ENV === "production";
const nextConfig = {
  output: "standalone",
  // assetPrefix: isProd ? "https://eee.cloudfront.net" : undefined,
};

module.exports = nextConfig;
