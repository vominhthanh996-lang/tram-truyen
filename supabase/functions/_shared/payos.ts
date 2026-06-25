const encoder = new TextEncoder();

export function sortObject(value: Record<string, unknown>) {
  return Object.fromEntries(
    Object.entries(value)
      .filter(([, item]) => item !== undefined && item !== null)
      .sort(([a], [b]) => a.localeCompare(b))
  );
}

export function buildSignatureData(value: Record<string, unknown>) {
  return Object.entries(sortObject(value))
    .map(([key, item]) => `${key}=${String(item)}`)
    .join("&");
}

export async function hmacSha256Hex(message: string, secret: string) {
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(message));
  return [...new Uint8Array(signature)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

export async function signPayosData(data: Record<string, unknown>, checksumKey: string) {
  return hmacSha256Hex(buildSignatureData(data), checksumKey);
}

export async function verifyPayosSignature(
  data: Record<string, unknown>,
  signature: string,
  checksumKey: string
) {
  const expected = await signPayosData(data, checksumKey);
  return expected.toLowerCase() === String(signature || "").toLowerCase();
}

export function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS"
    }
  });
}

export function requiredEnv(name: string) {
  const value = Deno.env.get(name);
  if (!value) throw new Error(`Missing ${name}`);
  return value;
}
