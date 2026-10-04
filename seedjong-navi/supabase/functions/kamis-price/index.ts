// 작물 이름 하나를 받아 KAMIS 오늘자(또는 가장 최근 거래일) 도매가격을 조회한다.
// KAMIS_CERT_KEY/KAMIS_CERT_ID는 Supabase 시크릿으로만 읽는다 — 클라이언트에는 절대 내려주지 않는다.
// 품목명 매핑은 ml/train_price_forecast.py의 ITEM_ALIASES를 뒤집은 것과 같아야 한다.
// (거기서 KAMIS 품목명이 추가/변경되면 여기도 같이 갱신할 것)

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { ...cors, "Content-Type": "application/json" },
});

const KAMIS_URL = "https://www.kamis.or.kr/service/price/xml.do";
const CATEGORIES = ["100", "200", "300", "400"];
const MAX_LOOKBACK_DAYS = 5; // 주말·공휴일 등 휴장일을 건너뛰기 위한 최대 조회 범위

const CROP_TO_KAMIS_ITEMS: Record<string, string[]> = {
  "벼": ["쌀"],
  "콩(대두)": ["콩"],
  "밀": ["밀"],
  "보리": ["보리"],
  "팥": ["팥"],
  "녹두": ["녹두"],
  "메밀": ["메밀"],
  "감자": ["감자"],
  "고구마": ["고구마"],
  "옥수수(사료용)": ["옥수수"],
  "땅콩": ["땅콩"],
  "참깨": ["참깨"],
  "들깨": ["들깨"],
  "배추": ["배추"],
  "무": ["무"],
  "양배추": ["양배추"],
  "브로콜리": ["브로콜리"],
  "상추": ["상추"],
  "시금치": ["시금치"],
  "당근": ["당근"],
  "대파": ["대파"],
  "오이": ["오이"],
  "애호박": ["애호박"],
  "토마토": ["토마토"],
  "가지": ["가지"],
  "수박": ["수박"],
  "딸기": ["딸기"],
  "사과": ["사과"],
  "배": ["배"],
  "포도": ["포도"],
  "복숭아": ["복숭아"],
  "양파": ["양파"],
  "마늘": ["깐마늘(국산)", "마늘(국산)"],
  "고추": ["건고추", "풋고추"],
};

type KamisItem = {
  item_name?: string;
  dpr1?: string;
  unit?: string;
  rank?: string;
};

function isoDateKST(offsetDays: number): string {
  // Deno Deploy는 UTC로 돈다 — KST(UTC+9) 날짜 문자열을 만들기 위해 9시간을 더한 뒤
  // UTC 기준으로 날짜만 뽑아낸다.
  const kst = new Date(Date.now() + 9 * 60 * 60 * 1000);
  kst.setUTCDate(kst.getUTCDate() - offsetDays);
  return kst.toISOString().slice(0, 10);
}

async function kamisRequest(day: string, category: string, certKey: string, certId: string): Promise<unknown> {
  const params = new URLSearchParams({
    action: "dailyPriceByCategoryList",
    p_product_cls_code: "02",
    p_item_category_code: category,
    p_regday: day,
    p_convert_kg_yn: "Y",
    p_cert_key: certKey,
    p_cert_id: certId,
    p_returntype: "json",
  });
  const response = await fetch(`${KAMIS_URL}?${params}`);
  if (!response.ok) throw new Error(`KAMIS 요청 실패 (${response.status})`);
  return response.json();
}

function unwrapItems(payload: unknown): KamisItem[] {
  const root = (payload ?? {}) as Record<string, unknown>;
  let data = root.data ?? {};
  if (Array.isArray(data)) data = data[0] ?? {};
  const record = data as Record<string, unknown>;
  const code = String(record.error_code ?? record.code ?? "000");
  if (code !== "000" && code !== "0") {
    throw new Error(`KAMIS 응답 오류 코드 ${code}`);
  }
  const items = record.item ?? [];
  return (Array.isArray(items) ? items : [items]) as KamisItem[];
}

function toPrice(value: unknown): number | null {
  const text = String(value ?? "").replace(/[^0-9.]/g, "");
  if (!text) return null;
  const result = Number(text);
  return result > 0 ? result : null;
}

function pickBestRank(priced: { item: KamisItem; price: number }[]) {
  return (
    priced.find((entry) => String(entry.item.rank || "").includes("상품"))
    || priced.find((entry) => String(entry.item.rank || "").includes("상"))
    || priced[0]
  );
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const { crop } = await request.json();
    if (!crop || typeof crop !== "string") return json({ error: "crop 파라미터가 필요합니다." }, 400);

    const kamisItemNames = CROP_TO_KAMIS_ITEMS[crop];
    if (!kamisItemNames) return json({ error: `'${crop}'의 KAMIS 품목 매핑이 없습니다.` }, 404);

    const certKey = Deno.env.get("KAMIS_CERT_KEY");
    const certId = Deno.env.get("KAMIS_CERT_ID");
    if (!certKey || !certId) throw new Error("KAMIS_CERT_KEY/KAMIS_CERT_ID가 설정되지 않았습니다.");

    for (let offset = 0; offset <= MAX_LOOKBACK_DAYS; offset++) {
      const day = isoDateKST(offset);
      const perCategory = await Promise.all(
        CATEGORIES.map((category) =>
          kamisRequest(day, category, certKey, certId).then(unwrapItems).catch(() => [] as KamisItem[])
        )
      );
      const priced = perCategory
        .flat()
        .filter((item) => kamisItemNames.includes(String(item.item_name || "").trim()))
        .map((item) => ({ item, price: toPrice(item.dpr1) }))
        .filter((entry): entry is { item: KamisItem; price: number } => entry.price !== null);

      if (priced.length) {
        const picked = pickBestRank(priced);
        return json({
          crop,
          priceWon: picked.price,
          unit: "kg", // p_convert_kg_yn=Y의 dpr1은 1kg 기준, unit은 원래 포장 단위로 남는다.
          sourceItem: picked.item.item_name,
          rank: picked.item.rank,
          regday: day,
          market: "KAMIS 전국 도매가격",
        });
      }
    }

    return json({ error: `'${crop}'의 최근 ${MAX_LOOKBACK_DAYS}일 내 KAMIS 시세를 찾지 못했습니다.` }, 404);
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : String(error) }, 500);
  }
});
