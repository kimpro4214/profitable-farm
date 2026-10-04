import { isSupabaseConfigured, supabase } from "./supabase";

// kamis-price Edge Function 호출 — KAMIS 인증키는 서버(Supabase 시크릿)에만 있고
// 앱에는 내려오지 않는다.
export async function fetchLiveKamisPrice(crop) {
  if (!isSupabaseConfigured || !supabase) throw new Error("Supabase 연결 설정이 없습니다.");
  const { data, error } = await supabase.functions.invoke("kamis-price", { body: { crop } });
  if (error) {
    let message = error.message;
    try {
      const response = error.context;
      if (response?.json) message = (await response.json())?.error || message;
    } catch {}
    throw new Error(message || "KAMIS 시세 조회에 실패했습니다.");
  }
  if (data?.error) throw new Error(data.error);
  return data;
}
