// The strings of "Toward Morning" on its own orchestra in 3D, the stage and nothing else (ui=0): a
// passage where each string part comes in and goes out (60–92 s of the piece: the first violins rest
// for ten seconds, the others in turn), seen from the front left, in on the five string seats, slowly
// along them.
//   BASE=http://127.0.0.1:4711 TAG=before node artifacts/bow-polish/tools/symphony.mjs [scout] [take] [encode]
process.env.DSF ??= '2';
process.env.RAW ??= new URL('../raw', import.meta.url).pathname;
const FPS = 30;
const { mkdirSync } = await import('node:fs');
const { take, encode, measure, report, join, conductor } = await import('./take.mjs');
const { installCam } = await import('./cam.mjs');

const TAG = process.env.TAG ?? 'before';
const LOOK = process.env.LOOK ?? '3d';
const NAME = process.env.NAME ?? `symphony-strings-${LOOK}-${TAG}`;
const DIR = new URL('..', import.meta.url).pathname.replace(/\/$/, '');
const FILE = join(DIR, `${NAME}.mp4`);
const S = Number(process.env.FROM ?? 60);
const E = Number(process.env.TO ?? 92);
const LEAD = 0.8;
const RING = 2.2;
const ST = [8, 9, 10, 11, 12];
const KEYS = JSON.parse(
  process.env.KEYS ??
    JSON.stringify([
      { t: S, ids: ST, yaw: -0.2, pitch: 0.33, fillW: 0.9, fillH: 0.9 },
      { t: (S + E) / 2, ids: ST, yaw: -0.05, pitch: 0.3, fillW: 0.94, fillH: 0.92 },
      { t: E, ids: ST, yaw: 0.12, pitch: 0.33, fillW: 0.9, fillH: 0.9 },
    ]),
);
const what = process.argv.slice(2);
const want = (k) => (!what.length && k !== 'scout') || what.includes(k);
const URL_ = `/symphony?view=${LOOK}&ui=0`;

async function ready(page) {
  await page.evaluate(async () => {
    await window.__piano.start();
    await window.__orchestra.ensemble.ensureEngines();
  });
  await page.waitForFunction(() => window.__player.loaded && (!window.__stage3d || window.__stage3d.stats.frames > 90));
  if (LOOK === '3d') await installCam(page);
  return page.evaluate(
    async ([S, KEYS, is3d]) => {
      const lv = window.__lv;
      const pl = window.__player;
      if (is3d) window.__stage3d.stats.ao = true;
      pl.seek(S + 8);
      await pl.play();
      await new Promise((r) => setTimeout(r, 1500));
      pl.pause();
      pl.seek(S - 0.005);
      await new Promise((r) => setTimeout(r, 600));
      let keys = [];
      if (is3d) {
        keys = KEYS.map((k) => ({ t: k.t, ...lv.frameSeats(k.ids, k.yaw, k.pitch, k) }));
        const at = lv.track(keys);
        let top = keys[0].t;
        lv.cam = (pos) => {
          if (pl.playing) top = Math.max(top, pos);
          return at(top);
        };
        lv.camAt = at;
      }
      await new Promise((r) => setTimeout(r, 2500));
      if (is3d) window.__stage3d.stats.ao = true;
      lv.blank();
      return { keys: keys.length, lineup: window.__orchestra.ensemble.lineup };
    },
    [S, KEYS, LOOK === '3d'],
  );
}

if (want('scout')) {
  const { open } = await import('./rec.mjs');
  const dir = join(DIR, 'scout');
  mkdirSync(dir, { recursive: true });
  const t = await open({ url: URL_, view: { w: 1440, h: 810, dsf: 1 } });
  await new Promise((r) => setTimeout(r, 1500));
  await conductor(t.page);
  console.log(JSON.stringify(await ready(t.page)));
  for (const tt of (process.env.AT ?? `${S + 1},${(S + E) / 2},${E - 1}`).split(',').map(Number)) {
    await t.page.evaluate(async (tt) => {
      const lv = window.__lv;
      const pl = window.__player;
      if (lv.camAt) {
        const at = lv.camAt;
        lv.cam = () => at(tt);
      }
      pl.seek(Math.max(0, tt - 1));
      await pl.play();
      await new Promise((r) => setTimeout(r, 1100));
      if (window.__stage3d) window.__stage3d.stats.ao = true;
      await lv.frames(4);
    }, tt);
    await t.page.screenshot({ path: `${dir}/${NAME}-t${tt.toFixed(1).padStart(5, '0')}.png` });
    await t.page.evaluate(() => window.__player.pause());
  }
  await t.browser.close();
}
if (want('take')) {
  await take({
    name: NAME,
    url: URL_,
    half: FPS === 30,
    async prepare({ page }) {
      console.log('stage', JSON.stringify(await ready(page)));
    },
    async perform({ page }) {
      return page.evaluate(
        async ([S, E, RING]) => {
          const lv = window.__lv;
          const pl = window.__player;
          lv.note('ready');
          await new Promise((r) => setTimeout(r, 900));
          await pl.play();
          lv.note('play', { first: lv.heardAt(S), last: lv.heardAt(E) });
          await new Promise((r) => {
            const iv = setInterval(() => {
              if (!pl.playing || lv.heard() >= E) {
                clearInterval(iv);
                r();
              }
            }, 20);
          });
          pl.pause();
          lv.note('end');
          await new Promise((r) => setTimeout(r, RING * 1000 + 300));
          lv.note('out');
          return { S, E };
        },
        [S, E, RING],
      );
    },
  });
}
if (want('encode')) {
  const m = measure(NAME);
  const play = m.tk.log.find((l) => l.name === 'play');
  const first = m.heardPerf(play.t0 + (S - play.pos0));
  const last = m.heardPerf(play.t0 + (E - play.pos0));
  await encode(NAME, FILE, { from: first - LEAD * 1000, to: last + RING * 1000, fadeIn: 0.3, fadeOut: 1.4, fps: FPS, crf: 14, audioDelay: 30 });
  console.log(JSON.stringify(report(FILE), null, 1));
}
