import { setSessionCookie, ADMIN_USER } from "@/lib/auth";
import { ok, fail, handleError, readBody } from "@/lib/api";
import { getKV } from "@/lib/kv";
import { verifyAuthenticationResponse } from "@simplewebauthn/server";
import { getRpId, getRpOrigin } from "@/lib/passkey-config";

interface StoredCredential {
  credentialId: string;
  publicKey: number[];
  counter: number;
  transports?: string[];
}

/**
 * POST /api/auth/passkey/login-verify
 * 验证 passkey 登录响应并设置 session cookie。
 */
export async function POST(req: Request) {
  try {
    const body = await readBody<{ credential?: { id?: string; [k: string]: unknown } }>(req);
    if (!body.credential) return fail("缺少 credential", 400);

    const rpId = getRpId(req);
    const rpOrigin = getRpOrigin(req);
    const kv = await getKV();

    // 查找最近的登录 challenge
    const challenges = await kv.get<Array<{ challenge: string; purpose: string; expiresAt: number }>>("passkey-challenges") || [];
    const challengeRecord = challenges
      .filter(c => c.purpose === "login" && c.expiresAt > Date.now())
      .sort((a, b) => b.expiresAt - a.expiresAt)[0];
    if (!challengeRecord) return fail("验证已过期，请重新点击 Passkey 登录", 400);

    // 查找凭证
    const credentialId = body.credential.id as string;
    const credentials = await kv.get<StoredCredential[]>("passkey-credentials") || [];
    const credentialRecord = credentials.find(c => c.credentialId === credentialId);
    if (!credentialRecord) return fail("未找到对应的 Passkey 凭证", 400);

    const verification = await verifyAuthenticationResponse({
      response: body.credential as never,
      expectedChallenge: challengeRecord.challenge,
      expectedOrigin: rpOrigin,
      expectedRPID: rpId,
      credential: {
        id: credentialRecord.credentialId,
        publicKey: new Uint8Array(credentialRecord.publicKey),
        counter: credentialRecord.counter || 0,
        transports: credentialRecord.transports,
      },
    });

    if (!verification.verified) {
      return fail("Passkey 登录验证失败", 400);
    }

    // 更新 counter
    credentialRecord.counter = verification.authenticationInfo.newCounter;
    await kv.put("passkey-credentials", credentials);

    // 删除已使用的 challenge
    const remainingChallenges = challenges.filter(c => c !== challengeRecord);
    await kv.put("passkey-challenges", remainingChallenges);

    await setSessionCookie(ADMIN_USER);
    return ok({ user: ADMIN_USER });
  } catch (err) {
    return handleError(err);
  }
}
