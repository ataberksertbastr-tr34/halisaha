/** Tüm kullanıcı eylemleri. Eski uygulamadaki act() / onField() ile aynı davranış. */
import { t } from "../i18n";
import { commit, mutate, rebaseLog, render, replaceState, store, today, ui, type FilterKey } from "./store";
import { back, go, route, tabOf, type RouteName, type Tab } from "./router";
import { dispatch, registerActions } from "./actions";
import type { Att, ExpenseCat, Guest, LogEv, Match, Pos, Side } from "../domain/types";
import { defaults } from "../domain/schema";
import { BackupError, parseBackup } from "../domain/migrate";
import type { State } from "../domain/types";
import { backupText, DAY, downloadBackup, readFileText, REMIND_EVERY_DAYS, shareBackup } from "../data/backup";
import { listSnapshots, readSnapshot, updateMeta } from "../data/persist";
import { openImportConfirm, openImportSheet, openVersionsSheet } from "../ui/views/backup";
import { cleanBulkLine, cleanName, norm, uid } from "../domain/text";
import { currentMatch, getMatch, getP, lineup, materializeOrder, promoted, setAtt } from "../domain/lineup";
import { joinBlock, retireMatch } from "../domain/discipline";
import { isFootball, kindOf } from "../domain/kinds";
import { gamesTally, keeperRotation } from "../domain/scoring";
import { teamName } from "../domain/teamstyle";
import { onEventField } from "./eventHandlers";
import { applyFixed, blockedFor, copyLastWeek, lateCancel, lockAt, type Added } from "../domain/roster";
import { lastEntry, logShareText, setSaid, stamp } from "../domain/attlog";
import { logTitle, openLogSheet, openSaidSheet } from "../ui/views/attlog";
import { applyPlan, choose, parseList, planList, type PlanRow } from "../domain/signup";
import { openPasteSheet, showPastePreview } from "../ui/views/signup";
import { liabilities } from "../domain/ledger";
import { debtReminderText, promotedText, waLink } from "../domain/messages";
import { money } from "../i18n";
import { billOf, freezeBill, isFree, lateToCover, replaceLate } from "../domain/money";
import { accounts, chargeOf, markPaid, newPayment, settleAll, unmarkPaid, whoIs } from "../domain/ledger";
import { openLedger } from "../ui/views/pay";
import { generateTeams, swapPlayers } from "../domain/teams";
import { ensureUpcoming, makeMatch, rememberSkip } from "../domain/schedule";
import { buildICS, eventOf } from "../domain/calendar";
import { openCalendarSheet } from "../ui/views/calendar";
import { ruleBook } from "../ui/views/rules";
import { findRule, ruleShareText, stripMd } from "../domain/rules";
import { isIOS } from "../pwa/register";
import { getField } from "../domain/fields";
import type { TemplateKey } from "../domain/types";
import { shareText, type ShareResult } from "../ui/share";
import { teamsSig } from "../domain/todo";
import { buildMessage, isDefaultTemplate, openShareSheet, openTemplateSheet, updateTemplatePreview } from "../ui/views/templates";
import { applyFilter, blockReason } from "../ui/components";
import { guestHistory, pastGuests } from "../domain/guests";
import { closeModal, isModalOpen } from "../ui/modal";
import { openFieldEditor, openText } from "../ui/sheets";
import { toast } from "../ui/toast";
import { copyText } from "../ui/clipboard";

const $ = <T extends HTMLElement = HTMLInputElement>(sel: string) => document.querySelector(sel) as T | null;
const val = (sel: string) => ($(sel) as HTMLInputElement | null)?.value ?? "";
const cur = (): Match | null => currentMatch(store.s, ui.matchId, today());

export function newMatch(): void {
  const m = makeMatch(store.s, today());
  const { blocked } = applyFixed(store.s, m, blockedFor(store.s, today()));
  store.s.matches.push(m);
  ui.matchId = m.id;
  ui.payId = m.id;
  if (route().name !== "teams") go({ name: "match" });
  commit();
  window.scrollTo(0, 0);
  if (blocked.length) toast(blockedText(m, blocked), undefined, 8000);
}

/** İptal/silinen maçtan sıradaki maça kayan "bir maç ceza"lar (Kural 9.3). */
function benchMovedText(pids: string[]): string {
  if (!pids.length) return "";
  return " · " + t("benchMoved", { n: pids.map((id) => store.s.players.find((p) => p.id === id)?.name || "").join(", ") });
}

/** Toplu yazmada engel yüzünden atlananlar (organizatör yine de elle ekleyebilir, Kural 12.1). */
function blockedText(m: Match, ids: string[]): string {
  return t("blockedSkipped", { n: ids.map((id) => getP(store.s, m, id)?.name || "").join(", ") });
}

let pendingImport: State | null = null;
/** Önizlenen WhatsApp listesi (Metni düzenle ile metin geri gelir). */
let pendingPaste: { mid: string; text: string; rows: PlanRow[] } | null = null;

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

/** Kural 1.5 / 15.3 (halı saha / etkinlik). */
const lateRule = (m: Match) => (isFootball(m) ? "1.5" : "15.3");

/**
 * Yedekten kadroya giren için "Mesaj gönder" bildirimi (telefonu varsa doğrudan WhatsApp).
 * late: yerine girdiği geç iptalci ve payı yerine girenin ödeyip ödemediği (Kural 1.5).
 */
function promotedToast(m: Match, id: string, late?: { n: string; pays: boolean }): void {
  const p = getP(store.s, m, id);
  if (!p) return;
  const text = promotedText(store.s, m, id);
  const u = waLink((p as { phone?: string }).phone, text);
  const msg = late ? t(late.pays ? "lateReplaced" : "lateReplacedFree", { n: late.n, r: p.name, k: lateRule(m) }) : t("promotedIn", { n: p.name });
  toast(msg, { label: t("sendMsg"), run: () => (u ? openLink(u) : void shareText(text)) }, 9000);
}

/** Kural 1.5: boş yere yazılan, geç iptal edenin yerine mi geldi? Organizatöre sorulur (12.1). */
function coverToast(m: Match, by: string, late: string): void {
  const r = nameOf(m, by), n = nameOf(m, late), k = lateRule(m);
  toast(t("coverLateAsk", { r, n, k }), {
    label: t("makeExempt"),
    run: () => {
      m.exempt[late] = true;
      commit();
      toast(t("lateReplaced", { n, r, k }));
    },
  }, 9000);
}

function nameOf(m: Match, id: string): string {
  return getP(store.s, m, id)?.name || "";
}

/**
 * Geç iptal sayılmasın: dokunulan yanıt geri gelir (Yok, Belki ya da yanıtsız). Günlükteki
 * "geç iptal" kaydı ayrı bir satır eklenmeden o yanıta çevrilir; said: oyuncunun haber verdiği an.
 */
function undoLate(m: Match, id: string, tapped: string, said?: number): void {
  if (m.att[id] !== "late") return;
  if (tapped === "in") delete m.att[id];
  else setAtt(m, id, tapped as Att, true);
  delete m.exempt[id];
  const e = lastEntry(m, id);
  if (e && e.ev === "late") {
    e.ev = tapped === "in" ? "clear" : (tapped as LogEv);
    if (said) setSaid(m, id, said);
    rebaseLog();
  }
  commit();
}

/**
 * Mesaj paylaşıldıysa ya da kopyalandıysa etkinlikte "gönderildi" diye işaretler (iş listesi).
 * Takımlarda paylaşılan kadronun imzası da tutulur: takımlar sonradan değişirse yeniden paylaşmak gerekir.
 */
function sentIf(r: ShareResult, mid: string | undefined, k: string | undefined): void {
  if ((r !== "shared" && r !== "copied") || !mid || !k) return;
  const m = getMatch(store.s, mid);
  if (!m) return;
  m.sent[k] = Date.now();
  if (k === "teams") m.sent.teamsSig = teamsSig(m);
  // Açık bir pencere (önizleme) ve yazılmakta olan metin bozulmasın: yalnızca kaydet
  commit(isModalOpen());
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
  shareRule: (ds) => {
    const it = findRule(ruleBook(), ds.id!);
    if (it) shareText(ruleShareText(it, t("goldenRule")));
  },
  shareGolden: () => {
    const b = ruleBook();
    shareText("⭐ " + b.goldenTitle + "\n\n" + b.goldenGroups.map((g) => (g.title ? g.title + "\n" : "") + g.items.map((x) => x.id.slice(1) + ". " + stripMd(x.text)).join("\n")).join("\n\n"));
  },
  clearRuleQ: () => {
    ui.ruleQ = "";
    render();
    document.getElementById("q-rules")?.focus();
  },
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
    // Kural 2.4, 9.3, 17.4: engelli kişi yazılmadan önce sorulur; son söz organizatörün (12.1).
    if ((st === "in" || st === "maybe") && m.att[id] !== "in" && m.att[id] !== "maybe" && !ds.force) {
      // Borçta getirdiği misafirlerin ödenmemiş payı da sayılır (Kural 1.8)
      const owe = liabilities(store.s, today())[id];
      const block = joinBlock(store.s, m, id, owe?.total || 0);
      if (block) {
        const who = getP(store.s, m, id)?.name || "";
        const why = blockReason(block, owe);
        return toast(t("blockedAsk", { n: who, r: why }), { label: t("blockedOverride"), run: () => dispatch("att", { id, s: st, force: "1" } as unknown as DOMStringMap, document.body) }, 9000);
      }
    }
    const before = lineup(store.s, m).playing;
    const wasPlaying = before.includes(id);
    const tapped = st;
    // Kural 1.4/1.5: kadro kesinleştikten sonra oynayan kadrodan çıkan ("Yok", "Belki", "Var"ı kaldıran) geç iptal sayılır.
    const autoLate = lateCancel(m, st, wasPlaying, new Date());
    if (autoLate) st = "late";
    setAtt(m, id, st, autoLate);
    // Kural 1.5: yerine yedekten giren varsa geç iptal eden muaf olur; kadroya yeniden girenin muafiyeti kalkar.
    const rep = replaceLate(store.s, m, id, before);
    const cover = rep ? null : lateToCover(store.s, m, id, before);
    if (ui.f.att.q) {
      ui.f.att.q = "";
      ui.refocus = "q-att";
    }
    commit();
    const name = getP(store.s, m, id)?.name || "";
    // Ücretsiz kaleci geç iptal etse de ödemez (Kural 2.1): bildirimde ödeme lafı geçmez.
    const free = isFree(store.s, m, id);
    if (rep) return promotedToast(m, rep.by, free ? undefined : { n: name, pays: rep.pays });
    const up = promoted(before, lineup(store.s, m).playing).filter((x) => x !== id);
    if (up.length) return promotedToast(m, up[0]);
    if (autoLate) {
      // Oyuncu kesinleşmeden önce haber verdiyse (organizatör sonradan işlediyse) saati girilir;
      // "Geç iptal sayma" organizatörün takdiridir (12.1).
      return toast(t(free ? "autoLateFree" : "autoLate", { n: name, r: lateRule(m) }), [
        { label: t("saidAsk"), run: () => openSaidSheet(m, id, tapped) },
        { label: t("notLate"), run: () => undoLate(m, id, tapped) },
      ], 9000);
    }
    if (cover) return coverToast(m, id, cover);
    if (m.att[id] === "in" && !ds.force) {
      const owe = liabilities(store.s, today())[id];
      if (owe) {
        const phone = store.s.players.find((p) => p.id === id)?.phone;
        const u = waLink(phone, debtReminderText(store.s, name, owe));
        const g = owe.guests.map((x) => x.name + " " + money(x.amount)).join(", ");
        toast(t("debtWarn", { n: name, a: money(owe.total) + (g ? " (" + t("guestDebtIncl", { g }) + ")" : "") }), u ? { label: t("remindShort"), run: () => openLink(u) } : undefined, 6000);
      }
    }
  },
  attLog: (ds) => {
    const m = getMatch(store.s, ds.id);
    if (m) openLogSheet(m);
  },
  shareLog: (ds) => {
    const m = getMatch(store.s, ds.id);
    if (m) shareText(logShareText(store.s, m, t("attLog") + " – " + logTitle(m), Date.now()));
  },
  saidOpen: (ds) => {
    const m = getMatch(store.s, ds.mid);
    if (m) openSaidSheet(m, ds.id!, ds.s || "out");
  },
  /** Geç iptalde haber saati: kesinleşmeden önceyse geç iptal sayılmaz (Kural 1.4–1.5, 15.3). */
  saidSave: (ds) => {
    const m = getMatch(store.s, ds.mid);
    const id = ds.id!;
    if (!m) return closeModal();
    const v = val("#said-at");
    const said = v ? new Date(v).getTime() : NaN;
    if (!Number.isFinite(said)) return toast(t("saidBad"));
    if (said > Date.now() + 60_000) return toast(t("saidFuture"));
    const name = nameOf(m, id);
    const lock = lockAt(m);
    const early = !!lock && said < lock.getTime() && m.att[id] === "late";
    closeModal(false, () => {
      if (early) {
        undoLate(m, id, ds.s || "out", said);
        toast(t("saidBefore", { n: name, d: stamp(said) }), undefined, 6000);
      } else {
        setSaid(m, id, said);
        commit();
        toast(t("saidAfter", { n: name, d: stamp(said), r: lateRule(m) }), undefined, 6000);
      }
    });
  },
  /** Sonucu girilmemiş maç uyarısından: o maçı açıp sonuç bölümüne kaydırır. */
  openResult: (ds) => {
    const m = getMatch(store.s, ds.id);
    if (!m || m.status !== "open") return;
    ui.matchId = m.id;
    ui.payId = m.id;
    go({ name: "match" });
    render();
    document.getElementById("h-res")?.scrollIntoView({ block: "start" });
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
    // Kural 3.5: "2 golde bir kaleci değişimi" anlaşıldıysa gol yiyen takıma hatırlatılır
    const rot = Number(ds.d) > 0 ? keeperRotation(m, id) : null;
    if (rot) toast(rot === "both" ? t("keeper2gAny") : t("keeper2g", { t: teamName(store.s, rot) }), undefined, 6000);
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
    let r: Added = { n: 0, blocked: [] };
    mutate(() => t("copiedRoster", { n: r.n }) + (r.blocked.length ? " · " + blockedText(m, r.blocked) : ""), () => {
      r = copyLastWeek(store.s, m, blockedFor(store.s, today()));
      if (!r.n) {
        toast(r.blocked.length ? blockedText(m, r.blocked) : t("nothingToCopy"), undefined, r.blocked.length ? 8000 : undefined);
        return false;
      }
    });
  },
  pasteList: () => {
    const m = cur();
    if (!m) return;
    openPasteSheet(pendingPaste?.mid === m.id ? pendingPaste.text : "");
  },
  pastePreview: () => {
    const m = cur();
    if (!m) return;
    const text = val("#plist");
    const entries = parseList(text);
    if (!entries.length) return toast(t("pasteNone"));
    pendingPaste = { mid: m.id, text, rows: planList(store.s, m, entries, today()) };
    showPastePreview(store.s, m, pendingPaste.rows, today());
  },
  pasteApply: () => {
    const m = cur();
    const p = pendingPaste;
    if (!m || !p || p.mid !== m.id) return closeModal();
    // Seçimler pencere kapanmadan okunur
    const rows = p.rows.map((r, i) => choose(r, val("#pr-" + i)));
    pendingPaste = null;
    closeModal(false, () => {
      let n = 0;
      mutate(() => t("pasteDone", { n }), () => {
        n = applyPlan(store.s, m, rows);
        if (!n) {
          toast(t("pasteNothing"));
          return false;
        }
      });
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
  addGuest: (ds) => {
    const m = cur();
    if (!m) return;
    // "Yine de yaz" ile gelindiğinde alanlar soruyu soran çağrıdan gelir (arada ekran yenilenmiş olabilir)
    const n = cleanName(ds.force ? ds.n : val("#guestName"));
    if (!n) return toast(t("needName"));
    const rating = Number(ds.force ? ds.r : val("#guestRate")) || 3;
    const pos = ((ds.force ? ds.p : val("#guestPos")) || "") as Pos;
    const host = (ds.force ? ds.h : val("#guestHost")) || "";
    // Kural 1.8: aynı adla daha önce gelmiş misafirin ödenmemiş borcu ya da disiplin engeli varsa önce sorulur (12.1)
    const hist = ds.force ? null : guestHistory(store.s, m, n, today());
    if (hist) {
      const hostName = hist.past.host ? store.s.players.find((p) => p.id === hist.past.host)?.name : "";
      const why = [
        hist.block ? blockReason(hist.block) : "",
        hist.debt ? t("guestPrevDebt", { a: money(hist.debt) }) + (hostName ? " (" + t("guestOf", { n: hostName }) + ")" : "") + " · " + t("ruleN", { n: "1.8, 2.4" }) : "",
      ].filter(Boolean).join("; ");
      return toast(t("blockedAsk", { n, r: why }), {
        label: t("blockedOverride"),
        run: () => dispatch("addGuest", { force: "1", n, r: String(rating), p: pos, h: host } as unknown as DOMStringMap, document.body),
      }, 9000);
    }
    const g: Guest = { id: "g" + uid(), name: n, rating, pos };
    if (host) g.host = host;
    const before = lineup(store.s, m).playing;
    m.guests.push(g);
    setAtt(m, g.id, "in", true);
    const cover = lateToCover(store.s, m, g.id, before);
    commit();
    if (cover) coverToast(m, g.id, cover);
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
      store.s.charges = store.s.charges.filter((c) => c.pid !== ds.id);
      m.cars = m.cars.filter((c) => c.driver !== ds.id);
      m.cars.forEach((c) => {
        c.pax = c.pax.filter((x) => x !== ds.id);
      });
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
    mutate(t("movedTo", { n: nameOf(m, id), t: teamName(store.s, toB ? "b" : "a") }), () => {
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
      toast(t("locked1", { n: name, t: teamName(store.s, side) }));
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
    mutate(t("addedTo", { n: nameOf(m, ds.id!), t: teamName(store.s, side) }), () => {
      m.teams[side].push(ds.id!);
    });
  },
  // Tek dokunuşla paylaş (Web Share → WhatsApp; yoksa kopyala)
  msg: (ds) => {
    const mm = ds.id ? getMatch(store.s, ds.id) : cur();
    if (!mm) return;
    const k = ds.k || "invite";
    shareText(buildMessage(k, mm).text).then((r) => sentIf(r, mm.id, k));
  },
  msgPreview: (ds) => {
    const mm = ds.id ? getMatch(store.s, ds.id) : cur();
    if (!mm) return;
    const k = ds.k || "invite";
    const { title, text } = buildMessage(k, mm);
    openShareSheet(title, text, k, mm.id);
  },
  shareSheet: (ds) => {
    const ta = $<HTMLTextAreaElement>("#mtext");
    if (ta) shareText(ta.value).then((r) => sentIf(r, ds.id, ds.k));
  },
  todoToggle: () => {
    ui.open.todo = !ui.open.todo;
    render();
  },
  /** İş listesinden: o etkinliğin ödemelerini açar. */
  todoPay: (ds) => {
    const m = getMatch(store.s, ds.id);
    if (!m) return;
    ui.payId = m.id;
    ui.payTab = "match";
    goTab("pay");
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
      if (ok) sentIf("copied", ds.id, ds.k);
    });
  },
  copyIban: () => copyText(store.s.settings.iban),
  closeModal: () => closeModal(),
  finish: () => {
    const m = cur();
    if (!m) return;
    const a1 = val("#scA"), b1 = val("#scB");
    const fb = isFootball(m);
    const k = kindOf(m);
    ui.matchId = null;
    // Ödemeler sekmesi biten maçı göstersin: paylar artık kesin (freezeBill)
    ui.payId = m.id;
    mutate(fb ? t("matchDone") : t("eventDone"), () => {
      // Kural 1.6: sıra cezası maç bitince kalıcı hale gelir
      materializeOrder(store.s, m);
      if (fb) m.score = a1 !== "" || b1 !== "" ? { a: Number(a1) || 0, b: Number(b1) || 0 } : scoreFromGoals(m);
      else if (k.score === "sets") m.score = gamesTally(m) || m.score;
      if (m.clock?.start) m.clock = { start: 0, acc: m.clock.acc + (Date.now() - m.clock.start) };
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
    // Kural 9.3: bu maça bağlı "bir maç ceza" sıradaki maça kayar
    let moved: string[] = [];
    mutate(() => (isFootball(m) ? t("matchCancelled") : t("eventCancelled")) + benchMovedText(moved), () => {
      moved = retireMatch(store.s, m);
    }, { lock: "before-delete" });
  },
  delMatch: () => {
    const m = cur();
    if (!m) return;
    ui.matchId = null;
    let moved: string[] = [];
    mutate(() => (isFootball(m) ? t("matchDeleted") : t("eventDeleted")) + benchMovedText(moved), () => {
      rememberSkip(store.s, m);
      moved = retireMatch(store.s, m, true);
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
    const k = ds.k as "gkFree" | "round" | "autoSchedule" | "avoidRepeat" | "perf" | "debtBlock" | "noShowPenalty";
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
  if (onEventField(el)) return;
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

/**
 * Misafir adı yazılınca (öneriden seçilince) önceki gelişindeki getiren, seviye ve mevki
 * gelir; organizatörün değiştirdiği alana dokunulmaz (Kural 1.8).
 */
export function guestPrefill(name: string): void {
  const m = cur();
  if (!m) return;
  const k = norm(cleanName(name));
  const g = k ? pastGuests(store.s, m.id).find((x) => norm(x.name) === k) : undefined;
  if (!g) return;
  const set = (id: string, v: string, def: string) => {
    const el = $<HTMLSelectElement>("#" + id);
    if (el && el.value === def && Array.from(el.options).some((o) => o.value === v)) el.value = v;
  };
  if (g.host) set("guestHost", g.host, "");
  set("guestRate", String(g.rating), "3");
  if (g.pos) set("guestPos", g.pos, "");
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
  } else if (target.classList.contains("sh-in")) {
    // Puan cetveli: Enter bir sonraki kişiye geçer, sonuncuda eli yazar
    e.preventDefault();
    const next = document.getElementById("sh-in-" + (Number(target.dataset.i) + 1));
    if (next) next.focus();
    else dispatch("sheetAdd", {} as DOMStringMap, target);
  } else if (id === "sync-email" || id === "sync-pw") {
    e.preventDefault();
    if (id === "sync-email") document.getElementById("sync-pw")?.focus();
    else document.querySelector<HTMLElement>('[data-a="syncEmailIn"]')?.click();
  } else if (id === "sync-newpw") {
    e.preventDefault();
    document.querySelector<HTMLElement>('[data-a="syncSetPw"]')?.click();
  } else if (id === "q-att" || id === "q-team") {
    e.preventDefault();
    const key = id.slice(2) as FilterKey;
    const row = Array.from(document.querySelectorAll<HTMLElement>("#list-" + key + " [data-n]")).find((r) => !r.hidden);
    const m = cur();
    if (!row || !m) return;
    if (key === "att") {
      // "Var" ile aynı yol: borç ve disiplin engeli de sorulur (Kural 2.4, 9.3)
      dispatch("att", { id: row.dataset.id!, s: "in" } as unknown as DOMStringMap, row);
    } else {
      const side = m.teams.a.length <= m.teams.b.length ? "a" : "b";
      row.querySelector<HTMLElement>('[data-team="' + side + '"]')?.click();
    }
  }
}
