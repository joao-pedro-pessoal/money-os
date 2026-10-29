import { beforeEach, describe, expect, it, vi } from "vitest";
const fake = vi.hoisted(() => ({ signUp: vi.fn() }));
vi.mock("@/actions/auth", () => ({ signUp: fake.signUp }));
import { POST } from "../route";
import { REGISTRATION_INVALID, REGISTRATION_UNAVAILABLE } from "@/lib/accounts/botProtection";
import { TOO_MANY_ATTEMPTS } from "@/lib/accounts/attempts";

const data = {email:"tester@example.test",signInKey:"a".repeat(64),inviteCode:"synthetic-invite"};
const request = (headers: Record<string,string> = {}, body: BodyInit | null = JSON.stringify(data)) => new Request("https://money.example/api/register",{
  method:"POST",headers:{origin:"https://money.example","content-type":"application/json",...headers},body,
});
beforeEach(() => {fake.signUp.mockReset().mockResolvedValue({kind:"ok",recoveryCode:"synthetic-code"});});
describe("registration-only HTTP endpoint", () => {
  it("passes same-origin JSON through the existing sign-up validation and returns no-store", async () => {
    const response=await POST(request());
    expect(response.status).toBe(200);expect(await response.json()).toEqual({kind:"ok",recoveryCode:"synthetic-code"});
    expect(fake.signUp).toHaveBeenCalledWith(data);expect(response.headers.get("cache-control")).toBe("no-store");
  });
  it("uses the public Host when Next's URL carries an internal hostname", async () => {
    const req=new Request("https://internal-next:3000/api/register",{method:"POST",headers:{origin:"https://money.example",host:"money.example","content-type":"application/json"},body:JSON.stringify(data)});
    expect((await POST(req)).status).toBe(200);expect(fake.signUp).toHaveBeenCalledWith(data);
  });
  it("does not trust a forged X-Forwarded-Host", async () => {
    const response=await POST(request({origin:"https://other.example",host:"money.example","x-forwarded-host":"other.example"}));
    expect(response.status).toBe(403);expect(fake.signUp).not.toHaveBeenCalled();
  });
  it.each(["https://other.example","null","","invalid-origin","http://money.example"])("refuses a missing/foreign/invalid origin %s", async origin => {
    const response=await POST(request({origin}));expect(response.status).toBe(403);expect(fake.signUp).not.toHaveBeenCalled();
    expect(await response.json()).toEqual({kind:"refused",reason:REGISTRATION_INVALID});
  });
  it("refuses explicit cross-site requests even if their Origin claims otherwise",async()=>{
    expect((await POST(request({"sec-fetch-site":"cross-site"}))).status).toBe(403);expect(fake.signUp).not.toHaveBeenCalled();
  });
  it.each(["text/plain","application/x-www-form-urlencoded",""])("refuses a non-JSON content type %s",async type=>{
    expect((await POST(request({"content-type":type}))).status).toBe(415);expect(fake.signUp).not.toHaveBeenCalled();
  });
  it.each(["{invalid", "", "["])("refuses malformed JSON before sign-up %s",async body=>{
    expect((await POST(request({},body))).status).toBe(400);expect(fake.signUp).not.toHaveBeenCalled();
  });
  it("refuses a missing request body",async()=>{
    expect((await POST(request({},null))).status).toBe(400);expect(fake.signUp).not.toHaveBeenCalled();
  });
  it("rejects declared oversized bodies without reading them",async()=>{
    expect((await POST(request({"content-length":"4097"}))).status).toBe(413);expect(fake.signUp).not.toHaveBeenCalled();
  });
  it("bounds bodies even without a Content-Length header",async()=>{
    expect((await POST(request({}," ".repeat(4097)))).status).toBe(413);expect(fake.signUp).not.toHaveBeenCalled();
  });
  it("bounds chunked bodies and cancels the remaining stream",async()=>{
    const cancel=vi.fn();const body=new ReadableStream({start(controller){controller.enqueue(new Uint8Array(3000));controller.enqueue(new Uint8Array(3000));},cancel});
    const req=new Request("https://money.example/api/register",{method:"POST",headers:{origin:"https://money.example","content-type":"application/json"},body,duplex:"half"} as RequestInit);
    expect((await POST(req)).status).toBe(413);expect(cancel).toHaveBeenCalled();expect(fake.signUp).not.toHaveBeenCalled();
  });
  it("returns an expected validation refusal",async()=>{
    fake.signUp.mockResolvedValue({kind:"refused",reason:"Write a valid email address."});
    const response=await POST(request());expect(response.status).toBe(400);expect(await response.json()).toEqual({kind:"refused",reason:"Write a valid email address."});
  });
  it("uses HTTP 429 for the existing origin rate limit",async()=>{
    fake.signUp.mockResolvedValue({kind:"refused",reason:TOO_MANY_ATTEMPTS});expect((await POST(request())).status).toBe(429);
  });
  it("never exposes database/infrastructure exceptions",async()=>{
    fake.signUp.mockRejectedValue(new Error("secret-database-diagnostic"));const response=await POST(request());
    expect(response.status).toBe(503);expect(await response.json()).toEqual({kind:"refused",reason:REGISTRATION_UNAVAILABLE});
  });
});
