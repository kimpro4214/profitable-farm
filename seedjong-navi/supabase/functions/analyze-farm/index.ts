import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { ...cors, "Content-Type": "application/json" },
});

type KakaoAddress = {
  address_name?: string;
  b_code?: string;
  mountain_yn?: "Y" | "N";
  main_address_no?: string;
  sub_address_no?: string;
  x?: string;
  y?: string;
};

const finite = (value: unknown) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

function buildPnu(address?: KakaoAddress | null) {
  if (!address?.b_code || !address.main_address_no) return null;
  const mountain = address.mountain_yn === "Y" ? "2" : "1";
  return address.b_code.padStart(10, "0")
    + mountain
    + address.main_address_no.padStart(4, "0")
    + (address.sub_address_no || "0").padStart(4, "0");
}

async function kakao(path: string, key: string) {
  const response = await fetch(`https://dapi.kakao.com${path}`, {
    headers: { Authorization: `KakaoAK ${key}` },
  });
  const body = await response.json();
  if (!response.ok) throw new Error(body?.message || `카카오 주소 API 오류 (${response.status})`);
  return body;
}

async function resolveParcel(input: { address?: string; latitude?: number; longitude?: number }, key?: string) {
  if (input.address?.trim()) {
    if (!key) throw new Error("지번 주소 분석에는 Supabase Edge Function의 KAKAO_CLIENT_ID 설정이 필요합니다.");
    const body = await kakao(`/v2/local/search/address.json?query=${encodeURIComponent(input.address.trim())}`, key);
    const document = body?.documents?.[0];
    const address = document?.address as KakaoAddress | undefined;
    if (!address) throw new Error("입력한 지번 주소를 찾지 못했습니다.");
    return {
      address: address.address_name || input.address.trim(),
      pnu: buildPnu(address),
      latitude: finite(address.y),
      longitude: finite(address.x),
    };
  }

  const latitude = finite(input.latitude);
  const longitude = finite(input.longitude);
  if (latitude == null || longitude == null) throw new Error("지번 주소 또는 지도 핀을 입력해 주세요.");
  if (!key) return { address: null, pnu: null, latitude, longitude };
  try {
    const body = await kakao(
      `/v2/local/geo/coord2address.json?x=${longitude}&y=${latitude}&input_coord=WGS84`,
      key,
    );
    const address = body?.documents?.[0]?.address as KakaoAddress | undefined;
    return {
      address: address?.address_name || null,
      pnu: buildPnu(address),
      latitude,
      longitude,
    };
  } catch {
    // KRC's spatial lookup can still run if reverse geocoding is unavailable.
    return { address: null, pnu: null, latitude, longitude };
  }
}

function xmlValue(xml: string, tag: string) {
  const match = xml.match(new RegExp(`<${tag}>(?:<!\\[CDATA\\[)?(.*?)(?:\\]\\]>)?</${tag}>`, "is"));
  return match?.[1]?.trim() || null;
}

async function fetchSoil(pnu: string | null, serviceKey?: string) {
  if (!pnu) return { available: false, reason: "정확한 지번(PNU)을 만들 수 없습니다." };
  if (!serviceKey) return { available: false, reason: "흙토람 API 키가 설정되지 않았습니다." };

  const url = new URL("https://apis.data.go.kr/1390802/SoilEnviron/SoilExam/V2/getSoilExam");
  url.searchParams.set("serviceKey", serviceKey);
  url.searchParams.set("PNU_CD", pnu);
  const response = await fetch(url);
  const xml = await response.text();
  if (!response.ok) return { available: false, reason: `흙토람 API 오류 (${response.status})` };
  const resultCode = xmlValue(xml, "Result_Code") || xmlValue(xml, "resultCode");
  const ph = finite(xmlValue(xml, "ACID"));
  const ec = finite(xmlValue(xml, "ELCD"));
  if (resultCode && resultCode !== "200" || ph == null && ec == null) {
    return { available: false, reason: xmlValue(xml, "Result_Msg") || "최근 3년 토양검정 결과가 없습니다." };
  }
  return {
    available: true,
    ph,
    ecDsM: ec,
    sampledYear: xmlValue(xml, "Any_Year"),
    examinedAt: xmlValue(xml, "Exam_Day"),
    fieldType: xmlValue(xml, "Exam_Type"),
    address: xmlValue(xml, "PNU_Nm"),
    source: "농촌진흥청 흙토람 토양검정 화학성 상세정보 V2",
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const authorization = req.headers.get("Authorization") || "";
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const kakaoKey = Deno.env.get("KAKAO_CLIENT_ID");
    if (!supabaseUrl || !serviceRoleKey) {
      return json({ error: "Supabase 또는 카카오 주소 API 서버 설정이 없습니다." }, 503);
    }

    const input = await req.json();
    const parcel = await resolveParcel(input, kakaoKey);
    if (parcel.latitude == null || parcel.longitude == null) throw new Error("농지 좌표를 확인하지 못했습니다.");

    const db = createClient(supabaseUrl, serviceRoleKey);
    const [{ data: conditions, error: conditionsError }, { data: groundwater, error: groundwaterError }, soil] = await Promise.all([
      db.rpc("lookup_farm_conditions", { p_lat: parcel.latitude, p_lng: parcel.longitude }),
      db.rpc("lookup_groundwater_conditions", { p_lat: parcel.latitude, p_lng: parcel.longitude }),
      fetchSoil(parcel.pnu, Deno.env.get("DATA_GO_KR_SERVICE_KEY")),
    ]);

    const analysis = {
      parcel,
      zone: conditionsError
        ? { available: false, reason: "KRC 공간데이터가 아직 적재되지 않았습니다." }
        : {
          available: true,
          type: conditions?.zoneType,
          matched: conditions?.zoneMatched,
          source: conditions?.zoneSource,
        },
      water: conditionsError || !conditions?.water
        ? { available: false, reason: "위치가 등록된 저수지 수질자료가 없습니다." }
        : { available: true, ...conditions.water },
      groundwater: groundwaterError
        ? { available: false, reason: "KRC 지하수 공간 데이터 적재 중입니다." }
        : { available: true, ...groundwater, source: "KRC 지하수 관정·이용량·오염예측도" },
      soil,
      analyzedAt: new Date().toISOString(),
    };

    if (authorization.startsWith("Bearer ")) {
      const token = authorization.slice(7);
      const { data: userResult } = await db.auth.getUser(token);
      if (userResult?.user) {
        await db.from("farm_profiles").upsert({
          user_id: userResult.user.id,
          region_id: input.regionId || null,
          address: parcel.address,
          pnu: parcel.pnu,
          latitude: parcel.latitude,
          longitude: parcel.longitude,
          analysis,
          analyzed_at: analysis.analyzedAt,
          updated_at: analysis.analyzedAt,
        }, { onConflict: "user_id" });
      }
    }

    return json(analysis);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("analyze-farm failed", message);
    return json({ error: message }, 400);
  }
});
