import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { "Content-Type": "application/json" },
});

async function geocode(address: string, key: string) {
  const response = await fetch(
    `https://dapi.kakao.com/v2/local/search/address.json?query=${encodeURIComponent(address)}`,
    { headers: { Authorization: `KakaoAK ${key}` } },
  );
  const body = await response.json();
  const first = body?.documents?.[0];
  if (!response.ok || !first) return null;
  return { latitude: Number(first.y), longitude: Number(first.x) };
}

Deno.serve(async (req) => {
  try {
    const expected = "farm-import-20260731-7d8b9c1e2f3a4b5c";
    if (req.headers.get("x-import-secret") !== expected) return json({ error: "unauthorized" }, 401);
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!supabaseUrl || !serviceRoleKey) return json({ error: "Supabase server config missing" }, 503);
    const db = createClient(supabaseUrl, serviceRoleKey);
    const { action, rows = [] } = await req.json();

    if (action === "reset") {
      const { error } = await db.rpc("reset_farm_reference_data");
      if (error) throw error;
      return json({ reset: true });
    }
    if (action === "zones") {
      const { data, error } = await db.rpc("import_farmland_zone_batch", { rows });
      if (error) throw error;
      return json({ inserted: data });
    }
    if (action === "reservoirs") {
      const kakaoKey = Deno.env.get("KAKAO_CLIENT_ID");
      if (!kakaoKey) return json({ error: "KAKAO_CLIENT_ID missing" }, 503);
      const inserted = [];
      const skipped = [];
      for (const row of rows) {
        const point = await geocode(row.address, kakaoKey);
        if (!point) {
          skipped.push(row.facility_code);
          continue;
        }
        inserted.push({ ...row, ...point });
      }
      if (inserted.length) {
        const { error } = await db.from("reservoir_water_quality").upsert(inserted, { onConflict: "facility_code" });
        if (error) throw error;
      }
      return json({ inserted: inserted.length, skipped });
    }
    if (action === "groundwater-wells") {
      const { error } = await db.from("groundwater_wells").upsert(rows, { onConflict: "well_id" });
      if (error) throw error;
      return json({ inserted: rows.length });
    }
    return json({ error: "unknown action" }, 400);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("import-farm-reference failed", message);
    return json({ error: message }, 500);
  }
});
