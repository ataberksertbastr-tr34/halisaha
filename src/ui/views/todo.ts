/**
 * Haftalık iş listesi (Etkinlik sekmesinin başında): şimdi yapılacak ilk iş tek dokunuşluk
 * düğmesiyle görünür; "Tümü" ile sıradaki etkinliğin bütün adımları ve önceki etkinliklerden
 * kalan işler açılır.
 */
import { t } from "../../i18n";
import { isOpen, store, today } from "../../app/store";
import type { Match } from "../../domain/types";
import { esc } from "../../domain/text";
import { todoOf, type Step } from "../../domain/todo";
import { IC } from "../icons";

function row(x: Step, primary: boolean): string {
  const ic = x.state === "done" ? IC.check : x.state === "warn" ? IC.alert : x.state === "later" ? IC.timer : '<i class="todo-dot"></i>';
  const a = x.act;
  const btn = a
    ? '<button type="button" class="btn sm' + (primary ? " primary" : "") + '" data-a="' + a.a + '" data-id="' + esc(x.mid) + '"' + (a.k ? ' data-k="' + a.k + '"' : "") + (a.v ? ' data-v="' + a.v + '"' : "") +
      ' aria-label="' + esc(x.title + ": " + a.label) + '">' + esc(a.label) + "</button>"
    : "";
  return '<li class="todo-row st-' + x.state + '" data-step="' + x.key + (x.past ? "-past" : "") + '"><span class="todo-ic" aria-hidden="true">' + ic + '</span><div class="pname"><strong>' + esc(x.title) + '</strong><span class="meta">' + esc(x.text) + "</span></div>" + btn + "</li>";
}

export function todoBlock(m: Match | null): string {
  const td = todoOf(store.s, m, new Date(), today());
  if (!td.steps.length) return "";
  const open = isOpen("todo", false);
  const count = td.total ? td.done + "/" + td.total : "";
  let h = '<section class="section todobox" aria-labelledby="h-todo"><div class="todo-head"><h2 id="h-todo">' + esc(t("todoTitle")) + "</h2>" +
    '<button type="button" class="btn xs ghost todo-all" data-a="todoToggle" aria-expanded="' + open + '" aria-controls="todo-list">' + esc((count ? count + " · " : "") + (open ? t("todoLess") : t("todoAll"))) + "</button></div>";
  h += '<ul class="todolist" id="todo-list">';
  if (open) h += td.steps.map((x) => row(x, x === td.next)).join("");
  else if (td.next) h += row(td.next, true);
  else h += '<li class="todo-row st-done"><span class="todo-ic" aria-hidden="true">' + IC.check + '</span><div class="pname"><strong>' + esc(t("todoNone")) + "</strong></div></li>";
  return h + "</ul></section>";
}
