import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const encoder = new TextEncoder();

const base64Url = (bytes: Uint8Array) => {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
};

const encodeJson = (value: unknown) => base64Url(encoder.encode(JSON.stringify(value)));

const sha256Hex = async (value: string) => {
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", encoder.encode(value)));
  return Array.from(digest, (byte) => byte.toString(16).padStart(2, "0")).join("");
};

const sign = async (value: string, secret: string) => {
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  return base64Url(new Uint8Array(await crypto.subtle.sign("HMAC", key, encoder.encode(value))));
};

const safeEqual = (left: string, right: string) => {
  if (left.length !== right.length) return false;
  let difference = 0;
  for (let index = 0; index < left.length; index += 1) {
    difference |= left.charCodeAt(index) ^ right.charCodeAt(index);
  }
  return difference === 0;
};

const decodeState = async (state: string, secret: string) => {
  const [payload, signature] = state.split(".");
  if (!payload || !signature || !safeEqual(signature, await sign(payload, secret))) {
    throw new Error("Invalid OAuth state");
  }
  const padded = payload.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(payload.length / 4) * 4, "=");
  const bytes = Uint8Array.from(atob(padded), (character) => character.charCodeAt(0));
  const value = JSON.parse(new TextDecoder().decode(bytes));
  if (!value.redirectTo || !value.nonce || Number(value.expiresAt) < Date.now()) {
    throw new Error("Expired OAuth state");
  }
  return value as { redirectTo: string; nonce: string; expiresAt: number };
};

const isPrivateIPv4 = (hostname: string) => {
  const parts = hostname.split(".").map(Number);
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) return false;
  return parts[0] === 10 || (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) || (parts[0] === 192 && parts[1] === 168);
};

const isAllowedRedirect = (value: string) => {
  try {
    const url = new URL(value);
    if (url.protocol === "seedjongnavi:") return url.hostname === "auth" && url.pathname === "/callback";
    const isCallbackPath = url.pathname.endsWith("/auth/callback") || url.pathname.endsWith("/--/auth/callback");
    if (!isCallbackPath) return false;
    if (url.protocol === "exp:") return url.hostname === "localhost" || url.hostname === "127.0.0.1" || isPrivateIPv4(url.hostname);
    if (url.protocol === "http:") return url.hostname === "localhost" || url.hostname === "127.0.0.1";
    const allowedOrigins = (Deno.env.get("KAKAO_ALLOWED_WEB_ORIGINS") ?? "")
      .split(",")
      .map((origin) => origin.trim())
      .filter(Boolean);
    return url.protocol === "https:" && allowedOrigins.includes(url.origin);
  } catch {
    return false;
  }
};

const redirect = (location: string) => new Response(null, {
  status: 302,
  headers: { Location: location, "Cache-Control": "no-store" },
});

const redirectError = (redirectTo: string, message: string) => {
  const target = new URL(redirectTo);
  target.searchParams.set("error", "kakao_oidc_error");
  target.searchParams.set("error_description", message.slice(0, 300));
  return redirect(target.toString());
};

Deno.serve(async (request) => {
  const requestUrl = new URL(request.url);
  const kakaoClientId = Deno.env.get("KAKAO_CLIENT_ID");
  const kakaoClientSecret = Deno.env.get("KAKAO_CLIENT_SECRET");
  const stateSecret = Deno.env.get("KAKAO_STATE_SECRET");
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY");

  if (!kakaoClientId || !kakaoClientSecret || !stateSecret || !supabaseUrl || !supabaseAnonKey) {
    return new Response("Kakao OIDC is not configured", { status: 500 });
  }

  const functionCallbackUrl = `${supabaseUrl}/functions/v1/kakao-oidc`;
  const code = requestUrl.searchParams.get("code");
  const state = requestUrl.searchParams.get("state");
  const upstreamError = requestUrl.searchParams.get("error_description") || requestUrl.searchParams.get("error");

  if (!code && state && upstreamError) {
    try {
      const stateData = await decodeState(state, stateSecret);
      return redirectError(stateData.redirectTo, upstreamError);
    } catch {
      return new Response("Invalid OAuth state", { status: 400 });
    }
  }

  if (!code) {
    const redirectTo = requestUrl.searchParams.get("redirect_to");
    if (!redirectTo || !isAllowedRedirect(redirectTo)) {
      return new Response("Invalid redirect_to", { status: 400 });
    }

    const nonce = crypto.randomUUID();
    const payload = encodeJson({ redirectTo, nonce, expiresAt: Date.now() + 10 * 60 * 1000 });
    const signedState = `${payload}.${await sign(payload, stateSecret)}`;
    const authorizeUrl = new URL("https://kauth.kakao.com/oauth/authorize");
    authorizeUrl.search = new URLSearchParams({
      response_type: "code",
      client_id: kakaoClientId,
      redirect_uri: functionCallbackUrl,
      scope: "openid profile_nickname profile_image",
      state: signedState,
      nonce: await sha256Hex(nonce),
    }).toString();
    return redirect(authorizeUrl.toString());
  }

  if (!state) return new Response("Missing OAuth state", { status: 400 });

  let stateData: { redirectTo: string; nonce: string; expiresAt: number };
  try {
    stateData = await decodeState(state, stateSecret);
    if (!isAllowedRedirect(stateData.redirectTo)) throw new Error("Invalid redirect target");
  } catch (error) {
    return new Response(error instanceof Error ? error.message : "Invalid OAuth state", { status: 400 });
  }

  try {
    const tokenResponse = await fetch("https://kauth.kakao.com/oauth/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded;charset=utf-8" },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        client_id: kakaoClientId,
        client_secret: kakaoClientSecret,
        redirect_uri: functionCallbackUrl,
        code,
      }),
    });
    const tokenData = await tokenResponse.json();
    if (!tokenResponse.ok || !tokenData.id_token) {
      throw new Error(tokenData.error_description || tokenData.error || "Kakao token exchange failed");
    }

    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data, error } = await supabase.auth.signInWithIdToken({
      provider: "kakao",
      token: tokenData.id_token,
      nonce: stateData.nonce,
    });
    if (error) throw error;
    if (!data.session) throw new Error("Supabase session was not created");

    const target = new URL(stateData.redirectTo);
    target.hash = new URLSearchParams({
      access_token: data.session.access_token,
      refresh_token: data.session.refresh_token,
      expires_in: String(data.session.expires_in ?? 3600),
      token_type: data.session.token_type ?? "bearer",
      provider: "kakao",
    }).toString();
    return redirect(target.toString());
  } catch (error) {
    return redirectError(stateData.redirectTo, error instanceof Error ? error.message : "Kakao login failed");
  }
});
