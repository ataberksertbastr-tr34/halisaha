/**
 * Firestore REST istemcisi ve güvenlik kuralları, gerçek Firebase emülatörlerine karşı.
 * Çalıştırma: firebase emulators:exec --only auth,firestore "npm run test:emu"
 */
import { describe, expect, it } from "vitest";
import { AuthError, ConflictError, firestoreRemote } from "../../src/sync/firestore";
import { pack, unpack } from "../../src/sync/envelope";
import { state, player } from "../helpers/factory";

const AUTH = process.env.FIREBASE_AUTH_EMULATOR_HOST || "127.0.0.1:9099";
const FS = process.env.FIRESTORE_EMULATOR_HOST || "127.0.0.1:8080";
const PROJECT = "demo-halisaha";

async function signUp(): Promise<{ uid: string; token: string }> {
  const email = "test" + Math.random().toString(36).slice(2) + "@example.com";
  const r = await fetch(`http://${AUTH}/identitytoolkit.googleapis.com/v1/accounts:signUp?key=demo-key`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email, password: "sifre123", returnSecureToken: true }),
  });
  const j = (await r.json()) as { localId: string; idToken: string };
  return { uid: j.localId, token: j.idToken };
}

const remoteFor = (uid: string, token: string) => firestoreRemote({ projectId: PROJECT, uid, getToken: async () => token, base: `http://${FS}/v1` });

describe("Firestore emülatörü", () => {
  it("oku → ilk yaz → güncelle → eski belirteçle yazma çakışır", async () => {
    const u = await signUp();
    const r = remoteFor(u.uid, u.token);
    expect(await r.read()).toBeNull();
    const s = state([player("p1", "Ali Deneme")]);
    const t1 = await r.write(await pack(s, 1, "test"), null);
    await expect(r.write(await pack(s, 1, "test"), null)).rejects.toBeInstanceOf(ConflictError);
    const doc = await r.read();
    expect(doc?.token).toBe(t1);
    expect(await unpack(doc!.env)).toEqual(s);
    const t2 = await r.write(await pack(s, 2, "test"), t1);
    expect(t2).not.toBe(t1);
    await expect(r.write(await pack(s, 3, "test"), t1)).rejects.toBeInstanceOf(ConflictError);
    expect((await r.read())?.env.rev).toBe(2);
  });

  it("kurallar: başka hesap ve oturumsuz istek okuyamaz, yazamaz", async () => {
    const a = await signUp();
    const b = await signUp();
    await remoteFor(a.uid, a.token).write(await pack(state(), 1, "a"), null);
    await expect(remoteFor(a.uid, b.token).read()).rejects.toBeInstanceOf(AuthError);
    await expect(remoteFor(a.uid, b.token).write(await pack(state(), 2, "b"), null)).rejects.toBeInstanceOf(AuthError);
    const anon = await fetch(`http://${FS}/v1/projects/${PROJECT}/databases/(default)/documents/users/${a.uid}/halisaha/state`);
    expect(anon.status).toBe(403);
  });
});
