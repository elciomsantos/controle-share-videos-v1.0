/** @type {import('next').NextConfig} */
const { version } = require("./package.json");

const withSerwist = require("@serwist/next").default({
  swSrc: "src/sw.ts",
  swDest: "public/sw.js",
  disable: process.env.NODE_ENV === "development",
  reloadOnOnline: false,
  register: true,
});

const apiUrl = process.env.API_URL || "http://localhost:8080";

module.exports = withSerwist({
  transpilePackages: ["@uiw/react-md-editor", "@uiw/react-markdown-preview"],
  output: "standalone",
  images: {
    unoptimized: true,
  },
  env: {
    VERSION: version,
  },
  async rewrites() {
    return [
      {
        source: "/api/:path*",
        destination: `${apiUrl}/api/:path*`,
      },
    ];
  },
});
