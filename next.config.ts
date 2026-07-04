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
  allowedDevOrigins: ["127.0.0.1", "localhost", "x18.ccwu.cc"],
  // Transpile radix packages for older browser targets (iOS 13 / WeChat).
  transpilePackages: [
    "react",
    "react-dom",
    "next",
    "scheduler",
    ...radixPackages,
    "@simplewebauthn/browser",
  ],
};

export default nextConfig;
