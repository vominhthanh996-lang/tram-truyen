import { createClient } from "npm:@supabase/supabase-js@2";
import { jsonResponse, requiredEnv, signPayosData } from "../_shared/payos.ts";

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return jsonResponse({ ok: true });
  if (request.method !== "POST") return jsonResponse({ error: "METHOD_NOT_ALLOWED" }, 405);

  try {
    const supabaseUrl = requiredEnv("SUPABASE_URL");
    const serviceRoleKey = requiredEnv("SUPABASE_SERVICE_ROLE_KEY");
    const payosClientId = requiredEnv("PAYOS_CLIENT_ID");
    const payosApiKey = requiredEnv("PAYOS_API_KEY");
    const payosChecksumKey = requiredEnv("PAYOS_CHECKSUM_KEY");
    const siteUrl = Deno.env.get("SITE_URL") || "https://vominhthanh996-lang.github.io/truyen-2k/";
    const authHeader = request.headers.get("Authorization") || "";

    if (!authHeader.toLowerCase().startsWith("bearer ")) {
      return jsonResponse({ error: "LOGIN_REQUIRED" }, 401);
    }

    const supabase = createClient(supabaseUrl, serviceRoleKey, {
      global: { headers: { Authorization: authHeader } }
    });
    const admin = createClient(supabaseUrl, serviceRoleKey);
    const { data: userData, error: userError } = await supabase.auth.getUser();
    if (userError || !userData.user) return jsonResponse({ error: "LOGIN_REQUIRED" }, 401);

    const { packageId } = await request.json();
    const { data: pack, error: packError } = await admin
      .from("coin_packages")
      .select("id,title,description,price_vnd,coins,bonus_coins")
      .eq("id", packageId)
      .eq("is_active", true)
      .maybeSingle();

    if (packError) throw packError;
    if (!pack) return jsonResponse({ error: "PACKAGE_NOT_FOUND" }, 404);

    const totalCoins = Number(pack.coins || 0) + Number(pack.bonus_coins || 0);
    const orderCode = Number(`${Date.now()}${Math.floor(Math.random() * 90 + 10)}`.slice(-15));
    const description = `T2K${orderCode}`;

    const { data: order, error: orderError } = await admin
      .from("payment_orders")
      .insert({
        user_id: userData.user.id,
        provider: "payos",
        package_id: pack.id,
        order_code: orderCode,
        amount_vnd: pack.price_vnd,
        coins: totalCoins,
        status: "pending"
      })
      .select("id,order_code")
      .single();

    if (orderError) throw orderError;

    const paymentData = {
      orderCode,
      amount: Number(pack.price_vnd),
      description,
      cancelUrl: `${siteUrl}#/account`,
      returnUrl: `${siteUrl}#/account`,
      buyerName: userData.user.user_metadata?.display_name || userData.user.email || "Doc gia",
      buyerEmail: userData.user.email || "",
      items: [
        {
          name: pack.title,
          quantity: 1,
          price: Number(pack.price_vnd)
        }
      ]
    };

    const signature = await signPayosData({
      amount: paymentData.amount,
      cancelUrl: paymentData.cancelUrl,
      description: paymentData.description,
      orderCode: paymentData.orderCode,
      returnUrl: paymentData.returnUrl
    }, payosChecksumKey);
    const payosResponse = await fetch("https://api-merchant.payos.vn/v2/payment-requests", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-client-id": payosClientId,
        "x-api-key": payosApiKey
      },
      body: JSON.stringify({ ...paymentData, signature })
    });
    const payosPayload = await payosResponse.json();
    if (!payosResponse.ok || payosPayload.code !== "00") {
      await admin
        .from("payment_orders")
        .update({ status: "failed", raw_provider_data: payosPayload, updated_at: new Date().toISOString() })
        .eq("id", order.id);
      return jsonResponse({ error: "PAYOS_CREATE_FAILED", detail: payosPayload }, 502);
    }

    const payosData = payosPayload.data || {};
    await admin
      .from("payment_orders")
      .update({
        checkout_url: payosData.checkoutUrl || null,
        qr_code: payosData.qrCode || null,
        payment_link_id: payosData.paymentLinkId || null,
        raw_provider_data: payosPayload,
        updated_at: new Date().toISOString()
      })
      .eq("id", order.id);

    return jsonResponse({
      orderId: order.id,
      orderCode,
      amountVnd: Number(pack.price_vnd),
      coins: totalCoins,
      description,
      checkoutUrl: payosData.checkoutUrl || "",
      qrCode: payosData.qrCode || ""
    });
  } catch (error) {
    return jsonResponse({ error: error instanceof Error ? error.message : "UNKNOWN_ERROR" }, 500);
  }
});
