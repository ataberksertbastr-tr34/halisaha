/** Yedek dosyası adı, metni ve haftalık hatırlatma kuralı. */
import { describe, expect, it } from "vitest";
import { backupFileName, backupText, DAY, hasData, reminderDue } from "../src/data/backup";
import { parseBackup } from "../src/domain/migrate";
import { player, state } from "./helpers/factory";

describe("yedek dosyası", () => {
  it("dosya adı tarih içerir", () => {
    expect(backupFileName(new Date(2026, 9, 9))).toBe("halisaha-yedek-2026-10-09.json");
  });
  it("yedek metni geri yüklenince aynı veri çıkar", () => {
    const s = state([player("a", "Çağla Örnek", 4, "MID")]);
    expect(parseBackup(backupText(s))).toEqual(s);
  });
  it("veri var mı", () => {
    expect(hasData(state())).toBe(false);
    expect(hasData(state([player("a", "A")]))).toBe(true);
  });
});

describe("haftalık yedek hatırlatması", () => {
  const now = Date.UTC(2026, 9, 9);
  const base = { firstUseAt: now - 30 * DAY, lastExportAt: 0, reminderSnoozeUntil: 0 };

  it("veri yoksa hatırlatmaz", () => {
    expect(reminderDue(base, now, false)).toBe(false);
  });
  it("hiç yedek alınmadıysa ilk kullanımdan 7 gün sonra hatırlatır", () => {
    expect(reminderDue({ ...base, firstUseAt: now - 6 * DAY }, now, true)).toBe(false);
    expect(reminderDue({ ...base, firstUseAt: now - 7 * DAY }, now, true)).toBe(true);
  });
  it("son yedekten 7 gün geçince hatırlatır", () => {
    expect(reminderDue({ ...base, lastExportAt: now - 3 * DAY }, now, true)).toBe(false);
    expect(reminderDue({ ...base, lastExportAt: now - 8 * DAY }, now, true)).toBe(true);
  });
  it("'Sonra' denince ertelenir", () => {
    expect(reminderDue({ ...base, lastExportAt: now - 8 * DAY, reminderSnoozeUntil: now + DAY }, now, true)).toBe(false);
  });
});
