// Vehicle Health Check API — one Netlify Function serving /api/*
// Storage: Netlify Blobs. Store "vhc" holds JSON records, store "vhc-media" holds clips, photos, logos.
import { getStore } from "@netlify/blobs";

const json = (d: unknown, status = 200) =>
  new Response(JSON.stringify(d), { status, headers: { "content-type": "application/json", "cache-control": "no-store" } });
const bad = (msg: string, status = 400) => json({ error: msg }, status);
const SAFE = /^[A-Za-z0-9_-]{1,64}$/;

function db() { return getStore({ name: "vhc", consistency: "strong" }); }
function media() { return getStore("vhc-media"); }

async function listJSON(prefix: string) {
  const store = db();
  const { blobs } = await store.list({ prefix });
  const out: any[] = [];
  // read in small parallel batches
  for (let i = 0; i < blobs.length; i += 25) {
    const chunk = await Promise.all(blobs.slice(i, i + 25).map(b => store.get(b.key, { type: "json" }).catch(() => null)));
    chunk.forEach(x => x && out.push(x));
  }
  return out;
}

async function viewSummaries(): Promise<Record<string, any>> {
  const views = await listJSON("views/");
  const by: Record<string, any> = {};
  for (const v of views) {
    if (!v || !v.insp) continue;
    const s = (by[v.insp] ||= { opens: 0, firstOpenedAt: null, lastAt: null, maxPct: 0, completed: false });
    s.opens += 1;
    if (v.startedAt && (!s.firstOpenedAt || v.startedAt < s.firstOpenedAt)) s.firstOpenedAt = v.startedAt;
    if (v.lastAt && (!s.lastAt || v.lastAt > s.lastAt)) s.lastAt = v.lastAt;
    s.maxPct = Math.max(s.maxPct, v.maxPct || 0);
    s.completed = s.completed || !!v.completed;
  }
  return by;
}
async function viewSummary(id: string) {
  const views = await listJSON(`views/${id}/`);
  const s = { opens: 0, firstOpenedAt: null as string | null, lastAt: null as string | null, maxPct: 0, completed: false };
  for (const v of views) {
    s.opens += 1;
    if (v.startedAt && (!s.firstOpenedAt || v.startedAt < s.firstOpenedAt)) s.firstOpenedAt = v.startedAt;
    if (v.lastAt && (!s.lastAt || v.lastAt > s.lastAt)) s.lastAt = v.lastAt;
    s.maxPct = Math.max(s.maxPct, v.maxPct || 0);
    s.completed = s.completed || !!v.completed;
  }
  return s;
}

function pick(o: any, keys: string[]) { const r: any = {}; for (const k of keys) { const hit = Object.keys(o || {}).find(x => x.toLowerCase() === k.toLowerCase()); if (hit) r[k] = o[hit]; } return r; }

async function vinLookup(vin: string) {
  const out: any = { vin, decoded: null, recalls: [], errors: [] };
  try {
    const r = await fetch(`https://vpic.nhtsa.dot.gov/api/vehicles/DecodeVinValues/${encodeURIComponent(vin)}?format=json`);
    const d: any = await r.json();
    const row = (d.Results || d.results || [])[0] || {};
    const p = pick(row, ["Make", "Model", "ModelYear", "FuelTypePrimary", "FuelTypeSecondary", "ElectrificationLevel", "Trim", "ErrorCode", "ErrorText"]);
    const elec = String(p.ElectrificationLevel || "").toLowerCase(), fuel = `${p.FuelTypePrimary || ""} ${p.FuelTypeSecondary || ""}`.toLowerCase();
    let pt = "gas";
    if (elec.includes("bev") || (fuel.includes("electric") && !fuel.includes("gasoline"))) pt = "ev";
    else if (elec.includes("phev") || elec.includes("plug")) pt = "phev";
    else if (elec.includes("hev") || elec.includes("hybrid") || fuel.includes("electric")) pt = "hybrid";
    out.decoded = { make: p.Make || "", model: p.Model || "", year: p.ModelYear || "", trim: p.Trim || "", pt, errorCode: p.ErrorCode || "", errorText: p.ErrorText || "" };
  } catch (e) { out.errors.push("decode: " + String(e)); }
  const dec = out.decoded;
  if (dec && dec.make && dec.model && dec.year) {
    try {
      const u = `https://api.nhtsa.gov/recalls/recallsByVehicle?make=${encodeURIComponent(dec.make)}&model=${encodeURIComponent(dec.model)}&modelYear=${encodeURIComponent(dec.year)}`;
      const r = await fetch(u);
      const d: any = await r.json();
      const list = d.results || d.Results || [];
      out.recalls = list.map((x: any) => {
        const p = pick(x, ["NHTSACampaignNumber", "Component", "Summary", "Consequence", "Remedy", "ReportReceivedDate", "parkIt", "parkOutSide"]);
        return { id: String(p.NHTSACampaignNumber || "").replace(/[^A-Za-z0-9]/g, ""), code: p.NHTSACampaignNumber || "", component: p.Component || "", summary: p.Summary || "", consequence: p.Consequence || "", remedy: p.Remedy || "", date: p.ReportReceivedDate || "", parkIt: !!p.parkIt, parkOutside: !!p.parkOutSide };
      }).filter((x: any) => x.id);
    } catch (e) { out.errors.push("recalls: " + String(e)); }
  }
  return out;
}

export default async (req: Request) => {
  const url = new URL(req.url);
  const parts = url.pathname.replace(/^\/api\/?/, "").split("/").filter(Boolean);
  const [res, a, b, c] = parts;
  const m = req.method;
  try {
    if (res === "ping") return json({ ok: true, time: new Date().toISOString() });

    // ----- stores (dealership settings) -----
    if (res === "stores") {
      if (m === "GET" && !a) return json({ stores: await listJSON("stores/") });
      if ((m === "PUT" || m === "POST") && a && SAFE.test(a)) {
        const body: any = await req.json();
        body.id = a; body.updatedAt = new Date().toISOString();
        await db().setJSON(`stores/${a}`, body);
        return json({ ok: true, store: body });
      }
      if (m === "DELETE" && a && SAFE.test(a)) { await db().delete(`stores/${a}`); return json({ ok: true }); }
    }

    // ----- media: clips, photos, logos, tech photos (chunked parts) -----
    if (res === "media" && a && b && SAFE.test(a) && SAFE.test(b)) {
      const part = c && /^\d{1,4}$/.test(c) ? c : "0";
      const key = `${a}/${b}/${part}`;
      if (m === "POST" || m === "PUT") {
        const buf = await req.arrayBuffer();
        if (!buf.byteLength) return bad("empty upload");
        await media().set(key, buf, { metadata: { type: req.headers.get("content-type") || "application/octet-stream" } });
        return json({ ok: true, key, bytes: buf.byteLength });
      }
      if (m === "GET") {
        const r = await media().getWithMetadata(key, { type: "arrayBuffer" });
        if (!r) return new Response("Not found", { status: 404 });
        return new Response(r.data as ArrayBuffer, { headers: { "content-type": String((r.metadata as any)?.type || "application/octet-stream"), "cache-control": "public, max-age=31536000, immutable" } });
      }
    }

    // ----- inspections -----
    if (res === "insp") {
      if (m === "GET" && !a) {
        const days = Math.min(400, Math.max(1, +(url.searchParams.get("days") || 90)));
        const since = new Date(Date.now() - days * 864e5).toISOString();
        const [all, views] = await Promise.all([listJSON("insp/"), viewSummaries()]);
        const rows = all.filter(r => (r.createdAt || "") >= since).map(r => ({ ...r, views: views[r.id] || { opens: 0, maxPct: 0, completed: false } }));
        rows.sort((x, y) => (y.createdAt || "").localeCompare(x.createdAt || ""));
        return json({ inspections: rows });
      }
      if (a && SAFE.test(a)) {
        if (m === "GET") {
          const rec = await db().get(`insp/${a}`, { type: "json" });
          if (!rec) return bad("not found", 404);
          return json({ inspection: rec, views: await viewSummary(a) });
        }
        if (m === "PUT" || m === "POST") {
          const body: any = await req.json();
          body.id = a; body.savedAt = new Date().toISOString();
          await db().setJSON(`insp/${a}`, body);
          return json({ ok: true });
        }
      }
    }

    // ----- customer page: public read (record + store), approve, view tracking -----
    if (res === "public" && a && SAFE.test(a) && m === "GET") {
      const rec: any = await db().get(`insp/${a}`, { type: "json" });
      if (!rec) return bad("not found", 404);
      const store = rec.storeId ? await db().get(`stores/${rec.storeId}`, { type: "json" }) : null;
      return json({ inspection: rec, store });
    }
    if (res === "approve" && a && SAFE.test(a) && m === "POST") {
      const body: any = await req.json();
      const rec: any = await db().get(`insp/${a}`, { type: "json" });
      if (!rec) return bad("not found", 404);
      rec.approval = { at: new Date().toISOString(), keys: Array.isArray(body.keys) ? body.keys.slice(0, 100).map(String) : [], by: "customer" };
      await db().setJSON(`insp/${a}`, rec);
      return json({ ok: true, approval: rec.approval });
    }
    if (res === "view" && a && SAFE.test(a) && m === "POST") {
      const body: any = await req.json();
      const session = String(body.session || "").replace(/[^A-Za-z0-9_-]/g, "").slice(0, 40);
      if (!session) return bad("session required");
      const doc = { insp: a, session, startedAt: String(body.startedAt || new Date().toISOString()), lastAt: new Date().toISOString(), maxPct: Math.max(0, Math.min(100, +body.maxPct || 0)), completed: !!body.completed, ua: (req.headers.get("user-agent") || "").slice(0, 160) };
      await db().setJSON(`views/${a}/${session}`, doc);
      return json({ ok: true });
    }

    // ----- vehicle history by VIN -----
    if (res === "history" && m === "GET") {
      const vin = (url.searchParams.get("vin") || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
      const exclude = url.searchParams.get("exclude") || "";
      if (vin.length < 11) return json({ history: [] });
      const all = await listJSON("insp/");
      const rows = all.filter(r => (r.veh?.vin || "").toUpperCase() === vin && r.id !== exclude).sort((x, y) => (y.createdAt || "").localeCompare(x.createdAt || ""));
      return json({ history: rows });
    }

    // ----- VIN decode + recalls (NHTSA, free government data) -----
    if (res === "vin" && a && m === "GET") {
      const vin = a.toUpperCase().replace(/[^A-Z0-9]/g, "");
      if (vin.length !== 17) return bad("VIN must be 17 characters");
      return json(await vinLookup(vin));
    }

    return bad("unknown route", 404);
  } catch (e) {
    return json({ error: String(e) }, 500);
  }
};

export const config = { path: "/api/*" };
