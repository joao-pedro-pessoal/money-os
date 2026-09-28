import { askDeviceLink } from "@/actions/vaultServer";
import { json, MAX_CREDENTIAL_BODY_BYTES, readJson, refused, unreadable } from "../../../respond";

export const dynamic = "force-dynamic";

/** A phone that scanned the code, asking in. The code in its address is all it has. */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const read = await readJson(request, MAX_CREDENTIAL_BODY_BYTES);
  if (!read.ok) return unreadable(read);
  const result = await askDeviceLink(id, read.body);
  if (!result.ok) return refused(result);
  return json({ state: "asked" }, 200);
}
