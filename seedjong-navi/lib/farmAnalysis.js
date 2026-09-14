import { isSupabaseConfigured, supabase } from "./supabase";

export async function analyzeFarmLocation({ regionId, address, latitude, longitude }) {
  if (!isSupabaseConfigured || !supabase) throw new Error("Supabase 연결 설정이 없습니다.");
  const body = { regionId };
  if (address?.trim()) body.address = address.trim();
  else {
    body.latitude = latitude;
    body.longitude = longitude;
  }
  const { data, error } = await supabase.functions.invoke("analyze-farm", { body });
  if (error) {
    let message = error.message;
    try {
      const response = error.context;
      if (response?.json) message = (await response.json())?.error || message;
    } catch {}
    throw new Error(message || "농지 분석에 실패했습니다.");
  }
  if (data?.error) throw new Error(data.error);
  return data;
}
