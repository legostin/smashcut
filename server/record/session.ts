import fs from 'node:fs';
import path from 'node:path';
import { chromium, type Browser, type BrowserContext } from 'playwright-core';
import type { FastifyInstance } from 'fastify';
import { uerr, msg } from '../i18n.ts';
import { cur } from '../project.ts';
import { bus } from '../bus.ts';
import { slug } from '../util.ts';
import { findBrowser } from '../render/browser.ts';

/**
 * Logged-in sessions for web recordings. The USER logs in by hand in a visible browser window (agents never type
 * credentials); the cookies + localStorage (Playwright storageState) are saved per project in .studio/sessions/
 * (git-ignored twice: the project .gitignore and a `*` .gitignore inside the folder) and reused by record_web
 * {session:"name"}. Cookie values are never logged or returned by the API — only names, domains and counts.
 */
export interface SessionInfo { name: string; url: string; savedAt: string; domains: string[]; cookies: number }

const dir = () => {
  const d = cur().p('.studio', 'sessions');
  if (!fs.existsSync(d)) {
    fs.mkdirSync(d, { recursive: true, mode: 0o700 });
    fs.writeFileSync(path.join(d, '.gitignore'), '*\n');
  }
  return d;
};
const cleanName = (s: string) => slug(s || '').slice(0, 40) || 'default';
export const sessionPath = (name: string) => path.join(dir(), cleanName(name) + '.json');
const metaPath = (name: string) => path.join(dir(), cleanName(name) + '.meta.json');

export function listSessions(): SessionInfo[] {
  const d = dir();
  return fs.readdirSync(d).filter((f) => f.endsWith('.meta.json')).map((f) => {
    try { return JSON.parse(fs.readFileSync(path.join(d, f), 'utf8')) as SessionInfo; } catch { return null; }
  }).filter((s): s is SessionInfo => !!s && fs.existsSync(sessionPath(s.name))).sort((a, b) => b.savedAt.localeCompare(a.savedAt));
}

/** storageState file + the user agent of the browser that logged in (sites may bind a session to it) */
export function getSession(name: string): { file: string; userAgent?: string } {
  const file = sessionPath(name);
  if (!fs.existsSync(file)) {
    const have = listSessions().map((s) => s.name);
    throw uerr('No saved session “{name}” — log in first (Record → Log in for recordings){have}', { name, have: have.length ? ' · saved: ' + have.join(', ') : '' });
  }
  let userAgent: string | undefined;
  try { userAgent = JSON.parse(fs.readFileSync(metaPath(name), 'utf8')).userAgent; } catch {}
  return { file, userAgent };
}

// ---------- the login window ----------
interface Login { done?: boolean; dir: string; project: string; name: string; url: string; status: 'open' | 'saved' | 'error'; error?: string; browser?: Browser; ctx?: BrowserContext; state?: any; ua?: string; timer?: NodeJS.Timeout }
let login: Login | null = null;

/** a headed (visible) Chrome: the system Google Chrome when there is one, else a full Playwright Chromium */
async function launchHeaded(): Promise<Browser> {
  const args = ['--disable-blink-features=AutomationControlled', '--window-size=1280,860', '--no-first-run', '--no-default-browser-check'];
  const opts = { headless: false, args, ignoreDefaultArgs: ['--enable-automation'] };
  const errors: string[] = [];
  try { return await chromium.launch({ ...opts, channel: 'chrome' }); } catch (e) { errors.push(String((e as Error).message).split('\n')[0]); }
  const b = findBrowser();
  if (b.executablePath && !/headless/i.test(b.executablePath)) {
    try { return await chromium.launch({ ...opts, executablePath: b.executablePath }); } catch (e) { errors.push(String((e as Error).message).split('\n')[0]); }
  }
  try { return await chromium.launch(opts); } catch (e) { errors.push(String((e as Error).message).split('\n')[0]); }
  throw uerr('Could not open a browser window for the login — install Google Chrome ({error})', { error: errors[0] || 'no browser' });
}

function writeSession(l: Login) {
  if (!l.state) return false;
  // into the project the login was opened from (the user may have switched projects meanwhile)
  fs.writeFileSync(path.join(l.dir, l.name + '.json'), JSON.stringify(l.state), { mode: 0o600 });
  const domains = [...new Set<string>((l.state.cookies || []).map((c: any) => String(c.domain || '').replace(/^\./, '')))].filter(Boolean).slice(0, 12);
  const info: SessionInfo & { userAgent?: string } = { name: cleanName(l.name), url: l.url, savedAt: new Date().toISOString(), domains, cookies: (l.state.cookies || []).length, userAgent: l.ua };
  fs.writeFileSync(path.join(l.dir, l.name + '.meta.json'), JSON.stringify(info, null, 2), { mode: 0o600 });
  return true;
}

async function snapshot(l: Login) {
  try { if (l.ctx) l.state = await l.ctx.storageState(); } catch { /* window closing */ }
}

async function finish(l: Login, alive: boolean) {
  if (l.done) return;
  l.done = true; // the window closing fires both "page closed" and "disconnected": save once
  clearInterval(l.timer);
  if (alive) await snapshot(l);
  const ok = writeSession(l);
  l.status = ok ? 'saved' : 'error';
  if (!ok) l.error = 'nothing to save';
  l.browser?.close().catch(() => {});
  l.browser = undefined; l.ctx = undefined; l.state = undefined; // drop cookies from memory
  bus.send({ type: 'notice', level: ok ? 'info' : 'error', ...msg(ok ? 'Session “{name}” saved — recordings with it open logged in' : 'Login window closed — nothing was saved', { name: l.name }) });
}

export async function openLogin(url: string, name?: string): Promise<{ name: string; status: string }> {
  if (!url) throw uerr('Enter a URL');
  if (!/^https?:\/\//.test(url)) url = 'https://' + url;
  if (login?.status === 'open' && !login.done) { if (login.ctx) { const pg = login.ctx.pages()[0] || await login.ctx.newPage(); await pg.bringToFront().catch(() => {}); } return { name: login.name, status: 'open' }; }
  const nm = cleanName(name || new URL(url).hostname.replace(/^www\./, ''));
  const browser = await launchHeaded();
  const prev = fs.existsSync(sessionPath(nm)) ? sessionPath(nm) : undefined;
  const ctx = await browser.newContext({ viewport: null, storageState: prev });
  const l: Login = { dir: dir(), project: cur().id, name: nm, url, status: 'open', browser, ctx };
  login = l;
  const page = await ctx.newPage();
  l.ua = await page.evaluate(() => navigator.userAgent).catch(() => undefined);
  // the user may quit the browser at any moment: keep a fresh snapshot, write it when the window goes away
  l.timer = setInterval(() => { void snapshot(l); }, 2000);
  const pagesGone = () => { if (!ctx.pages().length) void finish(l, browser.isConnected()); };
  ctx.on('page', (p) => p.on('close', pagesGone));
  page.on('close', pagesGone);
  browser.on('disconnected', () => { void finish(l, false); });
  page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 }).catch(() => {});
  return { name: nm, status: 'open' };
}

export async function saveLogin(): Promise<{ name?: string; status: string }> {
  if (!login) return { status: 'none' };
  await finish(login, true);
  return { name: login.name, status: login.status };
}

export function registerWebSessionRoutes(app: FastifyInstance) {
  app.get('/api/record/sessions', async () => ({
    sessions: listSessions(),
    login: login && login.project === cur().id ? { name: login.name, url: login.url, status: login.status, error: login.error } : null,
  }));
  app.post<{ Body: { url: string; name?: string } }>('/api/record/login', async (req) => openLogin(String(req.body?.url || ''), req.body?.name));
  app.post('/api/record/login/save', async () => saveLogin());
  app.delete<{ Params: { name: string } }>('/api/record/sessions/:name', async (req) => {
    for (const f of [sessionPath(req.params.name), metaPath(req.params.name)]) fs.rmSync(f, { force: true });
    return { ok: true };
  });
}
