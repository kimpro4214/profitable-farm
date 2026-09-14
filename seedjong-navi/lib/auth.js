import * as Linking from "expo-linking";
import * as WebBrowser from "expo-web-browser";
import { Platform } from "react-native";
import { isSupabaseConfigured, supabase } from "./supabase";

WebBrowser.maybeCompleteAuthSession();

// Standalone APKs must return to the registered native URL, never localhost.
function getOAuthRedirectUrl() {
  if (Platform.OS !== "web") return "seedjongnavi://auth/callback";
  return Linking.createURL("auth/callback");
}

export async function completeOAuthSession(url) {
  if (!url) return null;

  const parsed = new URL(url);
  const query = parsed.searchParams;
  const hash = new URLSearchParams(parsed.hash.replace(/^#/, ""));
  const errorDescription = query.get("error_description") || hash.get("error_description");
  const errorCode = query.get("error_code") || hash.get("error_code") || query.get("error") || hash.get("error");

  if (errorDescription || errorCode) {
    throw new Error(errorDescription || errorCode);
  }

  const code = query.get("code");
  if (code) {
    const { data, error } = await supabase.auth.exchangeCodeForSession(code);
    if (error) throw error;
    return data.session;
  }

  const access_token = query.get("access_token") || hash.get("access_token");
  const refresh_token = query.get("refresh_token") || hash.get("refresh_token");
  if (access_token && refresh_token) {
    const { data, error } = await supabase.auth.setSession({ access_token, refresh_token });
    if (error) throw error;
    return data.session;
  }

  return null;
}

export async function signInWithProvider(provider) {
  if (!isSupabaseConfigured) throw new Error("Supabase 환경변수를 먼저 설정해주세요.");
  const redirectTo = getOAuthRedirectUrl();

  if (provider === "kakao") {
    const functionUrl = `${process.env.EXPO_PUBLIC_SUPABASE_URL}/functions/v1/kakao-oidc?redirect_to=${encodeURIComponent(redirectTo)}`;
    if (Platform.OS === "web") {
      globalThis.location.assign(functionUrl);
      return null;
    }
    const result = await WebBrowser.openAuthSessionAsync(functionUrl, redirectTo);
    if (result.type !== "success") return null;
    return completeOAuthSession(result.url);
  }

  const { data, error } = await supabase.auth.signInWithOAuth({
    provider,
    options: { redirectTo, skipBrowserRedirect: Platform.OS !== "web" },
  });
  if (error) throw error;
  if (Platform.OS === "web") return null;
  const result = await WebBrowser.openAuthSessionAsync(data.url, redirectTo);
  if (result.type !== "success") return;
  return completeOAuthSession(result.url);
}

export async function getPostAuthRoute(session) {
  if (!session) return "/login";
  const [{ data: profile, error: profileError }, { data: farm, error: farmError }] = await Promise.all([
    supabase.from("profiles").select("onboarding_completed").eq("id", session.user.id).maybeSingle(),
    supabase.from("farm_profiles").select("region_id").maybeSingle(),
  ]);
  if (profileError) throw profileError;
  if (farmError) throw farmError;
  if (!profile?.onboarding_completed) return "/signup";
  return farm?.region_id ? "/(tabs)/home" : "/location-setup";
}
