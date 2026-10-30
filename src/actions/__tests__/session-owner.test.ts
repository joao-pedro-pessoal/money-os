import { beforeEach, describe, expect, it, vi } from "vitest";
const state=vi.hoisted(()=>({valid:true,id:"other",reads:0,rows:[{notBefore:null as Date|null}]}));
vi.mock("next/headers",()=>({cookies:async()=>({get:()=>({value:"synthetic-session"})})}));
vi.mock("next/cache",()=>({revalidatePath:vi.fn()}));
vi.mock("@/db/client",()=>({db:{select:()=>{state.reads++;return {from:()=>({where:async()=>state.rows})};}}}));
vi.mock("@/lib/auth",()=>({SESSION_COOKIE_NAME:"test",readSession:async()=>state.valid?{valid:true,userId:state.id,issuedAt:100}: {valid:false},
  endedBy:(at:Date|null,issued:number)=>at!==null&&at.getTime()>issued,newSessionValue:vi.fn(),sessionCookieOptions:vi.fn()}));
beforeEach(()=>{vi.resetModules();state.valid=true;state.id="other";state.reads=0;state.rows=[{notBefore:null}];});
describe("C2 restricted server identity",()=>{
  it("refuses a different signed account before a database read",async()=>{
    const {currentUserId}=await import("../session");expect(await currentUserId("owner")).toBeNull();expect(state.reads).toBe(0);
  });
  it("does not select an identity from the optional restriction",async()=>{
    const {currentUserId}=await import("../session");expect(await currentUserId("owner")).toBeNull();expect(await currentUserId()).toBe("other");
  });
  it("checks that an owner's session has not been revoked",async()=>{
    state.id="owner";state.rows=[{notBefore:new Date(200)}];
    const {currentUserId}=await import("../session");expect(await currentUserId("owner")).toBeNull();expect(state.reads).toBe(1);
  });
  it("refuses an owner whose account has been deleted",async()=>{
    state.id="owner";state.rows=[];const {currentUserId}=await import("../session");expect(await currentUserId("owner")).toBeNull();
  });
  it("refuses an invalid session without reading data",async()=>{
    state.valid=false;state.id="owner";const {currentUserId}=await import("../session");expect(await currentUserId("owner")).toBeNull();expect(state.reads).toBe(0);
  });
  it("returns the owner only after the normal revocation check",async()=>{
    state.id="owner";const {currentUserId}=await import("../session");expect(await currentUserId("owner")).toBe("owner");expect(state.reads).toBe(1);
  });
});
