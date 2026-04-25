import { createHmac, timingSafeEqual } from "crypto";

/**
 * GitHub `X-Hub-Signature-256`（sha256=...）の検証。
 * @param secret Webhook シークレット
 * @param rawBody 署名計算前の生ボディ
 * @param signature ヘッダ `x-hub-signature-256` の値
 */
export function isValidHubSignature256(
  secret: string,
  rawBody: string,
  signature: string
): boolean {
  const expected = `sha256=${createHmac("sha256", secret).update(rawBody).digest("hex")}`;
  const expectedBuf = Buffer.from(expected);
  const actualBuf = Buffer.from(signature);
  return (
    expectedBuf.length === actualBuf.length && timingSafeEqual(expectedBuf, actualBuf)
  );
}
