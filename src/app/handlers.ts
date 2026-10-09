/** Tüm kullanıcı eylemleri. Eski uygulamadaki act() / onField() ile aynı davranış. */
import { t } from "../i18n";
import { commit, mutate, render, replaceState, store, today, ui, type FilterKey } from "./store";
import { go, route, type Tab } from "./router";
import { registerActions } from "./actions";
import type { Match, Pos } from "../domain/types";
import { defaults } from "../domain/schema";
import { BackupError, parseBackup } from "../domain/migrate";
import type { State } from "../domain/types";
import { backupText, DAY, downloadBackup, readFileText, REMIND_EVERY_DAYS, shareBackup } from "../data/backup";
import { listSnapshots, readSnapshot, updateMeta } from "../data/persist";
import { openImportConfirm, openImportSheet, openVersionsSheet } from "../ui/views/backup";
import { cleanBulkLine, cleanName, uid } from "../domain/text";
import { currentMatch, getMatch, getP, setAtt } from "../domain/lineup";
import { isDue, payersOf } from "../domain/money";
import { generateTeams } from "../domain/teams";
import { makeMatch } from "../domain/schedule";
import { getField } from "../domain/fields";
import { msgInvite, msgPay, msgTeams } from "../domain/messages";
import { applyFilter } from "../ui/components";
import { closeModal } from "../ui/modal";
import { openFieldEditor, openText } from "../ui/sheets";
import { toast } from "../ui/toast";
import { copyText } from "../ui/clipboard";

const $ = <T extends HTMLElement = HTMLInputElement>(sel: string) => document.querySelector(sel) as T | null;
const val = (sel: string) => ($(sel) as HTMLInputElement | null)?.value ?? "";
const cur = (): Match | null => currentMatch(store.s, ui.matchId, today());

export function newMatch(): void {
  const m = makeMatch(store.s, today());
  store.s.matches.push(m);
  ui.matchId = m.id;
  ui.payId = m.id;
  if (route().name !== "teams") go({ name: "match" });
  commit();
  window.scrollTo(0, 0);
}

let pendingImport: State | null = null;

function nameOf(m: Match, id: string): string {
  return getP(store.s, m, id)?.name || "";
}

function markExported(): void {
  updateMeta({ lastExportAt: Date.now(), reminderSnoozeUntil: 0 }).then(render);
}

/** Yedek metnini doğrular, özet + onay sayfasını açar. */
export function tryImport(text: string): void {
  try {
    pendingImport = parseBackup(text);
    openImportConfirm(pendingImport);
  } catch (e) {
    pendingImport = null;
    toast(e instanceof BackupError && e.code === "future" ? t("importFuture") : t("importBad"));
  }
}

export function importFromFile(input: HTMLInputElement): void {
  const f = input.files && input.files[0];
  if (!f) return;
  readFileText(f).then(tryImport, () => toast(t("fileBad")));
  input.value = "";
}

/** İsim boşsa false, aynı isim varsa null, eklenirse true. */
export function addPlayerNamed(name: string, rating: number, pos: Pos): boolean | null {
  const n = cleanName(name);
  if (!n) return false;
  if (store.s.players.some((p) => p.name.toLocaleLowerCase("tr") === n.toLocaleLowerCase("tr"))) return null;
  store.s.players.push({ id: uid(), name: n, rating: rating || 3, pos: pos || "", phone: "", active: true });
  return true;
}

function goTab(tab: Tab): void {
  go({ name: tab });
  ui.editId = null;
  render();
  window.scrollTo(0, 0);
}

registerActions({
  tab: (ds) => goTab(ds.v as Tab),
  goTeams: () => goTab("teams"),
  selMatch: (ds) => {
    ui.matchId = ds.id!;
    ui.payId = ds.id!;
    render();
  },
  newMatch: () => newMatch(),
  flt: (ds) => {
    const k = ds.k as FilterKey;
    (ui.f[k] as unknown as Record<string, string>)[ds.t!] = ds.v || "";
    applyFilter(k);
  },
  clearQ: (ds) => {
    const k = ds.k as FilterKey;
    ui.f[k].q = "";
    const i = document.getElementById("q-" + k) as HTMLInputElement | null;
    if (i) {
      i.value = "";
      i.focus();
    }
    applyFilter(k);
  },
  att: (ds) => {
    const m = cur();
    if (!m) return;
    setAtt(m, ds.id!, ds.s as "in", false);
    if (ui.f.att.q) {
      ui.f.att.q = "";
      ui.refocus = "q-att";
    }
    commit();
  },
  addGuest: () => {
    const m = cur();
    if (!m) return;
    const n = cleanName(val("#guestName"));
    if (!n) return toast(t("needName"));
    const g = { id: "g" + uid(), name: n, rating: Number(val("#guestRate")) || 3, pos: (val("#guestPos") || "") as Pos };
    m.guests.push(g);
    setAtt(m, g.id, "in", true);
    commit();
  },
  rmGuest: (ds) => {
    const m = cur();
    if (!m) return;
    const g = m.guests.find((x) => x.id === ds.id);
    mutate(t("guestRemoved", { n: g ? g.name : "" }), () => {
      m.guests = m.guests.filter((x) => x.id !== ds.id);
      delete m.att[ds.id!];
      m.order = m.order.filter((x) => x !== ds.id);
      delete m.paid[ds.id!];
    });
  },
  gen: () => {
    const m = cur();
    if (!m) return;
    mutate(t("teamsDone"), () => generateTeams(store.s, m));
  },
  manual: () => {
    const m = cur();
    if (!m) return;
    const had = m.teams.a.length + m.teams.b.length > 0;
    ui.f.team = { q: "", pos: "" };
    mutate(had ? t("teamsCleared") : null, () => {
      m.teams = { a: [], b: [] };
      m.manualTeams = true;
    });
  },
  move: (ds) => {
    const m = cur();
    if (!m) return;
    const id = ds.id!;
    const toB = m.teams.a.includes(id);
    mutate(t("movedTo", { n: nameOf(m, id), t: toB ? t("teamB") : t("teamA") }), () => {
      if (toB) {
        m.teams.a = m.teams.a.filter((x) => x !== id);
        m.teams.b.push(id);
      } else {
        m.teams.b = m.teams.b.filter((x) => x !== id);
        m.teams.a.push(id);
      }
    });
  },
  unassign: (ds) => {
    const m = cur();
    if (!m) return;
    mutate(t("unassigned", { n: nameOf(m, ds.id!) }), () => {
      m.teams.a = m.teams.a.filter((x) => x !== ds.id);
      m.teams.b = m.teams.b.filter((x) => x !== ds.id);
      m.manualTeams = true;
    });
  },
  addTo: (ds) => {
    const m = cur();
    if (!m) return;
    const side = ds.team as "a" | "b";
    if (ui.f.team.q) {
      ui.f.team.q = "";
      ui.refocus = "q-team";
    }
    mutate(t("addedTo", { n: nameOf(m, ds.id!), t: side === "a" ? t("teamA") : t("teamB") }), () => {
      m.teams[side].push(ds.id!);
    });
  },
  msg: (ds) => {
    const mm = ds.id ? getMatch(store.s, ds.id) : cur();
    if (!mm) return;
    const k = ds.k;
    const text = k === "invite" ? msgInvite(store.s, mm) : k === "teams" ? msgTeams(store.s, mm) : msgPay(store.s, mm);
    openText(k === "invite" ? t("inviteMsg") : k === "teams" ? t("shareTeams") : t("payReminder"), text, true);
  },
  copy: (ds) => {
    const ta = $<HTMLTextAreaElement>("#mtext");
    if (!ta) return;
    copyText(ta.value).then((ok) => {
      if (ok && ds.backup) markExported();
    });
  },
  copyIban: () => copyText(store.s.settings.iban),
  closeModal: () => closeModal(),
  finish: () => {
    const m = cur();
    if (!m) return;
    const a1 = val("#scA"), b1 = val("#scB");
    ui.matchId = null;
    mutate(t("matchDone"), () => {
      m.score = a1 !== "" || b1 !== "" ? { a: Number(a1) || 0, b: Number(b1) || 0 } : null;
      m.status = "played";
    });
  },
  reopen: (ds) => {
    const x = getMatch(store.s, ds.id);
    if (!x) return;
    ui.matchId = x.id;
    go({ name: "match" });
    mutate(t("matchReopened"), () => {
      x.status = "open";
    });
    window.scrollTo(0, 0);
  },
  cancelMatch: () => {
    const m = cur();
    if (!m) return;
    ui.matchId = null;
    mutate(t("matchCancelled"), () => {
      m.status = "cancelled";
    }, { lock: "before-delete" });
  },
  delMatch: () => {
    const m = cur();
    if (!m) return;
    ui.matchId = null;
    mutate(t("matchDeleted"), () => {
      store.s.matches = store.s.matches.filter((x) => x.id !== m.id);
    }, { lock: "before-delete" });
  },
  paid: (ds) => {
    const x = getMatch(store.s, ds.mid);
    if (!x) return;
    if (x.paid[ds.id!]) delete x.paid[ds.id!];
    else x.paid[ds.id!] = true;
    ui.payId = x.id;
    commit();
  },
  exempt: (ds) => {
    const x = getMatch(store.s, ds.mid);
    if (!x) return;
    if (x.exempt[ds.id!]) delete x.exempt[ds.id!];
    else {
      x.exempt[ds.id!] = true;
      delete x.paid[ds.id!];
    }
    ui.payId = x.id;
    commit();
  },
  allPaid: (ds) => {
    const x = getMatch(store.s, ds.id);
    if (!x) return;
    ui.payId = x.id;
    mutate(t("allMarkedPaid"), () => payersOf(store.s, x).forEach((id) => (x.paid[id] = true)));
  },
  settle: (ds) => {
    const name = getP(store.s, null, ds.id!)?.name || store.s.matches.flatMap((m) => m.guests).find((g) => g.id === ds.id)?.name || "";
    mutate(t("settled", { n: name }), () => {
      store.s.matches.forEach((x) => {
        if (x.status !== "cancelled" && isDue(x, today()) && payersOf(store.s, x).includes(ds.id!)) x.paid[ds.id!] = true;
      });
    });
  },
  addPlayer: () => {
    const r = addPlayerNamed(val("#newName"), Number(val("#newRate")), val("#newPos") as Pos);
    if (r === false) return toast(t("needName"));
    if (r === null) return toast(t("exists"));
    ui.refocus = "newName";
    commit();
  },
  bulkAdd: () => {
    const lines = val("#bulk").split(/\r?\n/).map(cleanBulkLine).filter(Boolean);
    let n = 0;
    mutate(() => (n ? t("added", { n }) : null), () => {
      lines.forEach((l) => {
        if (addPlayerNamed(l, 3, "")) n++;
      });
      if (!n) return false;
    });
    if (!n) toast(t("added", { n }));
  },
  editP: (ds) => {
    ui.editId = ui.editId === ds.id ? null : ds.id!;
    render();
  },
  rate: (ds) => {
    const p = store.s.players.find((x) => x.id === ds.id);
    if (!p) return;
    p.rating = Number(ds.v);
    commit();
  },
  active: (ds) => {
    const p = store.s.players.find((x) => x.id === ds.id);
    if (!p) return;
    const nowActive = p.active === false;
    mutate(t(nowActive ? "madeActive" : "madePassive", { n: p.name }), () => {
      p.active = nowActive;
    });
  },
  delPlayer: (ds) => {
    const p = store.s.players.find((x) => x.id === ds.id);
    if (!p) return;
    ui.editId = null;
    mutate(t("playerDeleted", { n: p.name }), () => {
      store.s.players = store.s.players.filter((x) => x.id !== ds.id);
    }, { lock: "before-delete" });
  },
  tglSet: (ds) => {
    const k = ds.k as "gkFree" | "round";
    store.s.settings[k] = !store.s.settings[k];
    commit();
  },
  newField: () => openFieldEditor(null, null),
  editField: (ds) => openFieldEditor(ds.id!, null),
  geo: () => {
    const out = document.getElementById("fe-coords");
    if (!navigator.geolocation) return toast(t("geoFail"));
    if (out) out.textContent = t("locating");
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const lat = Math.round(pos.coords.latitude * 1e6) / 1e6, lng = Math.round(pos.coords.longitude * 1e6) / 1e6;
        const a1 = $("#fe-lat"), b1 = $("#fe-lng");
        if (a1) a1.value = String(lat);
        if (b1) b1.value = String(lng);
        if (out) out.textContent = lat + ", " + lng;
        toast(t("locSaved"));
      },
      () => {
        if (out) out.textContent = t("locNone");
        toast(t("geoFail"));
      },
      { enableHighAccuracy: true, timeout: 12000, maximumAge: 60000 },
    );
  },
  saveField: (ds) => {
    const name = cleanName(val("#fe-name"));
    if (!name) return toast(t("fieldNeedName"));
    const lat = val("#fe-lat"), lng = val("#fe-lng");
    const data = {
      name, address: val("#fe-address").trim(), link: val("#fe-link").trim(), phone: val("#fe-phone").trim(), price: Number(val("#fe-price")) || 0,
      lat: lat === "" ? null : Number(lat), lng: lng === "" ? null : Number(lng),
    };
    let f = getField(store.s, ds.id);
    if (f) Object.assign(f, data);
    else {
      f = { id: uid(), ...data };
      store.s.fields.push(f);
    }
    if (!store.s.settings.defaultFieldId) store.s.settings.defaultFieldId = f.id;
    const m = cur();
    if (ui.fieldTarget === "match" && m) {
      m.fieldId = f.id;
      if (f.price) m.price = f.price;
    }
    if (ui.fieldTarget === "default") store.s.settings.defaultFieldId = f.id;
    ui.fieldTarget = null;
    closeModal();
    commit();
    toast(t("saved"));
  },
  delField: (ds) => {
    const f = getField(store.s, ds.id);
    if (!f) return;
    closeModal();
    mutate(t("fieldDeleted"), () => {
      store.s.matches.forEach((x) => {
        if (x.fieldId === f.id) {
          x.field = f.name;
          x.fieldId = "";
        }
      });
      store.s.fields = store.s.fields.filter((x) => x.id !== f.id);
      if (store.s.settings.defaultFieldId === f.id) store.s.settings.defaultFieldId = "";
    }, { lock: "before-delete" });
  },
  export: () => openText(t("exportData"), backupText(store.s), true, true),
  importOpen: () => openImportSheet(),
  doImport: () => tryImport(val("#mtext")),
  confirmImport: () => {
    const next = pendingImport;
    pendingImport = null;
    if (!next) return;
    closeModal();
    mutate(t("importOk"), () => replaceState(next), { lock: "before-import" });
  },
  shareBackup: () => {
    shareBackup(store.s, t("backupTitle")).then((r) => {
      if (r === "cancelled") return;
      markExported();
      toast(r === "shared" ? t("backupShared") : t("backupDownloaded"));
    });
  },
  downloadBackup: () => {
    downloadBackup(store.s);
    markExported();
    toast(t("backupDownloaded"));
  },
  snoozeBackup: () => {
    updateMeta({ reminderSnoozeUntil: Date.now() + REMIND_EVERY_DAYS * DAY }).then(render);
  },
  versions: () => {
    listSnapshots().then(openVersionsSheet).catch(() => openVersionsSheet([]));
  },
  restoreVersion: (ds) => {
    const id = Number(ds.id);
    readSnapshot(id).then((next) => {
      if (!next) return;
      closeModal();
      mutate(t("restored"), () => replaceState(next), { lock: "before-restore" });
    });
  },
  reset: () => {
    const lang = store.s.settings.lang;
    const next = defaults();
    next.settings.lang = lang;
    mutate(t("allDeleted"), () => replaceState(next), { lock: "before-reset" });
  },
});

/** Form alanı değişiklikleri (data-f). */
export function onField(el: HTMLInputElement | HTMLSelectElement): void {
  const f = el.dataset.f || "";
  const v = el.value;
  const S = store.s;
  if (f === "payId") {
    ui.payId = v;
    render();
    return;
  }
  if ((f === "s.defaultFieldId" || f === "m.fieldId") && v === "__new") {
    openFieldEditor(null, f === "m.fieldId" ? "match" : "default");
    render();
    return;
  }
  if (f.startsWith("s.")) {
    const k = f.slice(2);
    const st = S.settings as unknown as Record<string, unknown>;
    st[k] = k === "price" ? Number(v) || 0 : k === "format" ? Number(v) : v;
    commit();
    toast(t("saved"));
    return;
  }
  if (f.startsWith("slot.")) {
    const [, is, k] = f.split(".");
    const i = Number(is);
    S.settings.slots[i] = S.settings.slots[i] || { d: "", t: "21:00" };
    if (k === "d") S.settings.slots[i].d = v === "" ? "" : Number(v);
    else S.settings.slots[i].t = v;
    commit();
    toast(t("saved"));
    return;
  }
  if (f.startsWith("m.")) {
    const m = cur();
    if (!m) return;
    const k = f.slice(2);
    if (k === "date" && !v) return;
    if (k === "fieldId") {
      m.fieldId = v;
      const fl = getField(S, v);
      if (fl && Number(fl.price)) m.price = Number(fl.price);
      if (v) delete m.field;
    } else if (k === "price") m.price = Number(v) || 0;
    else if (k === "format") m.format = Number(v);
    else if (k === "date") m.date = v;
    else if (k === "time") m.time = v;
    ui.matchId = m.id;
    commit();
    return;
  }
  if (f.startsWith("p.")) {
    const p = S.players.find((x) => x.id === el.dataset.id);
    if (!p) return;
    const k = f.slice(2);
    if (k === "name") {
      const nv = cleanName(v);
      if (!nv) {
        el.value = p.name;
        return;
      }
      p.name = nv;
    } else if (k === "pos") p.pos = v as Pos;
    else if (k === "phone") p.phone = v;
    commit();
    toast(t("saved"));
  }
}

/** Enter kısayolları: oyuncu/misafir ekleme, aramada ilk sonucu seçme. */
export function onEnter(e: KeyboardEvent): void {
  const target = e.target as HTMLElement;
  const id = target.id;
  if (id === "newName") {
    e.preventDefault();
    document.querySelector<HTMLElement>('[data-a="addPlayer"]')?.click();
  } else if (id === "guestName") {
    e.preventDefault();
    document.querySelector<HTMLElement>('[data-a="addGuest"]')?.click();
  } else if (id === "q-att" || id === "q-team") {
    e.preventDefault();
    const key = id.slice(2) as FilterKey;
    const row = Array.from(document.querySelectorAll<HTMLElement>("#list-" + key + " [data-n]")).find((r) => !r.hidden);
    const m = cur();
    if (!row || !m) return;
    if (key === "att") {
      setAtt(m, row.dataset.id!, "in", true);
      ui.f.att.q = "";
      ui.refocus = "q-att";
      commit();
    } else {
      const side = m.teams.a.length <= m.teams.b.length ? "a" : "b";
      row.querySelector<HTMLElement>('[data-team="' + side + '"]')?.click();
    }
  }
}
