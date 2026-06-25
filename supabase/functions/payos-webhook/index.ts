import { createClient } from "npm:@supabase/supabase-js@2";
import { jsonResponse, requiredEnv, verifyPayosSignature } from "../_shared/payos.ts";

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return jsonResponse({ ok: true });
  if (request.method !== "POST") return jsonResponse({ error: "METHOD_NOT_ALLOWED" }, 405);

  try {
    const checksumKey = requiredEnv("PAYOS_CHECKSUM_KEY");
    const supabaseUrl = requiredEnv("SUPABASE_URL");
    const serviceRoleKey = requiredEnv("SUPABASE_SERVICE_ROLE_KEY");
    const payload = await request.json();
    const data = payload.data || {};
    const signature = payload.signature || "";

    const verified = await verifyPayosSignature(data, signature, checksumKey);
    if (!verified) return jsonResponse({ error: "INVALID_SIGNATURE" }, 401);

    const orderCode = Number(data.orderCode);
    const amount = Number(data.amount || 0);
    const reference = String(data.reference || data.paymentLinkId || orderCode);

    if (!payload.success || !orderCode || amount <= 0) {
      return jsonResponse({ received: true, ignored: true });
    }

    const admin = createClient(supabaseUrl, serviceRoleKey);
    const { data: credited, error } = await admin.rpc("credit_payment_order", {
      p_order_code: orderCode,
      p_provider: "payos",
      p_provider_reference: reference,
      p_amount_vnd: amount,
      p_raw: payload
    });

    if (error) throw error;

    return jsonResponse({
      code: "00",
      desc: "success",
      data: credited
    });
  } catch (error) {
    return jsonResponse({ error: error instanceof Error ? error.message : "UNKNOWN_ERROR" }, 500);
  }
});
