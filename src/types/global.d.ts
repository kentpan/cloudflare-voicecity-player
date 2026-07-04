// Global type declarations for the afp.js WASM audio fingerprint module
interface Window {
  GenerateFP?: (recording: Float32Array) => Promise<string>;
}
