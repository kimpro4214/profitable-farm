import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { importedDocuments } from "./imported_documents.ts";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });

// 초기 1회 저장되는 서비스 내 기준 문서. 원본 공공데이터의 최신 수치나
// 농약 처방을 단정하지 않으며, 실제 추천·예측 화면의 해석을 돕는 용도다.
const seedDocuments = [
  {
    title: "수익농가 작물 추천 점수 해석",
    source_url: null,
    content: "수익농가의 작물 추천은 가뭄 위험, 저수지·관개 여건, 염류, 지하수 안정성, 농업진흥·보호구역 조건, 기후, 토양 pH, 최근 병해충 이력의 8개 축을 종합한 참고 점수다. 점수가 높아도 실제 재배 가능 여부와 농지 규제는 토지대장, 농업기술센터, 관할 지자체에서 최종 확인해야 한다. 점수는 의사결정을 돕는 보조 정보이며 수익을 보장하지 않는다.",
  },
  {
    title: "가뭄·관개 여건을 반영한 재배 판단",
    source_url: null,
    content: "가뭄 위험이 높거나 저수지와 지하수 여건이 낮은 필지는 물 의존도가 높은 작물의 위험이 커질 수 있다. 파종 전에는 관개 가능량, 용수 공급 시기, 배수 상태를 확인하고, 필요하면 점적관수·멀칭 등 절수 방식을 검토한다. 실제 저수지 수위와 가뭄 정보는 한국농어촌공사와 지자체의 최신 공지로 확인한다.",
  },
  {
    title: "토양 pH·염류와 작물 선택의 원칙",
    source_url: null,
    content: "작물마다 적정 토양 pH와 염류 내성이 다르다. 토양검정을 먼저 받고, pH나 EC가 작물의 적정 범위를 벗어나면 석회·유기물·관개·배수 등 관리 대안을 농업기술센터와 상담한다. 염류가 높을 수 있는 시설재배지와 해안 인접지는 특히 토양검정 결과를 우선한다.",
  },
  {
    title: "작부체계와 병해충 이력 유의사항",
    source_url: null,
    content: "최근 같은 과 작물을 재배했고 병해충 문제가 있었다면 연작 위험을 낮추기 위해 다른 과 작물로 돌려짓기를 검토한다. 병해충 방제는 작물·시기·등록 약제에 따라 달라지므로 임의 처방을 하지 말고 농촌진흥청 등록정보와 지역 농업기술센터 지도를 확인한다.",
  },
  {
    title: "가격 예측과 손익계산의 한계",
    source_url: null,
    content: "가격 예측은 KAMIS 과거 가격과 날씨 특징을 사용한 단기 참고치이며, 작황·출하량·유통·정책·재해 같은 급격한 변동을 완전히 반영하지 못한다. 손익계산의 수량·비용·보조금은 MVP 기준값일 수 있으므로 실제 경영 판단에는 본인의 재배면적, 계약재배 조건, 자재비, 인건비, 지역 지원사업을 입력해 다시 검토해야 한다.",
  },
  {
    title: "안전한 농업 의사결정 안내",
    source_url: null,
    content: "수익농가 답변은 교육·참고 목적이다. 농약 사용, 비료 처방, 병해 진단, 법률·보조금 신청, 재해 대응처럼 피해나 비용이 클 수 있는 사항은 공공기관의 최신 안내와 농업기술센터·전문가 확인을 우선한다. 자료에 근거가 없으면 추측하지 않는다.",
  },
];

async function gemini(path: string, body: unknown, apiKey: string) {
  const response = await fetch(
    "https://generativelanguage.googleapis.com/v1beta/" + path,
    {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
      body: JSON.stringify(body),
    },
  );
  const result = await response.json();
  if (!response.ok) throw new Error(result?.error?.message ?? "Gemini request failed");
  return result;
}

async function createEmbedding(text: string, taskType: string, apiKey: string) {
  const embedded = await gemini(
    "models/gemini-embedding-001:embedContent",
    {
      model: "models/gemini-embedding-001",
      content: { parts: [{ text }] },
      taskType,
      outputDimensionality: 768,
    },
    apiKey,
  );
  const embedding = embedded?.embedding?.values;
  if (!embedding) throw new Error("임베딩 생성에 실패했습니다.");
  return embedding;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const { question, regionName, history } = await req.json();
    if (!question?.trim()) return json({ error: "질문을 입력해 주세요." }, 400);

    const geminiKey = Deno.env.get("GEMINI_API_KEY");
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!geminiKey || !supabaseUrl || !serviceRoleKey) {
      return json({ error: "Gemini 또는 Supabase 서버 환경변수가 설정되지 않았습니다." }, 503);
    }

    const db = createClient(supabaseUrl, serviceRoleKey);
    const { count, error: countError } = await db
      .from("documents")
      .select("id", { count: "exact", head: true });
    if (countError) throw countError;

    const { count: importedCount, error: importedCountError } = await db
      .from("documents")
      .select("id", { count: "exact", head: true })
      .eq("metadata->>import_version", "3");
    if (importedCountError) throw importedCountError;

    if (count === 0 || importedCount === 0) {
      if (count !== 0 && importedCount === 0) {
        const { error: deleteError } = await db
          .from("documents")
          .delete()
          .in("metadata->>source", ["krc-import", "rda-import"]);
        if (deleteError) throw deleteError;
      }
      const rows = [];
      const documentsToInsert = count === 0
        ? [...seedDocuments, ...importedDocuments]
        : importedDocuments;
      for (const document of documentsToInsert) {
        const metadata = (document as { metadata?: { organization?: string; [key: string]: unknown } }).metadata;
        rows.push({
          ...document,
          metadata: {
            ...(metadata ?? {}),
            source: metadata?.organization === "한국농어촌공사"
              ? "krc-import"
              : metadata?.organization === "농촌진흥청"
                ? "rda-import"
                : "seedjong-navi",
          },
          embedding: await createEmbedding(document.content, "RETRIEVAL_DOCUMENT", geminiKey),
        });
      }
      const { error: seedError } = await db.from("documents").insert(rows);
      if (seedError) throw seedError;
    }

    const embedding = await createEmbedding(question, "RETRIEVAL_QUERY", geminiKey);
    const { data: docs, error } = await db.rpc("match_documents", {
      query_embedding: embedding,
      match_count: 5,
    });
    if (error) throw error;
    const context = (docs ?? [])
      .map((d: { title: string; content: string; metadata?: { organization?: string } }, index: number) => {
        const organization = d.metadata?.organization ? d.metadata.organization + " " : "";
        return "[" + (index + 1) + "] " + organization + d.title + "\n" + d.content;
      })
      .join("\n\n");

    const recentConversation = Array.isArray(history)
      ? history
        .slice(-8)
        .filter((message: unknown) => (
          typeof message === "object"
          && message !== null
          && "text" in message
          && typeof (message as { text?: unknown }).text === "string"
        ))
        .map((message: { role?: string; text: string }) => (
          `${message.role === "bot" ? "도우미" : "사용자"}: ${message.text.slice(0, 1000)}`
        ))
        .join("\n")
      : "";
    const prompt = "지역: " + (regionName || "미지정")
      + (recentConversation ? "\n\n최근 대화:\n" + recentConversation : "")
      + "\n\n현재 질문: " + question
      + "\n\n참고 자료:\n" + (context || "관련 자료가 없습니다.");
    const generated = await gemini(
      "models/gemini-3.5-flash-lite:generateContent",
      {
        system_instruction: {
          parts: [{
            text: "너는 수익농가 농업 도우미다. 한국어로 친절하고 실용적으로 답한다. 참고 자료가 질문과 관련 있으면 그 내용을 우선 활용한다. 자료 제목 앞에 '한국농어촌공사'가 표시된 자료의 사실·수치를 답변에 활용할 때만 해당 문장에 자연스럽게 '한국농어촌공사 「자료 제목」에 따르면, …' 또는 '…라고 안내합니다.'처럼 출처를 붙인다. KRC가 아닌 내부 안내 자료나 일반 지식에는 출처 문구를 붙이지 않는다. 답변 끝에 '참고 자료 기반', '일반 농업 정보', 출처 목록 같은 기계적인 표시는 절대 쓰지 않는다. 자료에 없는 내용도 일반적인 농업 지식을 바탕으로 답할 수 있으며, 자료가 없다는 이유만으로 답변을 거절하지 않는다. 다만 수량·가격·날씨·지원금처럼 최신 지역 데이터가 필요한 값은 단정하지 말고 확인 경로를 안내한다. 농약 제품·희석배수·처방, 병해 확진, 법률·보조금 신청, 재해 대응처럼 안전·비용 영향이 큰 사항은 일반 원칙만 설명하고 농업기술센터나 공공기관의 최신 안내 확인을 권한다.",
          }],
        },
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.3 },
      },
      geminiKey,
    );
    const answer = generated?.candidates?.[0]?.content?.parts
      ?.map((part: { text?: string }) => part.text ?? "")
      .join("");
    return json({
      answer: answer || "답변을 생성하지 못했습니다.",
      sources: (docs ?? []).map((d: { title: string; source_url?: string }) => ({
        label: d.title,
        url: d.source_url,
      })),
    });
  } catch (error) {
    const message = error instanceof Error
      ? error.message
      : typeof error === "object" && error && "message" in error
        ? String((error as { message: unknown }).message)
        : JSON.stringify(error);
    console.error("ask-rag failed:", message);
    return json({ error: message || "unknown error" }, 500);
  }
});
