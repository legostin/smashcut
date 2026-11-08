// Spend tracking & the daily budget for paid generations.
//   ${HOME_DIR}/gen-spend.json  { entries: GenSpendEntry[] }  (local day, USD; estimates unless the provider reports cost)
//   reserve(est) before a submit — refuses when today's spend + running reservations + est > genBudgetUsd;
//   commit() records the spend once the provider accepted/finished the job; release() drops a reservation
//   for a job that was never charged (failed before acceptance, cancelled while queued).
import fs from 'node:fs';
import path from 'node:path';
import { HOME_DIR, getSettings } from '../config.ts';
import { uerr } from '../i18n.ts';
import type { GenKind, GenSpendEntry, GenModelInfo, GenPrice } from '../../shared/types.ts';

const FILE = () => path.join(HOME_DIR, 'gen-spend.json');
export const DEFAULT_BUDGET = 10;
export const budgetUsd = () => { const b = getSettings().genBudgetUsd; return typeof b === 'number' && Number.isFinite(b) && b >= 0 ? b : DEFAULT_BUDGET; };

const pad = (n: number) => String(n).padStart(2, '0');
export const today = (d = new Date()) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const round = (x: number) => Math.round(x * 10000) / 10000;

function read(): GenSpendEntry[] {
  try { return JSON.parse(fs.readFileSync(FILE(), 'utf8')).entries || []; } catch { return []; }
}
function write(entries: GenSpendEntry[]) {
  // keep ~90 days
  const cut = today(new Date(Date.now() - 90 * 864e5));
  const tmp = FILE() + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify({ entries: entries.filter((e) => e.day >= cut) }, null, 2));
  fs.renameSync(tmp, FILE());
}

const reservations = new Map<string, number>();
const reservedTotal = () => [...reservations.values()].reduce((a, b) => a + b, 0);

export function spentToday(): number { const d = today(); return round(read().filter((e) => e.day === d).reduce((a, e) => a + e.usd, 0)); }

export function spendReport() {
  const d = today();
  const entries = read();
  const todays = entries.filter((e) => e.day === d);
  const byProvider: Record<string, number> = {};
  for (const e of todays) byProvider[e.provider] = round((byProvider[e.provider] || 0) + e.usd);
  const days: Record<string, number> = {};
  for (const e of entries) days[e.day] = round((days[e.day] || 0) + e.usd);
  return {
    day: d,
    budgetUsd: budgetUsd(),
    spentUsd: spentToday(),
    reservedUsd: round(reservedTotal()),
    remainingUsd: round(Math.max(0, budgetUsd() - spentToday() - reservedTotal())),
    byProvider,
    count: todays.length,
    recent: entries.slice(-30).reverse(),
    days,
    note: 'Costs are estimates from the providers\' public price lists unless the provider reports the exact cost; check the provider dashboard for the invoice.',
  };
}

/** reserve `usd` for a job; throws a clear error when it would exceed the daily budget */
export function reserve(id: string, usd: number, label: string) {
  if (usd <= 0) return;
  const budget = budgetUsd();
  const spent = spentToday();
  const held = reservedTotal();
  if (budget <= 0) throw uerr('Paid generation is off (daily budget $0). Set a budget in Settings → Generators.', {}, 402);
  if (spent + held + usd > budget + 1e-9) {
    throw uerr('Daily generation budget exceeded: {label} costs ~${est}, today ${spent} spent{held} of the ${budget} limit. Ask the user to raise the budget in Settings → Generators, use a cheaper model / shorter duration, or wait until tomorrow.', {
      label, est: usd.toFixed(2), spent: spent.toFixed(2), held: held ? ` + $${held.toFixed(2)} running` : '', budget: budget.toFixed(2),
    }, 402);
  }
  reservations.set(id, usd);
}
export function release(id: string) { reservations.delete(id); }

export function commit(id: string, e: Omit<GenSpendEntry, 'at' | 'day'>) {
  reservations.delete(id);
  const entries = read();
  entries.push({ at: new Date().toISOString(), day: today(), ...e, usd: round(e.usd) });
  write(entries);
}

// ---------- cost estimates ----------
export interface CostInput { kind: GenKind; count: number; duration?: number; resolution?: string; width?: number; height?: number; audio?: boolean }

/** USD estimate for one call from the model's price table */
export function estimate(price: GenPrice, i: CostInput): number {
  if (price.unit === 'free') return 0;
  const per = (i.resolution ? price.by?.[i.resolution] : undefined) ?? price.usd;
  let usd: number;
  switch (price.unit) {
    case 'second': usd = per * (i.duration || 5) + (i.audio && price.audioUsd ? price.audioUsd * (i.duration || 5) : 0); break;
    case 'video': usd = per + (i.audio && price.audioUsd ? price.audioUsd : 0); break;
    case 'megapixel': usd = per * Math.max(1, Math.ceil(((i.width || 1024) * (i.height || 1024)) / 1e6)) * Math.max(1, i.count); break;
    default: usd = per * Math.max(1, i.count);
  }
  return round(usd);
}

export function priceText(m: GenModelInfo): string {
  const p = m.price;
  if (p.unit === 'free') return 'free (local)';
  const by = p.by ? ' (' + Object.entries(p.by).map(([k, v]) => `${k} $${v}`).join(', ') + ')' : '';
  return `~$${p.usd}/${p.unit}${by}${p.audioUsd ? ` +$${p.audioUsd}/${p.unit} with audio` : ''}`;
}
