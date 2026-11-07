import fs from 'node:fs';
import { cur } from '../project.ts';
import { run, runOk, slug, writeJson } from '../util.ts';
import { probeMedia } from '../media.ts';

/**
 * macOS app / screen footage: ffmpeg avfoundation capture of the main display, cropped to an app's front
 * window (found via System Events, scaled for Retina). Needs the Screen Recording permission for the app
 * that runs the editor (Terminal / iTerm / Node); Accessibility for window bounds.
 */
export interface ScreenRecordOptions {
  app?: string;
  seconds: number;
  /** optional AppleScript lines run in the app after recording starts (simple scripted demos) */
  script?: string;
  fps?: number;
  name?: string;
  /** crop to the window with this padding (px, logical) */
  padding?: number;
  /** fit into the project frame (default) or keep the native window size */
  fit?: boolean;
}

const osa = (script: string) => run('osascript', ['-e', script]);

export async function listApps(): Promise<string[]> {
  if (process.platform !== 'darwin') return [];
  const r = await osa('tell application "System Events" to get name of every process whose background only is false');
  return r.code === 0 ? r.stdout.trim().split(/,\s*/).filter(Boolean).sort((a, b) => a.localeCompare(b)) : [];
}

async function screenDevice(): Promise<string> {
  const r = await run('ffmpeg', ['-hide_banner', '-f', 'avfoundation', '-list_devices', 'true', '-i', '']);
  const m = /\[(\d+)\] Capture screen 0/.exec(r.stderr);
  if (!m) throw new Error('Не найдено устройство захвата экрана (avfoundation «Capture screen 0»).');
  return m[1];
}

async function windowRect(app: string) {
  const esc = app.replace(/"/g, '\\"');
  await osa(`tell application "${esc}" to activate`);
  await new Promise((r) => setTimeout(r, 700));
  const r = await osa(`tell application "System Events" to tell process "${esc}" to get {position, size} of front window`);
  if (r.code !== 0) throw new Error(`Не удалось получить окно «${app}». Разрешите Accessibility для терминала: Системные настройки → Конфиденциальность → Универсальный доступ. (${r.stderr.trim().slice(0, 200)})`);
  const n = r.stdout.trim().split(/,\s*/).map(Number);
  if (n.length < 4 || n.some((x) => Number.isNaN(x))) throw new Error('окно не найдено: ' + r.stdout);
  const d = await osa('tell application "Finder" to get bounds of window of desktop');
  const logicalW = Number(d.stdout.trim().split(/,\s*/)[2]) || 0;
  return { x: n[0], y: n[1], w: n[2], h: n[3], logicalW };
}

export async function recordScreen(o: ScreenRecordOptions): Promise<{ file: string; duration: number }> {
  if (process.platform !== 'darwin') throw new Error('Запись приложений пока доступна только на macOS.');
  const store = cur();
  const p = store.project;
  const seconds = Math.max(1, Math.min(600, o.seconds));
  const fps = o.fps || p.fps;
  const dev = await screenDevice();
  let crop = '';
  if (o.app) {
    const r = await windowRect(o.app);
    // probe the physical capture size to get the Retina scale
    const probe = await run('ffmpeg', ['-hide_banner', '-f', 'avfoundation', '-framerate', '30', '-i', `${dev}:none`, '-frames:v', '1', '-f', 'null', '-']);
    const sz = /, (\d{3,5})x(\d{3,5})/.exec(probe.stderr);
    if (probe.code !== 0 || !sz) throw new Error('Нет доступа к записи экрана. Разрешите «Запись экрана» для приложения, в котором запущен редактор (Терминал / iTerm): Системные настройки → Конфиденциальность и безопасность → Запись экрана, затем перезапустите редактор.');
    const k = r.logicalW ? Number(sz[1]) / r.logicalW : 2;
    const pad = (o.padding ?? 0) * k;
    const cx = Math.max(0, Math.round(r.x * k - pad)), cy = Math.max(0, Math.round(r.y * k - pad));
    const cw = Math.round(r.w * k + pad * 2) & ~1, ch = Math.round(r.h * k + pad * 2) & ~1;
    crop = `crop=${cw}:${ch}:${cx}:${cy},`;
  }
  const W = p.width, H = p.height;
  const fit = o.fit !== false ? `scale=${W}:${H}:force_original_aspect_ratio=decrease:flags=lanczos,pad=${W}:${H}:(ow-iw)/2:(oh-ih)/2:color=black,` : '';
  const name = `rec-${slug(o.name || o.app || 'screen')}-${new Date().toISOString().slice(11, 19).replace(/:/g, '')}.mp4`;
  const out = store.p('media', name);
  const rec = runOk('ffmpeg', ['-y', '-v', 'error', '-f', 'avfoundation', '-framerate', String(Math.min(60, Math.max(fps, 30))), '-capture_cursor', '1', '-capture_mouse_clicks', '1', '-i', `${dev}:none`, '-t', String(seconds),
    '-vf', `${crop}${fit}fps=${fps},scale=out_color_matrix=bt709:out_range=tv,format=yuv420p`, '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '18', '-colorspace', 'bt709', '-color_primaries', 'bt709', '-color_trc', 'bt709', '-movflags', '+faststart', out]);
  if (o.app && o.script) {
    await new Promise((r) => setTimeout(r, 500));
    await osa(`tell application "${o.app.replace(/"/g, '\\"')}"\n${o.script}\nend tell`).catch(() => {});
  }
  try { await rec; } catch (e) {
    const msg = (e as Error).message;
    if (/Input\/output|not authorized|permission/i.test(msg)) throw new Error('Нет доступа к записи экрана: Системные настройки → Конфиденциальность и безопасность → Запись экрана → включите для Терминала/iTerm и перезапустите редактор.');
    throw e;
  }
  if (!fs.existsSync(out)) throw new Error('запись не создана');
  const info = await probeMedia(name, true);
  writeJson(store.p('.studio', 'media', name + '.source.json'), { kind: 'screen', ...o });
  return { file: name, duration: info.duration };
}
