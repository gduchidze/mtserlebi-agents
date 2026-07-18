// Drive the built game headless and capture screenshots of every UI state.
// Usage: node scripts/ui_probe.mjs [outDir]
import { chromium } from 'playwright';
import { mkdirSync } from 'fs';

const OUT = process.argv[2] || 'scripts/ui_shots';
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({
  headless: true,
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
});
const page = await browser.newPage({ viewport: { width: 1024, height: 768 } });
const errors = [];
page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
page.on('console', (m) => {
  if (m.type() === 'error') errors.push(`console: ${m.text()}`);
});

const shot = (name) => page.screenshot({ path: `${OUT}/${name}.png` });
const wait = (ms) => page.waitForTimeout(ms);
const gameEval = (fn, arg) => page.evaluate(fn, arg);

const playerPos = () => gameEval(() => {
  const s = window.game.scene.getScene('Game');
  return { x: s.player.x, y: s.player.y };
});

// Feedback-driven walk: headless FPS varies, so poll position instead of
// trusting wall-clock hold times.
async function walkTo(tx, ty, tolerance = 60, maxSteps = 60) {
  for (let i = 0; i < maxSteps; i++) {
    const { x, y } = await playerPos();
    const dx = tx - x, dy = ty - y;
    if (Math.abs(dx) < tolerance && Math.abs(dy) < tolerance) return true;
    const key = Math.abs(dx) > Math.abs(dy)
      ? (dx > 0 ? 'ArrowRight' : 'ArrowLeft')
      : (dy > 0 ? 'ArrowDown' : 'ArrowUp');
    await page.keyboard.down(key);
    await wait(250);
    await page.keyboard.up(key);
    await wait(60);
  }
  return false;
}

await page.goto('http://localhost:8123/', { waitUntil: 'networkidle' });
await wait(1500);
await shot('01-menu');

await page.mouse.click(512, 594);
await wait(400);
await shot('02-instructions');
await page.mouse.click(512, 473);
await wait(400);

await page.mouse.click(512, 524);
await wait(1500);
await shot('03-game-start');

// teleport near Rustaveli (probe can't pathfind), then walk final approach
await gameEval(() => {
  const s = window.game.scene.getScene('Game');
  s.player.setPosition(s.rustaveli.sprite.x - 180, s.rustaveli.sprite.y);
});
await wait(300);
let reached = false;
for (let round = 0; round < 6 && !reached; round++) {
  const rus = await gameEval(() => {
    const s = window.game.scene.getScene('Game');
    return { x: s.rustaveli.sprite.x, y: s.rustaveli.sprite.y };
  });
  await walkTo(rus.x - 70, rus.y, 35, 10);
  reached = await gameEval(() => {
    const s = window.game.scene.getScene('Game');
    return s.rustaveli.isPlayerNearby(s.player);
  });
}
await shot('04-near-rustaveli');

await page.keyboard.down('Space');
await wait(300);
await page.keyboard.up('Space');
await wait(400);
await shot('05-dialogue-prompt');
await page.keyboard.type('gamarjoba', { delay: 40 });
await wait(300);
await shot('06-dialogue-typed');
await page.keyboard.press('Enter');
await wait(4500);
await shot('07-dialogue-reply');

const dialogueState = await gameEval(() => {
  const s = window.game.scene.getScene('Game');
  return { visible: s.dialogueBox.isVisible(), text: s.dialogueBox.text.text.slice(0, 60) };
});
if (dialogueState.visible) {
  await page.keyboard.press('Escape'); // close dialogue first
  await wait(400);
}

await page.keyboard.press('Escape');
await wait(700);
await shot('08-pause');
const pauseState = await gameEval(() => ({
  paused: window.game.scene.isPaused('Game'),
  menu: window.game.scene.isActive('PauseMenu'),
}));
await page.mouse.click(512, 334); // Resume
await wait(500);

// explore: teleport to spots, settle, screenshot (checks NPC placement + terrain)
for (const [name, x, y] of [['09-southwest', 560, 1136], ['10-south-plaza', 1060, 1890], ['11-northwest', 720, 496]]) {
  await gameEval(([px, py]) => {
    const s = window.game.scene.getScene('Game');
    s.player.setPosition(px, py);
  }, [x, y]);
  await wait(1200);
  await shot(name);
}

// NPC positions sanity: nobody stuck far from spawn / inside buildings
const npcReport = await gameEval(() => {
  const s = window.game.scene.getScene('Game');
  return s.philosophers.map((p) => ({
    name: p.name, x: Math.round(p.sprite.x), y: Math.round(p.sprite.y),
  }));
});

console.log('reachedRustaveli:', reached);
console.log('dialogue:', JSON.stringify(dialogueState));
console.log('pause:', JSON.stringify(pauseState));
console.log('npcs:', JSON.stringify(npcReport));
console.log(errors.length ? `ERRORS:\n${errors.join('\n')}` : 'no js errors');
await browser.close();
