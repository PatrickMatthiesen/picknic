import { lookup } from "node:dns/promises";
import https from "node:https";
import { pinnedRecipeLookup } from "@/lib/recipe-url-lookup";
import { NextResponse } from "next/server";
import { requireAppAuthContext, resolveActiveMembership } from "@/lib/auth-context";
import { extractStructuredRecipeJsonLd, isPrivateImportAddress, safeRecipeUrl, validatePicknicRecipeFile } from "@/lib/recipe-import";
export async function POST(request: Request) {
  const { userId, organizationId } = await requireAppAuthContext();
  if (!(await resolveActiveMembership(userId, organizationId))) return NextResponse.json({ error: "No household found." }, { status: 403 });
  const payload = await request.json().catch(() => null);
  const rawUrl = payload && typeof payload === "object" ? payload.url : undefined;
  const url = safeRecipeUrl(rawUrl);
  if (!url) return NextResponse.json({ error: "Enter a public HTTPS recipe URL." }, { status: 400 });
  try {
    const addresses = await lookup(url.hostname, { all: true, verbatim: true });
    if (!addresses.length || addresses.some(({ address }) => isPrivateImportAddress(address))) {
      return NextResponse.json({ error: "That address is not available for recipe import." }, { status: 400 });
    }
    const address = addresses[0]!;
    const { status, type, html } = await new Promise<{ status: number; type: string; html: string }>((resolve, reject) => {
      const request = https.request(url, {
        signal: AbortSignal.timeout(8000), method: "GET", headers: { Accept: "text/html" }, timeout: 8000,
        lookup: pinnedRecipeLookup(address),
      }, (response) => {
        let body = "";
        let bytes = 0;
        response.setEncoding("utf8");
        response.on("data", (chunk: string) => { bytes += Buffer.byteLength(chunk); body += chunk; if (bytes > 1_000_000) request.destroy(new Error("Page too large")); });
        response.on("end", () => resolve({ status: response.statusCode ?? 0, type: response.headers["content-type"] ?? "", html: body }));
        response.on("error", reject);
      });
      request.on("timeout", () => request.destroy(new Error("Fetch timed out")));
      request.on("error", reject);
      request.end();
    });
    if (status >= 300 && status < 400) return NextResponse.json({ error: "Recipe page redirects are not followed. Use its final HTTPS URL." }, { status: 400 });
    if (status < 200 || status >= 300 || !type.includes("text/html")) return NextResponse.json({ error: "That URL did not return a recipe page." }, { status: 400 });
    const draft = extractStructuredRecipeJsonLd(html);
    if (!draft || !validatePicknicRecipeFile(draft)) return NextResponse.json({ error: "No usable structured recipe was found on that page." }, { status: 422 });
    return NextResponse.json({ draft });
  } catch {
    return NextResponse.json({ error: "Could not safely fetch that recipe page." }, { status: 400 });
  }
}
