import { requireAdmin } from "@/lib/auth";
import { ok, fail, handleError, readBody } from "@/lib/api";
import { getKV } from "@/lib/kv";
import { verifyRegistrationResponse } from "@simplewebauthn/server";
import { getRpId, getRpOrigin } from "@/lib/passkey-config";

interface StoredCredential {
  credentialId: string;
  publicKey: number[];
  counter: number;
  transports?: string[];
}

/**
 * POST /api/auth/passkey/register-verify
 * 验证注册响应并保存凭证到 KV。
 */
export async function POST(req: Request) {
  try {
    await requireAdmin();
    const body = await readBody<{ credential?: unknown }>(req);
    if (!body.credential) return fail("缺少 credential", 400);

    const rpId = getRpId(req);
    const rpOrigin = getRpOrigin(req);
    const kv = await getKV();

    // 查找最近的注册 challenge
    const challenges = await kv.get<Array<{ challenge: string; purpose: string; expiresAt: number }>>("passkey-challenges") || [];
    const challengeRecord = challenges
      .filter(c => c.purpose === "register" && c.expiresAt > Date.now())
      .sort((a, b) => b.expiresAt - a.expiresAt)[0];
    if (!challengeRecord) return fail("验证已过期，请重新点击添加 Passkey", 400);

    const verification = await verifyRegistrationResponse({
      response: body.credential as never,
      expectedChallenge: challengeRecord.challenge,
      expectedOrigin: rpOrigin,
      expectedRPID: rpId,
    });

    if (!verification.verified || !verification.registrationInfo) {
      return fail("Passkey 注册验证失败", 400);
    }

    const { credential } = verification.registrationInfo;
    const credentialId = Buffer.from(credential.id).toString("base64url");

    // 保存凭证
    const credentials = await kv.get<StoredCredential[]>("passkey-credentials") || [];
    const existingIdx = credentials.findIndex(c => c.credentialId === credentialId);
    const newCred: StoredCredential = {
      credentialId,
      publicKey: Array.from(credential.publicKey),
      counter: credential.counter,
      transports: credential.transports,
    };
    if (existingIdx >= 0) {
      credentials[existingIdx] = newCred;
    } else {
      credentials.push(newCred);
    }
    await kv.put("passkey-credentials", credentials);

    // 标记 challenge 已使用（删除）
    const remainingChallenges = challenges.filter(c => c !== challengeRecord);
    await kv.put("passkey-challenges", remainingChallenges);

    return ok({ verified: true });
  } catch (err) {
    return handleError(err);
  }
}
