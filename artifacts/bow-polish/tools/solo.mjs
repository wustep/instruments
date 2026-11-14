// A violin alone in 3D playing the étude (etude.mjs), the stage and nothing else (ui=0): the bow seen
// from a little above the strings' level, so that it shows when it leaves them.
//   BASE=http://127.0.0.1:4711 TAG=before node artifacts/bow-polish/tools/solo.mjs [scout] [take] [encode]
// INSTRUMENT=cello plays the étude two octaves… no: the étude is the violin's; another instrument plays
// its own bundled piece (PIECE=own), from FROM to TO seconds.
process.env.DSF ??= '2';
process.env.RAW ??= new URL('../raw', import.meta.url).pathname;
const FPS = 30;
const { readFileSync, mkdirSync } = await import('node:fs');
const { take, encode, measure, report, join, conductor } = await import('./take.mjs');
const { FRAME } = await import('./cam.mjs');

const TAG = process.env.TAG ?? 'before';
const INST = process.env.INSTRUMENT ?? 'violin';
const OWN = process.env.PIECE === 'own';
const LOOK = process.env.LOOK ?? '3d';
const NAME = process.env.NAME ?? `solo-${INST}-${LOOK}-${TAG}`;
/** PIN: the camera exactly (a view as the stage takes it: the before take's, so the two clips match) */
const PIN = process.env.PIN ? JSON.parse(process.env.PIN) : null;
const DIR = new URL('..', import.meta.url).pathname.replace(/\/$/, '');
const FILE = join(DIR, `${NAME}.mp4`);
const MID = join(DIR, 'etude-violin.mid');
const S = Number(process.env.FROM ?? 0);
const E = Number(process.env.TO ?? (OWN ? 24 : 23.75));
const LEAD = 0.8;
const RING = 2.4;
/** the camera: a bearing and how much of the picture the instrument and its bow take */
const VIEW = JSON.parse(process.env.VIEW ?? '{"yaw":0.62,"pitch":0.2,"fillW":0.86,"fillH":0.86}');
const what = process.argv.slice(2);
const want = (k) => (!what.length && k !== 'scout') || what.includes(k);

async function ready(page) {
  const bytes = OWN ? null : [...readFileSync(MID)];
  await page.evaluate(async () => {
    await window.__piano.start();
  });
  if (LOOK === '3d') await page.waitForFunction(() => window.__stage3d && window.__stage3d.stats.frames > 60);
  return page.evaluate(
    async ([bytes, S, VIEW, F, INST, PIN]) => {
      const lv = window.__lv;
      const pl = window.__player;
      if (bytes) await pl.load(new Uint8Array(bytes).buffer, null, false, false);
      else {
        await pl.loadDemo(INST);
        pl.pause();
      }
      // every shader and the bow moved once, then silence, from the start
      pl.seek(S + 3);
      await pl.play();
      await new Promise((r) => setTimeout(r, 1200));
      pl.pause();
      pl.seek(Math.max(0, S - 0.005));
      await new Promise((r) => setTimeout(r, 3500));
      const s3 = window.__stage3d;
      if (!s3) return { loaded: !!pl.loaded };
      s3.stats.ao = true;
      const v = PIN ?? (await lv.fit(VIEW.yaw, VIEW.pitch, { fillW: VIEW.fillW, fillH: VIEW.fillH, F, shiftX: VIEW.shiftX ?? 0, shiftY: VIEW.shiftY ?? 0 }));
      const view = PIN ?? { target: v.target, yaw: v.yaw, pitch: v.pitch, dist: (v.dist * (VIEW.zoom ?? 1)) / F };
      lv.cam = () => view;
      await lv.frames(6);
      s3.stats.ao = true;
      return { view, loaded: !!pl.loaded };
    },
    [bytes, S, VIEW, FRAME, INST, PIN],
  );
}

if (want('scout')) {
  const { open } = await import('./rec.mjs');
  const dir = join(DIR, 'scout');
  mkdirSync(dir, { recursive: true });
  const t = await open({ url: `/${INST}?view=${LOOK}&ui=0`, view: { w: 1440, h: 810, dsf: 1 } });
  await new Promise((r) => setTimeout(r, 1500));
  await conductor(t.page);
  console.log(JSON.stringify(await ready(t.page)));
  for (const tt of (process.env.AT ?? '1,5.4,6.6,8,11.3,12.4,13.5,15,18,20,22').split(',').map(Number)) {
    await t.page.evaluate(async (tt) => {
      const pl = window.__player;
      pl.seek(Math.max(0, tt - 1.2));
      await pl.play();
      await new Promise((r) => {
        const iv = setInterval(() => {
          if (window.__lv.heard() >= tt) {
            clearInterval(iv);
            r();
          }
        }, 5);
      });
    }, tt);
    await t.page.screenshot({ path: `${dir}/${NAME}-t${tt.toFixed(1).padStart(4, '0')}.png` });
    await t.page.evaluate(() => window.__player.pause());
  }
  await t.browser.close();
}
if (want('take')) {
  await take({
    name: NAME,
    url: `/${INST}?view=${LOOK}&ui=0`,
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
  await encode(NAME, FILE, { from: first - LEAD * 1000, to: last + RING * 1000, fadeOut: 1.4, fps: FPS, crf: 14, audioDelay: 30 });
  console.log(JSON.stringify(report(FILE), null, 1));
}
