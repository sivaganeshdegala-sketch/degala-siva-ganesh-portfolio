const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json; charset=utf-8",
};

const LEETCODE_USERNAME = "Sivadegala";
const HACKERRANK_USERNAME = "sivadegala1122";
const UPSTREAM_TIMEOUT_MS = 8_000;

type PlatformResult = { solved: number | null; status: "ok" | "unavailable" };

function asCount(...values: unknown[]): number | null {
  for (const value of values) {
    const count = typeof value === "number" ? value : typeof value === "string" ? Number(value) : NaN;
    if (Number.isSafeInteger(count) && count >= 0) return count;
  }
  return null;
}

async function getJson(url: string): Promise<Record<string, unknown>> {
  const response = await fetch(url, {
    headers: { Accept: "application/json" },
    signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
  });
  if (!response.ok) throw new Error(`Stats source returned HTTP ${response.status}`);
  const body: unknown = await response.json();
  if (!body || typeof body !== "object" || Array.isArray(body)) throw new Error("Stats source returned invalid data");
  return body as Record<string, unknown>;
}

async function getLeetCodeStats(): Promise<PlatformResult> {
  try {
    const data = await getJson(`https://leetpulse-api.vercel.app/api/leetcode/solved/${encodeURIComponent(LEETCODE_USERNAME)}`);
    const solved = asCount(data.solvedProblem, data.totalSolved, data.totalSolvedCount);
    return { solved, status: solved === null ? "unavailable" : "ok" };
  } catch {
    return { solved: null, status: "unavailable" };
  }
}

async function getHackerRankStats(): Promise<PlatformResult> {
  try {
    const data = await getJson(`https://hackerrank-stats.tashif.codes/${encodeURIComponent(HACKERRANK_USERNAME)}`);
    const solved = asCount(data.totalSolved, data.solvedChallenges, data.challengesSolved);
    return { solved, status: solved === null ? "unavailable" : "ok" };
  } catch {
    return { solved: null, status: "unavailable" };
  }
}

Deno.serve(async (request: Request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (request.method !== "POST") return Response.json({ error: "Method not allowed" }, { status: 405, headers: corsHeaders });

  const [leetcode, hackerrank] = await Promise.all([getLeetCodeStats(), getHackerRankStats()]);
  const totalSolved = leetcode.solved !== null && hackerrank.solved !== null
    ? leetcode.solved + hackerrank.solved
    : null;

  return Response.json({
    leetcode,
    hackerrank,
    totalSolved,
    updatedAt: new Date().toISOString(),
  }, {
    headers: { ...corsHeaders, "Cache-Control": "public, max-age=300" },
  });
});
