/** Firebase giriş hatalarının kullanıcıya gösterilecek mesaj anahtarına çevrilmesi. */
import { afterEach, describe, expect, it, vi } from "vitest";
import { errorKey } from "../src/sync/auth";

const err = (code: string) => Object.assign(new Error(code), { code });

describe("giriş hata anahtarları", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("bilinen Firebase kodlarını anahtarlara çevirir", () => {
    expect(errorKey(err("auth/popup-closed-by-user"))).toBe("cancelled");
    expect(errorKey(err("auth/network-request-failed"))).toBe("network");
    expect(errorKey(err("auth/invalid-credential"))).toBe("badLogin");
    expect(errorKey(err("auth/email-already-in-use"))).toBe("emailInUse");
    expect(errorKey(err("auth/bilinmeyen"))).toBe("unknown");
  });

  it("internet yokken Google betiği yüklenemezse (iç hata) 'bağlantı yok' der; internet varken bilinmeyen hata", () => {
    vi.stubGlobal("navigator", { onLine: false });
    expect(errorKey(err("auth/internal-error"))).toBe("network");
    vi.stubGlobal("navigator", { onLine: true });
    expect(errorKey(err("auth/internal-error"))).toBe("unknown");
  });
});
