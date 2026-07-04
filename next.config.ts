import type { NextConfig } from "next";

const radixPackages = [
  "@radix-ui/react-alert-dialog",
  "@radix-ui/react-dialog",
  "@radix-ui/react-label",
  "@radix-ui/react-slider",
  "@radix-ui/react-slot",
  "@radix-ui/react-switch",
  "@radix-ui/react-tabs",
  "@radix-ui/react-toast",
  "@radix-ui/primitive",
  "@radix-ui/react-collection",
  "@radix-ui/react-compose-refs",
  "@radix-ui/react-context",
  "@radix-ui/react-dismissable-layer",
  "@radix-ui/react-focus-guards",
  "@radix-ui/react-focus-scope",
  "@radix-ui/react-id",
  "@radix-ui/react-popper",
  "@radix-ui/react-portal",
  "@radix-ui/react-presence",
  "@radix-ui/react-primitive",
  "@radix-ui/react-use-callback-ref",
  "@radix-ui/react-use-controllable-state",
  "@radix-ui/react-use-escape-keydown",
  "@radix-ui/react-use-layout-effect",
  "@radix-ui/react-use-previous",
  "@radix-ui/react-use-size",
  "@radix-ui/react-visually-hidden",
];

const nextConfig: NextConfig = {
  output: "standalone",
  typescript: {
    ignoreBuildErrors: true,
  },
  reactStrictMode: false,
  devIndicators: false,
  allowedDevOrigins: ["127.0.0.1", "localhost", "x18.ccwu.cc", "192.168.1.100"],
  // Transpile radix packages for older browser targets (iOS 13 / WeChat).
  transpilePackages: [
    "react",
    "react-dom",
    "next",
    "scheduler",
    ...radixPackages,
    "@simplewebauthn/browser",
  ],
  webpack: (config, { isServer, dev }) => {
    // Use 'source-map' instead of 'eval-source-map' so iOS 13.3.1 Safari doesn't
    // choke on eval'd source with sourceURL. The eval wrapper can confuse the old
    // parser, and source-map gives clearer error locations.
    if (dev && !isServer) {
      config.devtool = "source-map";
    }
    return config;
  },
};

export default nextConfig;
