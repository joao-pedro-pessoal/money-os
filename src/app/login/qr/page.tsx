import AuthFrame from "@/components/AuthFrame";
import QrSignIn from "@/components/QrSignIn";
import { safeReturnPath } from "@/lib/accounts/returnPath";

export default async function Page({ searchParams }: { searchParams: Promise<{ next?: string | string[] }> }) {
  return <AuthFrame><QrSignIn destination={safeReturnPath((await searchParams).next)} /></AuthFrame>;
}
