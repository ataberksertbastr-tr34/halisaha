/** Firestore REST istemcisi, bulut belgesi biçimi ve Firebase yapılandırması. */
import { describe, expect, it } from "vitest";
import { AuthError, ConflictError, NetError, firestoreRemote } from "../src/sync/firestore";
import { MAX_DATA, SyncError, pack, unpack } from "../src/sync/envelope";
import { parseConfig } from "../src/sync/config";
import { SCHEMA_VERSION } from "../src/domain/schema";
import { match, player, state } from "./helpers/factory";

type Call = { url: string; init: RequestInit };
function fakeFetch(responses: (Response | Error)[]) {
  const calls: Call[] = [];
  const f = (async (url: string, init: RequestInit) => {
    calls.push({ url, init });
    const r = responses.shift();
    if (!r) throw new Error("beklenmeyen istek");
    if (r instanceof Error) throw r;
    return r;
  }) as unknown as typeof fetch;
  return { f, calls };
}
const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

function remote(responses: (Response | Error)[], tokens: string[] = []) {
  const { f, calls } = fakeFetch(responses);
  const forced: boolean[] = [];
  const r = firestoreRemote({
    projectId: "demo-proje",
    uid: "uid1",
    getToken: async (force) => {
      forced.push(!!force);
      return tokens.shift() || "tok";
    },
    fetch: f,
  });
  return { r, calls, forced };
}

const sample = () => state([player("p1", "Ali Deneme"), player("p2", "Ayşe Örnek")], [match("m1")]);

describe("bulut belgesi", () => {
  it("sıkıştırıp açar; içerik aynen döner", async () => {
    const s = sample();
    const e = await pack(s, 3, "telefon", 123);
    expect(e).toMatchObject({ fmt: 1, schema: SCHEMA_VERSION, rev: 3, at: 123, dev: "telefon", enc: "gz64" });
    expect(e.data.length).toBeLessThan(JSON.stringify(s).length);
    expect(await unpack(e)).toEqual(s);
  });

  it("sıkıştırılmamış (json) belgeyi de okur", async () => {
    const s = sample();
    expect(await unpack({ fmt: 1, schema: SCHEMA_VERSION, rev: 1, at: 1, dev: "x", enc: "json", data: JSON.stringify(s) })).toEqual(s);
  });

  it("eski şemayla yazılmış belgeyi taşır, daha yenisini reddeder, bozuğu tanır", async () => {
    const v2 = { v: 2, players: [{ id: "a", name: "Eski Oyuncu", rating: 3, pos: "", phone: "", active: true }], matches: [] };
    const s = await unpack({ fmt: 1, schema: 2, rev: 1, at: 1, dev: "x", enc: "json", data: JSON.stringify(v2) });
    expect(s.v).toBe(SCHEMA_VERSION);
    expect(s.players[0].name).toBe("Eski Oyuncu");
    await expect(unpack({ fmt: 1, schema: SCHEMA_VERSION + 1, rev: 1, at: 1, dev: "x", enc: "json", data: "{}" })).rejects.toMatchObject({ code: "future" });
    await expect(unpack({ fmt: 1, schema: SCHEMA_VERSION, rev: 1, at: 1, dev: "x", enc: "gz64", data: "bozuk!!" })).rejects.toBeInstanceOf(SyncError);
    await expect(unpack({ fmt: 1, schema: SCHEMA_VERSION, rev: 1, at: 1, dev: "x", enc: "json", data: "{" })).rejects.toMatchObject({ code: "corrupt" });
  });

  it("yıllarca birikmiş veri sınırın çok altında kalır", async () => {
    const s = sample();
    for (let i = 0; i < 600; i++) s.matches.push(match("m" + i, { date: "2026-01-01", att: { p1: "in", p2: "out" }, order: ["p1"], note: "Not " + i }));
    const e = await pack(s, 1, "x");
    expect(e.data.length).toBeLessThan(MAX_DATA / 4);
  });
});

describe("Firestore REST", () => {
  it("belge yoksa null döner (batchGet 'missing', 404 yok)", async () => {
    const { r, calls } = remote([json(200, [{ missing: "projects/demo-proje/databases/(default)/documents/users/uid1/halisaha/state", readTime: "T" }])]);
    expect(await r.read()).toBeNull();
    expect(calls[0].url).toBe("https://firestore.googleapis.com/v1/projects/demo-proje/databases/(default)/documents:batchGet");
    expect(JSON.parse(String(calls[0].init.body))).toEqual({ documents: ["projects/demo-proje/databases/(default)/documents/users/uid1/halisaha/state"] });
    expect((calls[0].init.headers as Record<string, string>).authorization).toBe("Bearer tok");
  });

  it("okur; alanları zarfa çevirir", async () => {
    const { r } = remote([
      json(200, [{
        found: {
          updateTime: "2026-10-10T10:00:00.123Z",
          fields: { fmt: { integerValue: "1" }, schema: { integerValue: "4" }, rev: { integerValue: "7" }, at: { integerValue: "99" }, dev: { stringValue: "pc" }, enc: { stringValue: "gz64" }, data: { stringValue: "abc" } },
        },
        readTime: "T",
      }]),
    ]);
    expect(await r.read()).toEqual({ token: "2026-10-10T10:00:00.123Z", env: { fmt: 1, schema: 4, rev: 7, at: 99, dev: "pc", enc: "gz64", data: "abc" } });
  });

  it("ön koşullu yazar: ilk yazmada 'yoksa', sonra updateTime", async () => {
    const env = { fmt: 1 as const, schema: 4, rev: 2, at: 5, dev: "tel", enc: "json" as const, data: "{}" };
    const { r, calls } = remote([json(200, { writeResults: [{ updateTime: "T1" }] }), json(200, { writeResults: [{ updateTime: "T2" }] })]);
    expect(await r.write(env, null)).toBe("T1");
    expect(await r.write(env, "T1")).toBe("T2");
    expect(calls[0].url).toBe("https://firestore.googleapis.com/v1/projects/demo-proje/databases/(default)/documents:commit");
    const b0 = JSON.parse(String(calls[0].init.body));
    expect(b0.writes[0].currentDocument).toEqual({ exists: false });
    expect(b0.writes[0].update.fields.rev).toEqual({ integerValue: "2" });
    expect(b0.writes[0].update.fields.data).toEqual({ stringValue: "{}" });
    expect(JSON.parse(String(calls[1].init.body)).writes[0].currentDocument).toEqual({ updateTime: "T1" });
  });

  it("ön koşul tutmazsa ConflictError (409 ve FAILED_PRECONDITION)", async () => {
    const env = { fmt: 1 as const, schema: 4, rev: 2, at: 5, dev: "tel", enc: "json" as const, data: "{}" };
    const { r } = remote([json(409, { error: { status: "ALREADY_EXISTS" } }), json(400, { error: { status: "FAILED_PRECONDITION" } })]);
    await expect(r.write(env, null)).rejects.toBeInstanceOf(ConflictError);
    await expect(r.write(env, "T0")).rejects.toBeInstanceOf(ConflictError);
  });

  it("401'de belirteci yenileyip bir kez daha dener; yine olmazsa AuthError", async () => {
    const a = remote([json(401, {}), json(200, [{ missing: "x" }])], ["eski", "yeni"]);
    expect(await a.r.read()).toBeNull();
    expect(a.forced).toEqual([false, true]);
    expect((a.calls[1].init.headers as Record<string, string>).authorization).toBe("Bearer yeni");
    const b = remote([json(403, {}), json(403, {})]);
    await expect(b.r.read()).rejects.toBeInstanceOf(AuthError);
  });

  it("ağ hatası, 429 ve 5xx tekrar denenebilir hata sayılır", async () => {
    const { r } = remote([new TypeError("Failed to fetch"), json(503, {}), json(429, {})]);
    await expect(r.read()).rejects.toBeInstanceOf(NetError);
    await expect(r.read()).rejects.toBeInstanceOf(NetError);
    await expect(r.read()).rejects.toBeInstanceOf(NetError);
  });
});

describe("Firebase yapılandırması", () => {
  it("konsoldaki JS parçasını okur", () => {
    const snippet = `// Import the functions you need
const firebaseConfig = {
  apiKey: "AIzaSyD-ornek_anahtar_123456",
  authDomain: "halisaha-1a2b3.firebaseapp.com",
  projectId: "halisaha-1a2b3",
  storageBucket: "halisaha-1a2b3.firebasestorage.app",
  messagingSenderId: "123456789012",
  appId: "1:123456789012:web:abcdef123456"
};`;
    expect(parseConfig(snippet)).toEqual({
      apiKey: "AIzaSyD-ornek_anahtar_123456",
      authDomain: "halisaha-1a2b3.firebaseapp.com",
      projectId: "halisaha-1a2b3",
      storageBucket: "halisaha-1a2b3.firebasestorage.app",
      messagingSenderId: "123456789012",
      appId: "1:123456789012:web:abcdef123456",
    });
  });

  it("JSON'u da okur; eksik ya da bozuk yapılandırmayı reddeder", () => {
    expect(parseConfig('{"apiKey":"AIzaSyD-ornek_anahtar_123456","authDomain":"a-b.firebaseapp.com","projectId":"a-b-c"}')?.projectId).toBe("a-b-c");
    expect(parseConfig('{"apiKey":"AIzaSyD-ornek_anahtar_123456","projectId":"a-b-c"}')).toBeNull();
    expect(parseConfig("merhaba")).toBeNull();
    expect(parseConfig('apiKey: "x", authDomain: "a.firebaseapp.com", projectId: "Büyük Harf"')).toBeNull();
  });
});
