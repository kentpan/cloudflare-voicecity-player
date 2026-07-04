import { requireAdmin } from "@/lib/auth";
import { ok, handleError } from "@/lib/api";
import { getKV } from "@/lib/kv";
import { generateRegistrationOptions } from "@simplewebauthn/server";
import { getRpId } from "@/lib/passkey-config";

const RP_NAME = "随心音乐播放器";
const CHALLENGE_TTL_MS = 5 * 60 * 1000;

/**
 * POST /api/auth/passkey/register-options
 * 为已登录管理员生成 passkey 注册选项。
 * 凭证和 challenge 存储在 KV 中。
 */
export async function POST(req: Request) {
  try {
    const user = await requireAdmin();
    const rpId = getRpId(req);
    const kv = await getKV();

    // 读取已有的 passkey 凭证
    const credentials = await kv.get<Array<{ credentialId: string; publicKey: number[]; counter: number; transports?: string[] }>>("passkey-credentials") || [];

    const options = await generateRegistrationOptions({
      rpName: RP_NAME,
      rpID: rpId,
      userID: new TextEncoder().encode(user.id),
      userName: user.username,
      userDisplayName: user.name || user.username,
      attestationType: "none",
      excludeCredentials: credentials.map(c => ({
        id: c.credentialId,
        type: "public-key",
      })),
      authenticatorSelection: {
        residentKey: "preferred",
        userVerification: "preferred",
      },
    });

    // 存储 challenge
    const challenges = await kv.get<Array<{ challenge: string; purpose: string; expiresAt: number }>>("passkey-challenges") || [];
    challenges.push({
      challenge: options.challenge,
      purpose: "register",
      expiresAt: Date.now() + CHALLENGE_TTL_MS,
    });
    // 清理过期 challenge
    const validChallenges = challenges.filter(c => c.expiresAt > Date.now());
    await kv.put("passkey-challenges", validChallenges);

    return ok(options);
  } catch (err) {
    return handleError(err);
  }
}
