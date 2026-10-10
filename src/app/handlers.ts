/** Tüm kullanıcı eylemleri. Eski uygulamadaki act() / onField() ile aynı davranış. */
import { t } from "../i18n";
import { commit, mutate, render, replaceState, store, today, ui, type FilterKey } from "./store";
import { back, go, route, tabOf, type RouteName, type Tab } from "./router";
import { dispatch, registerActions } from "./actions";
import type { Att, ExpenseCat, Guest, Match, Pos, Side } from "../domain/types";
import { defaults } from "../domain/schema";
import { BackupError, parseBackup } from "../domain/migrate";
import type { State } from "../domain/types";
import { backupText, DAY, downloadBackup, readFileText, REMIND_EVERY_DAYS, shareBackup } from "../data/backup";
import { listSnapshots, readSnapshot, updateMeta } from "../data/persist";
import { openImportConfirm, openImportSheet, openVersionsSheet } from "../ui/views/backup";
import { cleanBulkLine, cleanName, uid } from "../domain/text";
import { currentMatch, getMatch, getP, lineup, promoted, setAtt } from "../domain/lineup";
import { applyFixed, copyLastWeek, isLocked } from "../domain/roster";
import { debtMap } from "../domain/ledger";
import { promotedText, waLink, waPersonal } from "../domain/messages";
import { money } from "../i18n";
import { billOf, freezeBill } from "../domain/money";
import { accounts, chargeOf, markPaid, newPayment, settleAll, unmarkPaid, whoIs } from "../domain/ledger";
import { openLedger } from "../ui/views/pay";
import { generateTeams, swapPlayers } from "../domain/teams";
import { ensureUpcoming, makeMatch, rememberSkip } from "../domain/schedule";
import { buildICS, eventOf } from "../domain/calendar";
import { openCalendarSheet } from "../ui/views/calendar";
import { isIOS } from "../pwa/register";
import { getField } from "../domain/fields";
import type { TemplateKey } from "../domain/types";
import { shareText } from "../ui/share";
import { buildMessage, isDefaultTemplate, openShareSheet, openTemplateSheet, updateTemplatePreview } from "../ui/views/templates";
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
  applyFixed(store.s, m);
  store.s.matches.push(m);
  ui.matchId = m.id;
  ui.payId = m.id;
  if (route().name !== "teams") go({ name: "match" });
  commit();
  window.scrollTo(0, 0);
}

let pendingImport: State | null = null;

/** Skor girilmediyse takım gollerinden hesaplar. */
function scoreFromGoals(m: Match): Match["score"] {
  if (!Object.keys(m.goals).length || !(m.teams.a.length || m.teams.b.length)) return null;
  const sum = (ids: string[]) => ids.reduce((x, id) => x + (m.goals[id] || 0), 0);
  return { a: sum(m.teams.a), b: sum(m.teams.b) };
}

/** .ics dosyasını kaydeder / açar (iPhone'da doğrudan takvim ekranı). */
function saveICS(ms: Match[]): void {
  if (!ms.length) return;
  const ics = buildICS(ms.map((m) => eventOf(store.s, m, t("calEventTitle"))));
  if (isIOS()) {
    window.open("data:text/calendar;charset=utf-8," + encodeURIComponent(ics), "_blank");
    return;
  }
  const url = URL.createObjectURL(new Blob([ics], { type: "text/calendar;charset=utf-8" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = (ms.length === 1 ? "halisaha-" + ms[0].date : "halisaha-maclar") + ".ics";
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}

function openLink(u: string): void {
  window.open(u, "_blank", "noopener");
}

/** Yedekten kadroya giren için "Mesaj gönder" bildirimi (telefonu varsa doğrudan WhatsApp). */
function promotedToast(m: Match, id: string): void {
  const p = getP(store.s, m, id);
  if (!p) return;
  const text = promotedText(store.s, m, id);
  const u = waLink((p as { phone?: string }).phone, text);
  toast(t("promotedIn", { n: p.name }), { label: t("sendMsg"), run: () => (u ? openLink(u) : void shareText(text)) }, 9000);
}

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
  store.s.players.push({ id: uid(), name: n, rating: rating || 3, pos: pos || "", phone: "", active: true, fixed: false });
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
  nav: (ds) => {
    go({ name: ds.v as RouteName, arg: ds.id }, true);
    ui.editId = null;
    const done = () => {
      render();
      window.scrollTo(0, 0);
    };
    closeModal(false, done);
  },
  back: (ds) => back({ name: (ds.v as RouteName) || tabOf(route()) }, () => {
    render();
    window.scrollTo(0, 0);
  }),
  season: (ds) => {
    ui.season = ds.v!;
    render();
  },
  editFromCard: (ds) => {
    go({ name: "players" });
    ui.editId = ds.id!;
    render();
    document.querySelector('[data-a="editP"][data-id="' + CSS.escape(ds.id!) + '"]')?.scrollIntoView({ block: "center" });
  },
  selMatch: (ds) => {
    ui.matchId = ds.id!;
    ui.payId = ds.id!;
    render();
  },
  newMatch: () => newMatch(),
  toggleDetails: () => {
    ui.detailsOpen = !ui.detailsOpen;
    render();
  },
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
    const id = ds.id!;
    let st = ds.s as Att;
    const before = lineup(store.s, m).playing;
    const wasPlaying = before.includes(id);
    // Kural 1.4/1.5: kadro kesinleştikten sonra oynayan kadrodan "Yok" diyen geç iptal sayılır.
    const autoLate = st === "out" && m.att[id] !== "out" && wasPlaying && isLocked(m, new Date());
    if (autoLate) st = "late";
    setAtt(m, id, st, autoLate);
    if (ui.f.att.q) {
      ui.f.att.q = "";
      ui.refocus = "q-att";
    }
    commit();
    const name = getP(store.s, m, id)?.name || "";
    const up = promoted(before, lineup(store.s, m).playing).filter((x) => x !== id);
    if (up.length) return promotedToast(m, up[0]);
    if (autoLate) {
      return toast(t("autoLate", { n: name }), {
        label: t("makeOut"),
        run: () => {
          setAtt(m, id, "out", true);
          commit();
        },
      }, 8000);
    }
    if (m.att[id] === "in") {
      const debt = debtMap(store.s, today())[id];
      if (debt) {
        const phone = store.s.players.find((p) => p.id === id)?.phone;
        const u = phone ? waPersonal(store.s, phone, name, debt) : "";
        toast(t("debtWarn", { n: name, a: money(debt) }), u ? { label: t("remindShort"), run: () => openLink(u) } : undefined, 6000);
      }
    }
  },
  reserve: (ds) => {
    const m = getMatch(store.s, ds.id);
    if (!m) return;
    const on = !m.reserved;
    mutate(on ? t("reservedOk") : t("reservedUndo"), () => {
      m.reserved = on;
    });
  },
  calendar: (ds) => {
    const m = getMatch(store.s, ds.id);
    if (m) openCalendarSheet(m);
  },
  icsOne: (ds) => {
    const m = getMatch(store.s, ds.id);
    if (m) saveICS([m]);
  },
  icsAll: () => {
    saveICS(store.s.matches.filter((m) => m.status === "open" && m.date >= today()));
  },
  goal: (ds) => {
    const m = cur();
    if (!m) return;
    const id = ds.id!;
    const n = Math.max(0, (m.goals[id] || 0) + Number(ds.d));
    if (n) m.goals[id] = n;
    else delete m.goals[id];
    commit();
  },
  mvp: (ds) => {
    const m = cur();
    if (!m) return;
    m.mvp = m.mvp === ds.id ? "" : ds.id!;
    commit();
  },
  copyLastWeek: () => {
    const m = cur();
    if (!m) return;
    let n = 0;
    mutate(() => t("copiedRoster", { n }), () => {
      n = copyLastWeek(store.s, m);
      if (!n) {
        toast(t("nothingToCopy"));
        return false;
      }
    });
  },
  noshow: (ds) => {
    const m = cur() || getMatch(store.s, ds.mid);
    if (!m) return;
    if (m.noshow[ds.id!]) delete m.noshow[ds.id!];
    else m.noshow[ds.id!] = true;
    commit();
  },
  fixed: (ds) => {
    const p = store.s.players.find((x) => x.id === ds.id);
    if (!p) return;
    p.fixed = !p.fixed;
    commit();
    toast(p.fixed ? t("fixedOn", { n: p.name }) : t("fixedOff", { n: p.name }));
  },
  addGuest: () => {
    const m = cur();
    if (!m) return;
    const n = cleanName(val("#guestName"));
    if (!n) return toast(t("needName"));
    const g: Guest = { id: "g" + uid(), name: n, rating: Number(val("#guestRate")) || 3, pos: (val("#guestPos") || "") as Pos };
    const host = val("#guestHost");
    if (host) g.host = host;
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
      // Misafirin bu maça yazılmış ödemeleri de kalkar (Geri al ile geri gelir).
      store.s.payments = store.s.payments.filter((p) => p.pid !== ds.id);
    });
  },
  gen: () => {
    const m = cur();
    if (!m) return;
    let broken = 0;
    mutate(() => (broken ? t("rulesBroken", { n: broken }) : t("teamsDone")), () => {
      broken = generateTeams(store.s, m).broken.length;
    });
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
  lock: (ds) => {
    const m = cur();
    if (!m) return;
    const id = ds.id!, side = ds.team as Side;
    const name = nameOf(m, id);
    if (m.locks[id] === side) {
      delete m.locks[id];
      commit();
      toast(t("unlocked1", { n: name }));
    } else {
      m.locks[id] = side;
      commit();
      toast(t("locked1", { n: name, t: side === "a" ? t("teamA") : t("teamB") }));
    }
  },
  ruleMode: (ds) => {
    // Yeniden çizmeden güncelle (seçili oyuncular kaybolmasın)
    ui.ruleTogether = ds.v === "1";
    document.querySelectorAll<HTMLElement>('[data-a="ruleMode"]').forEach((b) => {
      const on = (b.dataset.v === "1") === ui.ruleTogether;
      b.classList.toggle("on", on);
      b.setAttribute("aria-checked", String(on));
    });
  },
  addRule: () => {
    const a = val("#rule-a"), b = val("#rule-b");
    if (!a || !b || a === b) return toast(t("ruleSame"));
    const together = ui.ruleTogether;
    mutate(t("ruleAdded"), () => {
      store.s.pairRules = store.s.pairRules.filter((r) => !((r.a === a && r.b === b) || (r.a === b && r.b === a)));
      store.s.pairRules.push({ id: uid(), a, b, together });
    });
  },
  delRule: (ds) => {
    mutate(t("ruleDeleted"), () => {
      store.s.pairRules = store.s.pairRules.filter((r) => r.id !== ds.id);
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
  // Tek dokunuşla paylaş (Web Share → WhatsApp; yoksa kopyala)
  msg: (ds) => {
    const mm = ds.id ? getMatch(store.s, ds.id) : cur();
    if (!mm) return;
    shareText(buildMessage(ds.k || "invite", mm).text);
  },
  msgPreview: (ds) => {
    const mm = ds.id ? getMatch(store.s, ds.id) : cur();
    if (!mm) return;
    const { title, text } = buildMessage(ds.k || "invite", mm);
    openShareSheet(title, text);
  },
  shareSheet: () => {
    const ta = $<HTMLTextAreaElement>("#mtext");
    if (ta) shareText(ta.value);
  },
  tplEdit: (ds) => openTemplateSheet(ds.k as TemplateKey),
  tplIns: (ds) => {
    const ta = $<HTMLTextAreaElement>("#tpl-text");
    if (!ta) return;
    const ins = "{" + ds.v + "}";
    const a = ta.selectionStart ?? ta.value.length, b = ta.selectionEnd ?? a;
    ta.value = ta.value.slice(0, a) + ins + ta.value.slice(b);
    ta.focus();
    ta.setSelectionRange(a + ins.length, a + ins.length);
    updateTemplatePreview();
  },
  tplSave: (ds) => {
    const k = ds.k as TemplateKey;
    const text = val("#tpl-text");
    if (isDefaultTemplate(k, text)) delete store.s.settings.templates[k];
    else store.s.settings.templates[k] = text;
    closeModal();
    commit();
    toast(t("templateSaved"));
  },
  tplReset: (ds) => {
    const k = ds.k as TemplateKey;
    delete store.s.settings.templates[k];
    commit();
    openTemplateSheet(k);
    toast(t("templateReset"));
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
      m.score = a1 !== "" || b1 !== "" ? { a: Number(a1) || 0, b: Number(b1) || 0 } : scoreFromGoals(m);
      m.status = "played";
      freezeBill(store.s, m);
    });
  },
  reopen: (ds) => {
    const x = getMatch(store.s, ds.id);
    if (!x) return;
    ui.matchId = x.id;
    go({ name: "match" });
    mutate(t("matchReopened"), () => {
      x.status = "open";
      delete x.bill;
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
      rememberSkip(store.s, m);
      store.s.matches = store.s.matches.filter((x) => x.id !== m.id);
    }, { lock: "before-delete" });
  },
  paid: (ds) => {
    const x = getMatch(store.s, ds.mid);
    if (!x) return;
    ui.payId = x.id;
    const c = chargeOf(store.s, x, ds.id!, today());
    if (!c) return;
    if (c.status === "paid") {
      const name = whoIs(store.s, ds.id!)?.name || "";
      mutate(t("unmarkedPaid", { n: name }), () => {
        if (!unmarkPaid(store.s, x, ds.id!)) {
          toast(t("paidFromPool"));
          return false;
        }
      });
    } else mutate(null, () => markPaid(store.s, x, ds.id!, today()));
  },
  exempt: (ds) => {
    const x = getMatch(store.s, ds.mid);
    if (!x) return;
    ui.payId = x.id;
    mutate(null, () => {
      if (x.exempt[ds.id!]) delete x.exempt[ds.id!];
      else x.exempt[ds.id!] = true;
      // Oynanmış maçta muafiyet bilinçli bir düzeltmedir: ödeme listesi yeniden hesaplanır.
      if (x.status === "played") freezeBill(store.s, x);
    });
  },
  allPaid: (ds) => {
    const x = getMatch(store.s, ds.id);
    if (!x) return;
    ui.payId = x.id;
    mutate(t("allMarkedPaid"), () => billOf(store.s, x).payers.forEach((id) => markPaid(store.s, x, id, today())));
  },
  payTab: (ds) => {
    ui.payTab = ds.v as typeof ui.payTab;
    render();
  },
  ledger: (ds) => openLedger(ds.id!),
  takePayment: (ds) => {
    const id = ds.id!;
    const amount = Number(String(val("#lp-amount")).replace(",", "."));
    if (!(amount > 0)) return toast(t("amountBad"));
    const at = val("#lp-date") || today();
    const note = val("#lp-note").trim();
    const name = whoIs(store.s, id)?.name || "";
    mutate(t("paymentAdded", { n: name, a: money(amount) }), () => {
      store.s.payments.push(newPayment(id, amount, at, undefined, note || undefined));
    });
    openLedger(id);
  },
  refund: (ds) => {
    const id = ds.id!;
    const a = accounts(store.s, today()).get(id);
    if (!a || a.credit <= 0) return;
    mutate(t("refundNote") + ": " + money(a.credit), () => {
      store.s.payments.push(newPayment(id, -a.credit, today(), undefined, t("refundNote")));
    });
    openLedger(id);
  },
  delPayment: (ds) => {
    mutate(t("paymentDeleted"), () => {
      store.s.payments = store.s.payments.filter((p) => p.id !== ds.id);
    });
    if (ds.pid) openLedger(ds.pid);
  },
  addExpense: () => {
    const amount = Number(String(val("#ex-amount")).replace(",", "."));
    if (!(amount > 0)) return toast(t("amountBad"));
    const cat = (val("#ex-cat") || "other") as ExpenseCat;
    mutate(t("expenseAdded"), () => {
      store.s.expenses.push({ id: uid(), at: val("#ex-date") || today(), amount: Math.round(amount * 100) / 100, cat, note: val("#ex-note").trim() });
    });
  },
  delExpense: (ds) => {
    mutate(t("expenseDeleted"), () => {
      store.s.expenses = store.s.expenses.filter((e) => e.id !== ds.id);
    });
  },
  settle: (ds) => {
    const name = whoIs(store.s, ds.id!)?.name || "";
    mutate(t("settled", { n: name }), () => {
      if (!settleAll(store.s, ds.id!, today())) return false;
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
    const k = ds.k as "gkFree" | "round" | "autoSchedule" | "avoidRepeat" | "perf";
    store.s.settings[k] = !store.s.settings[k];
    let made = 0;
    if (k === "autoSchedule" && store.s.settings.autoSchedule) made = ensureUpcoming(store.s, new Date()).length;
    commit();
    if (made) toast(t("scheduled", { n: made }));
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
    mutate(t("importOk"), () => {
      replaceState(next);
      ensureUpcoming(store.s, new Date());
    }, { lock: "before-import" });
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
      mutate(t("restored"), () => {
        replaceState(next);
        ensureUpcoming(store.s, new Date());
      }, { lock: "before-restore" });
    });
  },
  reset: () => {
    const lang = store.s.settings.lang;
    const next = defaults();
    next.settings.lang = lang;
    mutate(t("allDeleted"), () => replaceState(next), { lock: "before-reset" });
  },
});

/** Sahada dokunma/sürükleme. */
export const pitchHandlers = {
  tap: (id: string) => {
    const m = cur();
    if (!m) return;
    const pick = ui.swapPick;
    if (!pick || pick === id) {
      ui.swapPick = pick === id ? null : id;
      return render();
    }
    const sameSide = m.teams.a.includes(pick) === m.teams.a.includes(id);
    if (sameSide) {
      ui.swapPick = id;
      return render();
    }
    ui.swapPick = null;
    pitchHandlers.swap(pick, id);
  },
  swap: (a: string, b: string) => {
    const m = cur();
    if (!m) return;
    ui.swapPick = null;
    mutate(t("swapped", { a: nameOf(m, a), b: nameOf(m, b) }), () => {
      if (!swapPlayers(m, a, b)) return false;
      m.manualTeams = true;
    });
  },
  move: (id: string) => {
    ui.swapPick = null;
    dispatch("move", { id } as unknown as DOMStringMap, document.body);
  },
};

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
  if (f === "month") {
    ui.month = v;
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
    const made = ensureUpcoming(S, new Date());
    commit();
    toast(made.length ? t("scheduled", { n: made.length }) : t("saved"));
    return;
  }
  if (f === "reserveDays") {
    S.settings.reserveDays = Number(v) || 0;
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
    else if (k === "date" || k === "time") {
      // Otomatik planlanan maç taşınırsa eski zamanı tekrar oluşturulmasın
      rememberSkip(S, m);
      if (k === "date") m.date = v;
      else m.time = v;
    }
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
