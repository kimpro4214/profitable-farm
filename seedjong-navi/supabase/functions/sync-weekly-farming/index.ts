import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const RDA_LIST_URL = "https://www.nongsaro.go.kr/portal/ps/psz/psza/contentMain.ps?menuId=PS00199";
const RDA_DOWNLOAD_URL = "https://www.nongsaro.go.kr/portal/contentsFileDownload.do";

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { "Content-Type": "application/json; charset=utf-8" },
});

const clean = (value: string) => value
  .replace(/<[^>]+>/g, " ")
  .replace(/&nbsp;|&#160;/g, " ")
  .replace(/&amp;/g, "&")
  .replace(/\s+/g, " ")
  .trim();

function bytesToBase64(bytes: Uint8Array) {
  let binary = "";
  for (let index = 0; index < bytes.length; index += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(index, index + 0x8000));
  }
  return btoa(binary);
}

function parseLatestReport(html: string) {
  const rows = [...html.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi)].map((match) => match[1]);
  const row = rows.find((item) => clean(item).includes("주간농사정보 제"));
  if (!row) throw new Error("농사로에서 최신 주간농사정보 행을 찾지 못했습니다.");

  const titleMatch = row.match(/<td[^>]*class=["'][^"']*txt-l[^"']*["'][^>]*>([\s\S]*?)<\/td>/i);
  const title = clean(titleMatch?.[1] || "");
  const publishedAt = (row.match(/20\d{2}-\d{2}-\d{2}/) || [])[0] || null;
  const downloads = [...row.matchAll(/<a[^>]+onclick="[^"]*fncFileDown\('([0-9]+)',\s*'([0-9]+)',\s*'([0-9]+)'[^"]*"[^>]*>([\s\S]*?)<\/a>/gi)]
    .map((match) => ({ contentNo: match[1], fileNo: match[2], fileCode: match[3], label: clean(match[4]) }));
  const pdf = downloads.find((item) => item.label.toLowerCase().endsWith(".pdf"));
  if (!title || !pdf) throw new Error("최신 주간농사정보의 제목 또는 PDF 다운로드 정보를 찾지 못했습니다.");

  const pdfUrl = new URL(RDA_DOWNLOAD_URL);
  pdfUrl.searchParams.set("cntntsNo", pdf.contentNo);
  pdfUrl.searchParams.set("fileSeCode", pdf.fileCode);
  pdfUrl.searchParams.set("fileSn", pdf.fileNo);
  const sourceUrl = `${RDA_LIST_URL}&cntntsNo=${pdf.contentNo}`;
  return { title, publishedAt, pdfUrl: pdfUrl.toString(), sourceUrl };
}

Deno.serve(async (request) => {
  try {
    const db = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );
    const suppliedSecret = request.headers.get("x-sync-secret") || "";
    const syncSecret = Deno.env.get("SYNC_WEEKLY_SECRET");
    let authorized = Boolean(syncSecret && suppliedSecret === syncSecret);
    if (!authorized && suppliedSecret) {
      const { data: verified } = await db.rpc("verify_weekly_sync_secret", {
        candidate: suppliedSecret,
      });
      authorized = verified === true;
    }
    if (!authorized) {
      return json({ error: "unauthorized" }, 401);
    }

    const listResponse = await fetch(RDA_LIST_URL, { headers: { "User-Agent": "seedjong-navi/1.0" } });
    if (!listResponse.ok) throw new Error(`농사로 목록 요청 실패 (${listResponse.status})`);
    const report = parseLatestReport(await listResponse.text());

    const { data: existing } = await db
      .from("weekly_farming_reports")
      .select("id")
      .eq("source_url", report.sourceUrl)
      .maybeSingle();
    if (existing) {
      const checkedAt = new Date().toISOString();
      const { error: updateError } = await db
        .from("weekly_farming_reports")
        .update({ fetched_at: checkedAt })
        .eq("id", existing.id);
      if (updateError) throw updateError;
      return json({ ok: true, skipped: true, checkedAt, sourceUrl: report.sourceUrl });
    }

    const pdfResponse = await fetch(report.pdfUrl, { headers: { "User-Agent": "seedjong-navi/1.0" } });
    if (!pdfResponse.ok) throw new Error(`주간농사정보 PDF 요청 실패 (${pdfResponse.status})`);
    const pdfBytes = new Uint8Array(await pdfResponse.arrayBuffer());

    const geminiKey = Deno.env.get("GEMINI_API_KEY");
    if (!geminiKey) throw new Error("GEMINI_API_KEY가 설정되지 않았습니다.");
    const prompt = [
      "첨부한 농촌진흥청 주간농사정보를 한국 농업인이 이해하기 쉬운 한국어로 정리하세요.",
      "원문에 없는 수치나 조언을 만들지 마세요.",
      "headline은 이번 주 핵심을 담은 한 문장으로 작성하세요.",
      "summary는 서로 중복되지 않는 핵심 행동 지침 정확히 3개로 작성하세요.",
      "briefing은 작물·분야별 소제목을 포함한 상세 브리핑으로 작성하세요.",
    ].join("\n");
    const geminiResponse = await fetch(
      "https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash-lite:generateContent",
      {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-goog-api-key": geminiKey },
        body: JSON.stringify({
          contents: [{
            parts: [
              { text: prompt },
              { inlineData: { mimeType: "application/pdf", data: bytesToBase64(pdfBytes) } },
            ],
          }],
          generationConfig: {
            temperature: 0.2,
            responseMimeType: "application/json",
            responseSchema: {
              type: "OBJECT",
              properties: {
                headline: { type: "STRING" },
                summary: { type: "ARRAY", items: { type: "STRING" }, minItems: 3, maxItems: 3 },
                briefing: { type: "STRING" },
              },
              required: ["headline", "summary", "briefing"],
            },
          },
        }),
      },
    );
    const generated = await geminiResponse.json();
    if (!geminiResponse.ok) throw new Error(generated?.error?.message || "Gemini 요약 실패");
    const result = JSON.parse(generated.candidates?.[0]?.content?.parts?.[0]?.text || "{}");
    if (!result.headline || !Array.isArray(result.summary) || result.summary.length !== 3 || !result.briefing) {
      throw new Error("Gemini가 올바른 요약 형식을 반환하지 않았습니다.");
    }

    const { error } = await db.from("weekly_farming_reports").insert({
      source_url: report.sourceUrl,
      pdf_url: report.pdfUrl,
      title: report.title,
      headline: result.headline,
      published_at: report.publishedAt,
      source_content: `PDF 원문: ${report.pdfUrl}`,
      summary: result.summary,
      briefing: result.briefing,
      status: "ready",
    });
    if (error) throw error;

    return json({ ok: true, ...report });
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : String(error) }, 500);
  }
});
