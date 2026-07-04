import { ok, handleError } from "@/lib/api";
import { getKV } from "@/lib/kv";
import { generateAuthenticationOptions } from "@simplewebauthn/server";
import { getRpId } from "@/lib/passkey-config";

const CHALLENGE_TTL_MS = 5 * 60 * 1000;

/**
 * GET /api/auth/passkey/login-options
 * 生成 passkey 登录认证选项（discoverable credentials）。
 */
export async function GET(req: Request) {
  try {
    const rpId = getRpId(req);
    const kv = await getKV();

    const credentials = await kv.get<Array<{ credentialId: string; publicKey: number[]; counter: number; transports?: string[] }>>("passkey-credentials") || [];

    const options = await generateAuthenticationOptions({
      rpID: rpId,
      allowCredentials: credentials.map(c => ({
        id: c.credentialId,
        type: "public-key",
      })),
      userVerification: "preferred",
    });

    // 存储 challenge
    const challenges = await kv.get<Array<{ challenge: string; purpose: string; expiresAt: number }>>("passkey-challenges") || [];
    challenges.push({
      challenge: options.challenge,
      purpose: "login",
      expiresAt: Date.now() + CHALLENGE_TTL_MS,
    });
    const validChallenges = challenges.filter(c => c.expiresAt > Date.now());
    await kv.put("passkey-challenges", validChallenges);

    return ok(options);
  } catch (err) {
    return handleError(err);
  }
}
