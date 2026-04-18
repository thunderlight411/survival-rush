'use strict';
/* ============================================================
   WAR GAME  –  Browser RTS with online multiplayer
   (c) 2026  –  single-file game client
   ============================================================ */

// ── Constants ──────────────────────────────────────────────
const TS = 28;          // tile size in pixels
const MW = 52;          // map width  (tiles)
const MH = 36;          // map height (tiles)
const POP_MAX = 20;     // max units per player
const CAM_SPD = 300;    // camera scroll speed (px/s)

// Tile types
const GRASS = 0, WATER = 1, FOREST = 2, MOUNTAIN = 3;
const WALKABLE   = [true, false, true, false];
let TILE_COLOR = ['#3a7530', '#1a4e9e', '#27561a', '#555566'];
let TILE_DARK  = ['#2d5c25', '#13387a', '#1d4013', '#444455'];

const BIOMES = [
  {
    id: 'woodlands',
    name: 'Bosland',
    palette: {
      color: ['#3a7530', '#1a4e9e', '#27561a', '#555566'],
      dark:  ['#2d5c25', '#13387a', '#1d4013', '#444455'],
    },
    cfg: { water: 3, mountain: 4, forest: 7, riverChance: 0.2 }
  },
  {
    id: 'islands',
    name: 'Archipel',
    palette: {
      color: ['#74a84f', '#2a78c8', '#4e7f33', '#7f858d'],
      dark:  ['#5a873d', '#1f5f9f', '#3e6628', '#676c74'],
    },
    cfg: { water: 7, mountain: 2, forest: 4, riverChance: 0.55 }
  },
  {
    id: 'highlands',
    name: 'Hoogland',
    palette: {
      color: ['#76934d', '#2a66aa', '#5a723d', '#8a8f99'],
      dark:  ['#5e773d', '#214f86', '#465b2f', '#6f747d'],
    },
    cfg: { water: 2, mountain: 7, forest: 4, riverChance: 0.3 }
  },
  {
    id: 'marsh',
    name: 'Moeras',
    palette: {
      color: ['#5f7f43', '#356d6e', '#3f5f2f', '#6a6a70'],
      dark:  ['#4d6736', '#2b5758', '#334c26', '#56565c'],
    },
    cfg: { water: 5, mountain: 3, forest: 8, riverChance: 0.45 }
  },
];
let currentBiomeName = 'Bosland';
const MAX_REMOTE_CMDS_PER_3S = 70;

// Player colours
const P_COLOR = ['#4488ff', '#ff4444'];
const P_DARK  = ['#2266cc', '#cc2222'];
const P_NAME  = ['Blauw', 'Rood'];

// Entity type strings
const WORKER   = 'worker';
const SOLDIER  = 'soldier';
const ARCHER   = 'archer';
const CAVALRY  = 'cavalry';
const SPEARMAN = 'spearman';
const SIEGE    = 'siege';
const BASE     = 'base';
const BARRACKS = 'barracks';
const TOWER    = 'tower';
const MARKET   = 'market';
const WALL     = 'wall';

/* Entity definition table
   u   = isUnit
   hp  = max hitpoints
   spd = move speed px/s
   dmg = damage per hit
   rng = attack range px
   cd  = attack cooldown s
   cost= gold cost
   tm  = train/build time s
   fw,fh = footprint width/height in tiles
   letter = display letter
   ta  = trainable-at building types (units only)
   auto= auto-attack without order (towers)          */
const DEF = {
  [WORKER]:  { u:1,hp:60, spd:90, dmg:8,  rng:36,    cd:1.5,cost:50, tm:6,  fw:1,fh:1,letter:'W',ta:[BASE,BARRACKS] },
  [SOLDIER]: { u:1,hp:140,spd:80, dmg:25, rng:36,    cd:1.2,cost:100,tm:10, fw:1,fh:1,letter:'S',ta:[BASE,BARRACKS] },
  [ARCHER]:  { u:1,hp:90, spd:80, dmg:18, rng:200,   cd:1.8,cost:120,tm:12, fw:1,fh:1,letter:'A',ta:[BARRACKS] },
  [CAVALRY]: { u:1,hp:110,spd:130,dmg:28, rng:36,    cd:1.0,cost:130,tm:13, fw:1,fh:1,letter:'C',ta:[BARRACKS] },
  [SPEARMAN]:{ u:1,hp:180,spd:60, dmg:20, rng:36,    cd:1.4,cost:110,tm:11, fw:1,fh:1,letter:'P',ta:[BARRACKS] },
  [SIEGE]:   { u:1,hp:120,spd:45, dmg:14, rng:190,   cd:2.8,cost:180,tm:18, fw:1,fh:1,letter:'⚙',ta:[BARRACKS] },
  [BASE]:    { u:0,hp:600,spd:0,  dmg:0,  rng:0,     cd:0,  cost:0,  tm:0,  fw:2,fh:2,letter:'⌂' },
  [BARRACKS]:{ u:0,hp:350,spd:0,  dmg:0,  rng:0,     cd:0,  cost:120,tm:0,  fw:2,fh:2,letter:'R' },
  [TOWER]:   { u:0,hp:250,spd:0,  dmg:12, rng:5*TS,  cd:1.5,cost:80, tm:0,  fw:1,fh:1,letter:'↑',auto:true },
  [MARKET]:  { u:0,hp:200,spd:0,  dmg:0,  rng:0,     cd:0,  cost:150,tm:0,  fw:2,fh:1,letter:'$',income:4 },
  [WALL]:    { u:0,hp:500,spd:0,  dmg:0,  rng:0,     cd:0,  cost:50, tm:0,  fw:1,fh:1,letter:'█' },
};

// Counter multipliers: attacker type → victim types → damage multiplier
const COUNTER_BONUS = {
  [CAVALRY]:  { [ARCHER]:   1.9 },
  [ARCHER]:   { [SPEARMAN]: 1.9 },
  [SPEARMAN]: { [CAVALRY]:  1.9 },
  [SIEGE]:    { [BASE]:2.8, [BARRACKS]:2.8, [TOWER]:2.8, [MARKET]:2.8, [WALL]:2.8 },
};

// ── Seeded RNG (xorshift32) ────────────────────────────────
let _rngS = 1;
function rngSeed(s) { _rngS = (s >>> 0) || 1; }
function rng() {
  _rngS ^= _rngS << 13;
  _rngS ^= _rngS >> 17;
  _rngS ^= _rngS << 5;
  return (_rngS >>> 0) / 0x100000000;
}
function rngInt(a, b) { return Math.floor(rng() * (b - a + 1)) + a; }

// ── Map ────────────────────────────────────────────────────
let mapTiles = []; // [y][x]  Uint8Array rows

function generateMap(seed) {
  rngSeed(seed);
  mapTiles = Array.from({ length: MH }, () => new Uint8Array(MW));
  const half = MW >> 1;
  const biome = BIOMES[Math.floor(rng() * BIOMES.length)];

  applyBiomePalette(biome);
  currentBiomeName = biome.name;

  // Water lakes
  for (let i = 0; i < biome.cfg.water; i++)
    blobTile(rngInt(6, half - 6), rngInt(4, MH - 5), rngInt(2, 4), WATER);
  // Mountain ridges
  for (let i = 0; i < biome.cfg.mountain; i++)
    blobTile(rngInt(5, half - 5), rngInt(3, MH - 4), rngInt(1, 3), MOUNTAIN);
  // Forests
  for (let i = 0; i < biome.cfg.forest; i++)
    blobTile(rngInt(3, half - 3), rngInt(2, MH - 3), rngInt(2, 4), FOREST);

  if (rng() < biome.cfg.riverChance) carveRiverLeftHalf();

  // Mirror left half onto right half (symmetric map)
  for (let y = 0; y < MH; y++)
    for (let x = 0; x < half; x++)
      mapTiles[y][MW - 1 - x] = mapTiles[y][x];

  // Clear all corner start zones so random corner spawns are always playable
  clearZone(1, 1, 11, 11);
  clearZone(MW - 12, 1, MW - 2, 11);
  clearZone(1, MH - 12, 11, MH - 2);
  clearZone(MW - 12, MH - 12, MW - 2, MH - 2);

  // Open a middle lane to reduce hard stalemates on some biome rolls
  clearZone((MW >> 1) - 2, (MH >> 1) - 3, (MW >> 1) + 1, (MH >> 1) + 2);
}

function applyBiomePalette(biome) {
  TILE_COLOR = biome.palette.color.slice();
  TILE_DARK  = biome.palette.dark.slice();
}

function carveRiverLeftHalf() {
  const half = MW >> 1;
  let y = rngInt(4, MH - 5);
  let width = rng() < 0.45 ? 2 : 1;

  for (let x = 2; x < half - 2; x++) {
    if (rng() < 0.55) y += rng() < 0.5 ? -1 : 1;
    y = Math.max(2, Math.min(MH - 3, y));
    for (let w = -width; w <= width; w++) {
      const yy = y + w;
      if (yy >= 0 && yy < MH) mapTiles[yy][x] = WATER;
    }
    if (rng() < 0.12) width = Math.max(1, Math.min(2, width + (rng() < 0.5 ? -1 : 1)));
  }
}

function blobTile(cx, cy, r, type) {
  const half = MW >> 1;
  for (let dy = -r; dy <= r; dy++)
    for (let dx = -r; dx <= r; dx++) {
      const x = cx + dx, y = cy + dy;
      if (x >= 0 && x < half && y >= 0 && y < MH && dx * dx + dy * dy <= r * r)
        mapTiles[y][x] = type;
    }
}

function clearZone(x1, y1, x2, y2) {
  for (let y = Math.max(0, y1); y <= Math.min(MH - 1, y2); y++)
    for (let x = Math.max(0, x1); x <= Math.min(MW - 1, x2); x++)
      mapTiles[y][x] = GRASS;
}

function tileWalkable(tx, ty) {
  return tx >= 0 && tx < MW && ty >= 0 && ty < MH && WALKABLE[mapTiles[ty][tx]];
}

function areaWalkable(tx, ty, tw, th) {
  for (let dy = 0; dy < th; dy++)
    for (let dx = 0; dx < tw; dx++)
      if (!tileWalkable(tx + dx, ty + dy)) return false;
  return true;
}

// ── Pathfinding (BFS with parent map) ─────────────────────
const DIRS8 = [[0,-1],[0,1],[-1,0],[1,0],[-1,-1],[-1,1],[1,-1],[1,1]];

function findPath(sx, sy, gx, gy) {
  const stx = (sx / TS) | 0, sty = (sy / TS) | 0;
  let   gtx = (gx / TS) | 0, gty = (gy / TS) | 0;

  if (stx === gtx && sty === gty) return [];

  // If goal tile is unwalkable, find nearest walkable neighbour
  if (!tileWalkable(gtx, gty)) {
    let found = false;
    for (const [dx, dy] of DIRS8) {
      if (tileWalkable(gtx + dx, gty + dy)) {
        gtx += dx; gty += dy; found = true; break;
      }
    }
    if (!found) return null;
  }

  const par = new Map();
  const startK = stx * 1000 + sty;
  par.set(startK, null);
  const q = [[stx, sty]];
  let found = false;

  outer: while (q.length) {
    const [cx, cy] = q.shift();
    if (cx === gtx && cy === gty) { found = true; break; }
    for (const [dx, dy] of DIRS8) {
      const nx = cx + dx, ny = cy + dy, k = nx * 1000 + ny;
      if (!par.has(k) && tileWalkable(nx, ny)) {
        par.set(k, [cx, cy]);
        q.push([nx, ny]);
        if (nx === gtx && ny === gty) { found = true; break outer; }
      }
    }
  }

  if (!found) return null;

  // Reconstruct waypoints (pixel centres of each tile)
  const pts = [];
  let cur = [gtx, gty];
  while (cur) {
    pts.unshift({ x: cur[0] * TS + TS / 2, y: cur[1] * TS + TS / 2 });
    cur = par.get(cur[0] * 1000 + cur[1]);
  }
  pts.shift(); // remove start position
  return pts;
}

// ── Entity system ──────────────────────────────────────────
let ents  = {};
let idCnt = [0, 0]; // per-player counters (reset on new game)

function mkEnt(player, type, x, y) {
  // x, y = pixel CENTER of entity (for units) or TOP-LEFT (buildings → center calculated on render)
  const d  = DEF[type];
  const id = player * 100000 + idCnt[player]++;
  ents[id] = {
    id, player, type,
    x, y,
    hp: d.hp, maxHp: d.hp,
    // movement
    path: [],
    // combat
    targetId:  null,
    atkTimer:  0,
    state: 'idle',     // idle | moving | attacking
    // building – train queue
    trainQ: [],
    trainTimer: 0,
  };
  return ents[id];
}

function allEnts()           { return Object.values(ents); }
function playerEnts(p)       { return allEnts().filter(e => e.player === p); }
function playerUnits(p)      { return playerEnts(p).filter(e => DEF[e.type].u); }
function playerBuildings(p)  { return playerEnts(p).filter(e => !DEF[e.type].u); }
function getBase(p)          { return playerEnts(p).find(e => e.type === BASE); }
function dist(a, b)          { return Math.hypot(a.x - b.x, a.y - b.y); }

// Centre of an entity (buildings: x,y is centre; units: x,y is centre)
// Buildings are stored with x,y = centre for uniformity
function entCentre(e) { return { x: e.x, y: e.y }; }

// ── Game state ─────────────────────────────────────────────
let myP       = -1;
let myPending = -1;
let running   = false;
let winner    = null;
let gold      = [200, 200];
let goldTimer = 0;
let gameMode  = 'online';
let incomeLvl = [0, 0];
let ecoLoanCd = [0, 0];
let artyCd    = [0, 0];
let tactBoostCd = [0, 0];
let tactBoostTimer = [0, 0];
let tactMercCd = [0, 0];
let tactRepairCd = [0, 0];
let belastingCd = [0, 0];
let plunderCd   = [0, 0];
let aiThinkTimer = 0;
let aiAttackTimer = 0;
let playerProfileId = '';
let playerName = 'Speler';
let playerRating = 1000;
let playerWins = 0;
let playerLosses = 0;
let leaderboardRows = [];
let disconnectTimer = 0;     // Time left for opponent to reconnect (0 = not disconnected)
let disconnectingPlayer = -1; // Which player is disconnected (-1 = none)
let fogEnabled = true;        // Fog of war on/off
let fogTiles = null;          // Set of "tx,ty" strings visible to myP this frame
let rematchRequested = false; // This client requested rematch
let rematchListening = false; // Already listening for rematch
let antiCheatHits = [0, 0];
let cmdWindow = [[], []];

// Camera
let camX = 0, camY = 0;

// Selection
let sel      = new Set();  // selected entity IDs
let selStart = null;       // {sx, sy} screen coords of drag start
let selBox   = null;       // {x,y,w,h} current drag box in screen coords

// Build mode
let buildMode = null;      // null or type string
let wallStartTile = null;  // {tx, ty} first tile for wall placement
let strikeMode = false;

// Visual effects
let fxExplosions = [];

// Input state
const keysDown = {};
let   mouseScreen = { x: 0, y: 0 };
let   mouseWorld  = { x: 0, y: 0 };
let touchStartScreen = null;
let touchLastScreen = null;
let touchMoved = false;

// Message display
let gameMsg  = '';
let msgTimer = 0;

// Canvas refs
let canvas, ctx, miniCanvas, miniCtx;
let lastTimestamp = 0;

// ── Initialise game ────────────────────────────────────────
function initGame(seed, playerIdx) {
  myP     = playerIdx;
  running = true;
  winner  = null;
  gold    = [200, 200];
  goldTimer = 0;
  incomeLvl = [0, 0];
  ecoLoanCd = [0, 0];
  artyCd = [0, 0];
  tactBoostCd = [0, 0];
  tactBoostTimer = [0, 0];
  tactMercCd = [0, 0];
  tactRepairCd = [0, 0];
  belastingCd = [0, 0];
  plunderCd   = [0, 0];
  aiThinkTimer = 0;
  aiAttackTimer = 0;
  gameMsg = '';
  msgTimer = 0;
  lastTimestamp = 0;
  disconnectTimer = 0;
  disconnectingPlayer = -1;
  antiCheatHits = [0, 0];
  cmdWindow = [[], []];
  fogTiles = null;
  rematchRequested = false;
  rematchListening = false;
  ents    = {};
  idCnt   = [0, 0];
  sel.clear();
  buildMode = null;
    wallStartTile = null;
  strikeMode = false;
  fxExplosions = [];

  generateMap(seed);
  spawnStart();
  showMsg(`Biome: ${currentBiomeName}`, 4);

  // Focus camera on own base
  const myBase = getBase(myP);
  if (myBase) {
    camX = myBase.x - canvas.width  / 2;
    camY = myBase.y - canvas.height / 2;
    clampCam();
  }

  document.getElementById('lobby').style.display       = 'none';
  document.getElementById('game-screen').style.display = 'flex';
  resizeCanvas();
  requestAnimationFrame(gameLoop);
}

function spawnStart() {
  // Four possible corner zones (tile coords for the base top-left corner)
  const margin = 4;
  const corners = [
    { x: margin,          y: margin },
    { x: MW - margin - 2, y: margin },
    { x: margin,          y: MH - margin - 2 },
    { x: MW - margin - 2, y: MH - margin - 2 },
  ];

  // Fisher-Yates shuffle with seeded RNG, then take first two
  for (let i = corners.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [corners[i], corners[j]] = [corners[j], corners[i]];
  }
  const c0 = corners[0], c1 = corners[1];

  const b0x = c0.x * TS, b0y = c0.y * TS;
  const b1x = c1.x * TS, b1y = c1.y * TS;

  mkEnt(0, BASE,   b0x, b0y);
  mkEnt(0, WORKER, b0x + 3 * TS, b0y + TS / 2);
  mkEnt(0, WORKER, b0x + 3 * TS, b0y + TS * 1.5);
  mkEnt(0, WORKER, b0x + TS / 2, b0y + 3 * TS);

  mkEnt(1, BASE,   b1x, b1y);
  mkEnt(1, WORKER, b1x - 2 * TS, b1y + TS / 2);
  mkEnt(1, WORKER, b1x - 2 * TS, b1y + TS * 1.5);
  mkEnt(1, WORKER, b1x + TS / 2, b1y - 2 * TS);
}

// ── Game loop ──────────────────────────────────────────────
function gameLoop(ts) {
  const dt = Math.min((ts - lastTimestamp) / 1000, 0.1);
  lastTimestamp = ts;
  update(dt);
  render();
  updateHUD();
  requestAnimationFrame(gameLoop);
}

// ── Update ─────────────────────────────────────────────────
function update(dt) {
  if (!running) return;

  // ─ Gold income (passive + workers + markets)
  goldTimer += dt;
  if (goldTimer >= 1) {
    goldTimer -= 1;
    for (let p = 0; p < 2; p++) {
      const wc = playerUnits(p).filter(e => e.type === WORKER).length;
      const mc = playerBuildings(p).filter(e => e.type === MARKET).length;
      gold[p] += 2 + Math.min(wc, 5) + incomeLvl[p] * 2 + mc * DEF[MARKET].income;
    }
  }

  for (let p = 0; p < 2; p++) {
    ecoLoanCd[p] = Math.max(0, ecoLoanCd[p] - dt);
    artyCd[p] = Math.max(0, artyCd[p] - dt);
    tactBoostCd[p] = Math.max(0, tactBoostCd[p] - dt);
    tactBoostTimer[p] = Math.max(0, tactBoostTimer[p] - dt);
    tactMercCd[p] = Math.max(0, tactMercCd[p] - dt);
    tactRepairCd[p] = Math.max(0, tactRepairCd[p] - dt);
    belastingCd[p] = Math.max(0, belastingCd[p] - dt);
    plunderCd[p]   = Math.max(0, plunderCd[p]   - dt);
  }

  fxExplosions = fxExplosions
    .map(fx => ({ ...fx, t: fx.t - dt }))
    .filter(fx => fx.t > 0);

  // ─ Camera scroll via keyboard
  if (keysDown['ArrowLeft']  || keysDown['a']) camX -= CAM_SPD * dt;
  if (keysDown['ArrowRight'] || keysDown['d']) camX += CAM_SPD * dt;
  if (keysDown['ArrowUp']    || keysDown['w']) camY -= CAM_SPD * dt;
  if (keysDown['ArrowDown']  || keysDown['s']) camY += CAM_SPD * dt;
  clampCam();

  // ─ Entity update
  const snapshot = allEnts(); // copy – entities may be deleted during loop
  for (const e of snapshot) {
    if (!ents[e.id]) continue; // already removed
    const d = DEF[e.type];
    const spdMul = tactBoostTimer[e.player] > 0 ? 1.35 : 1;
    const atkMul = tactBoostTimer[e.player] > 0 ? 1.35 : 1;

    // Cooldown
    e.atkTimer = Math.max(0, e.atkTimer - dt * atkMul);

    // ── Buildings: train queue
    if (!d.u) {
      if (d.auto && e.atkTimer === 0) {
        // Tower auto-attack
        const enemies = playerEnts(1 - e.player).filter(ex => dist(e, ex) <= d.rng);
        if (enemies.length) {
          const tgt = enemies.reduce((a, b) => dist(e, a) <= dist(e, b) ? a : b);
          dealDamage(tgt, d.dmg, e.id);
          e.atkTimer = d.cd;
        }
      }
      if (e.trainQ.length > 0) {
        e.trainTimer -= dt;
        if (e.trainTimer <= 0) {
          const utype = e.trainQ.shift();
          // Spawn unit next to building (right side)
          const bd = DEF[e.type];
          spawnUnit(e.player, utype, e.x + bd.fw * TS, e.y);
          e.trainTimer = e.trainQ.length > 0 ? DEF[e.trainQ[0]].tm : 0;
        }
      }
      continue;
    }

    // ── Units: movement
    if (e.path.length > 0) {
      const wp  = e.path[0];
      const dx  = wp.x - e.x, dy = wp.y - e.y, dd = Math.hypot(dx, dy);
      if (dd < 3) { e.x = wp.x; e.y = wp.y; e.path.shift(); }
      else { const s = d.spd * spdMul * dt / dd; e.x += dx * s; e.y += dy * s; }

      if (e.path.length === 0) {
        e.state = 'idle';
        // If chasing an attack target, re-check range
        if (e.targetId !== null && ents[e.targetId]) {
          const tgt = ents[e.targetId];
          if (dist(e, tgt) <= d.rng) e.state = 'attacking';
          else { const p2 = findPath(e.x, e.y, tgt.x, tgt.y); if (p2) { e.path = p2; e.state = 'moving'; } }
        }
      }
    }

    // ── Units: attack
    if (e.state === 'attacking') {
      const tgt = ents[e.targetId];
      if (!tgt) { e.state = 'idle'; e.targetId = null; continue; }
      const dd = dist(e, tgt);
      if (dd > d.rng) {
        // Chase
        const p2 = findPath(e.x, e.y, tgt.x, tgt.y);
        if (p2) { e.path = p2; e.state = 'moving'; }
        else    { e.state = 'idle'; }
      } else {
        if (e.atkTimer === 0) { dealDamage(tgt, d.dmg, e.id); e.atkTimer = d.cd; }
      }
    }

    // ── Units: idle auto-guard (attack enemies in range)
    if (e.state === 'idle' && e.targetId === null) {
      const enemies = playerEnts(1 - e.player).filter(ex => dist(e, ex) <= d.rng * 1.8);
      if (enemies.length) {
        const nearest = enemies.reduce((a, b) => dist(e, a) <= dist(e, b) ? a : b);
        e.targetId = nearest.id;
        e.state = 'attacking';
      }
    }
  }

  // ─ Win condition
  if (!getBase(0)) finalizeGame(1);
  if (!getBase(1)) finalizeGame(0);

  if (gameMode === 'ai' && running) {
    updateAI(dt);
  }

  // ─ Disconnect timeout: if opponent doesn't reconnect in 10s, auto-lose
  if (running && gameMode === 'online' && disconnectTimer > 0) {
    disconnectTimer -= dt;
    if (disconnectTimer <= 0) {
      // Opponent did not reconnect, they lose
      const loser = disconnectingPlayer;
      const winner = loser === 0 ? 1 : 0;
      finalizeGame(winner);
      showMsg(`Tegenstander niet terugverbonden. Jij wint!`, 8);
    }
  }

  // ─ 

  // ─ Message timer
  if (msgTimer > 0) msgTimer -= dt;
}

function clampCam() {
  const maxX = MW * TS - canvas.width;
  const maxY = MH * TS - canvas.height;
  camX = Math.max(0, Math.min(camX, Math.max(0, maxX)));
  camY = Math.max(0, Math.min(camY, Math.max(0, maxY)));
}

function dealDamage(target, dmg, sourceId) {
  // Apply counter-type bonus damage
  if (sourceId !== null && ents[sourceId]) {
    const srcType = ents[sourceId].type;
    const bonuses = COUNTER_BONUS[srcType];
    if (bonuses && bonuses[target.type]) dmg = Math.round(dmg * bonuses[target.type]);
  }
  target.hp -= dmg;
  if (target.hp <= 0) {
    // Clear references
    for (const e of allEnts()) if (e.targetId === target.id) { e.targetId = null; e.state = 'idle'; }
    sel.delete(target.id);
    delete ents[target.id];
  }
}

function spawnUnit(player, type, bx, by) {
  // Find a walkable tile near (bx, by)
  const tx = (bx / TS) | 0, ty = (by / TS) | 0;
  for (let r = 0; r <= 4; r++) {
    for (const [dx, dy] of DIRS8) {
      const nx = tx + dx * (r + 1), ny = ty + dy * (r + 1);
      if (tileWalkable(nx, ny) && !unitAtTile(nx, ny)) {
        mkEnt(player, type, nx * TS + TS / 2, ny * TS + TS / 2);
        return;
      }
    }
  }
  // Fallback: just spawn at bx, by
  mkEnt(player, type, bx + TS / 2, by + TS / 2);
}

function unitAtTile(tx, ty) {
  return allEnts().some(e => DEF[e.type].u && (e.x / TS | 0) === tx && (e.y / TS | 0) === ty);
}

// ── Commands ───────────────────────────────────────────────
// Commands are executed locally AND sent to opponent via server.
// Both clients run the same deterministic simulation.

function inferCmdPlayer(cmd) {
  if (cmd && Number.isInteger(cmd.player) && (cmd.player === 0 || cmd.player === 1)) return cmd.player;
  if (cmd && Array.isArray(cmd.ids) && cmd.ids.length > 0) {
    const ent = ents[cmd.ids[0]];
    if (ent) return ent.player;
  }
  return -1;
}

function validateCommand(cmd, issuerPlayer) {
  if (!cmd || typeof cmd !== 'object' || typeof cmd.type !== 'string') return false;

  const inWorld = (x, y) => Number.isFinite(x) && Number.isFinite(y) && x >= 0 && x <= MW * TS && y >= 0 && y <= MH * TS;
  const validPlayer = issuerPlayer === 0 || issuerPlayer === 1;
  if (!validPlayer) return false;

  switch (cmd.type) {
    case 'MOVE': {
      if (!Array.isArray(cmd.ids) || cmd.ids.length < 1 || cmd.ids.length > 80) return false;
      if (!inWorld(cmd.wx, cmd.wy)) return false;
      return cmd.ids.every(id => ents[id] && DEF[ents[id].type].u && ents[id].player === issuerPlayer);
    }
    case 'ATTACK': {
      if (!Array.isArray(cmd.ids) || cmd.ids.length < 1 || cmd.ids.length > 80) return false;
      if (!ents[cmd.tid]) return false;
      return cmd.ids.every(id => ents[id] && DEF[ents[id].type].u && ents[id].player === issuerPlayer);
    }
    case 'BUILD': {
      if (cmd.player !== issuerPlayer) return false;
      if (![BARRACKS, TOWER, MARKET, WALL].includes(cmd.btype)) return false;
      if (Array.isArray(cmd.tiles)) {
        if (cmd.tiles.length < 1 || cmd.tiles.length > 4) return false;
        return cmd.tiles.every(t => Number.isInteger(t.tx) && Number.isInteger(t.ty) && t.tx >= 0 && t.tx < MW && t.ty >= 0 && t.ty < MH);
      }
      return Number.isInteger(cmd.tx) && Number.isInteger(cmd.ty) && cmd.tx >= 0 && cmd.tx < MW && cmd.ty >= 0 && cmd.ty < MH;
    }
    case 'TRAIN': {
      if (cmd.player !== issuerPlayer) return false;
      if (!ents[cmd.bid] || ents[cmd.bid].player !== issuerPlayer) return false;
      return !!DEF[cmd.utype] && DEF[cmd.utype].u === 1;
    }
    case 'ARTY':
      return cmd.player === issuerPlayer && inWorld(cmd.x, cmd.y);
    case 'ECO_LOAN':
    case 'ECO_UPGRADE':
    case 'TACTIC_BOOST':
    case 'TACTIC_MERCS':
    case 'TACTIC_REPAIR':
    case 'BELASTING':
    case 'PLUNDER':
      return cmd.player === issuerPlayer;
    default:
      return false;
  }
}

function flagCheat(player, reason) {
  if (player !== 0 && player !== 1) return;
  antiCheatHits[player] += 1;
  if (gameMode === 'online') {
    showMsg(`Anti-cheat: ${P_NAME[player]} (${reason})`, 6);
  }
  if (antiCheatHits[player] >= 2 && running && gameMode === 'online') {
    finalizeGame(player === 0 ? 1 : 0);
  }
}

function execCmd(cmd) {
  switch (cmd.type) {

    case 'MOVE': {
      for (const id of cmd.ids) {
        const e = ents[id];
        if (!e || !DEF[e.type].u) continue;
        const p = findPath(e.x, e.y, cmd.wx, cmd.wy);
        e.path     = p || [];
        e.targetId = null;
        e.state    = e.path.length ? 'moving' : 'idle';
      }
      break;
    }

    case 'ATTACK': {
      for (const id of cmd.ids) {
        const e = ents[id];
        if (!e || !DEF[e.type].u) continue;
        const tgt = ents[cmd.tid];
        if (!tgt) continue;
        e.targetId = cmd.tid;
        if (dist(e, tgt) > DEF[e.type].rng) {
          const p = findPath(e.x, e.y, tgt.x, tgt.y);
          if (p) { e.path = p; e.state = 'moving'; }
        } else {
          e.state = 'attacking';
        }
      }
      break;
    }

    case 'BUILD': {
        const { player, btype, tx, ty, tiles } = cmd;
      const d = DEF[btype];
      if (gold[player] < d.cost) { if (player === myP) showMsg('Onvoldoende goud!'); return; }
        const buildTiles = Array.isArray(tiles) && tiles.length > 0 ? tiles : [{ tx, ty }];
        for (const tile of buildTiles) {
          if (!areaWalkable(tile.tx, tile.ty, d.fw, d.fh) || bldgAtArea(tile.tx, tile.ty, d.fw, d.fh)) {
            if (player === myP) showMsg('Kan hier niet bouwen!');
            return;
          }
        }
      gold[player] -= d.cost;
        for (const tile of buildTiles) {
          mkEnt(player, btype, tile.tx * TS + d.fw * TS / 2, tile.ty * TS + d.fh * TS / 2);
        }
      break;
    }

    case 'TRAIN': {
      const { player, bid, utype } = cmd;
      const e = ents[bid];
      if (!e) return;
      const d = DEF[utype];
      if (gold[player] < d.cost)                         { if (player === myP) showMsg('Onvoldoende goud!'); return; }
      if (playerUnits(player).length >= POP_MAX)         { if (player === myP) showMsg('Populatielimiet bereikt!'); return; }
      if (!DEF[e.type].u && !d.ta.includes(e.type))      { return; }
      gold[player] -= d.cost;
      e.trainQ.push(utype);
      if (e.trainQ.length === 1) e.trainTimer = d.tm;
      break;
    }

    case 'ECO_LOAN': {
      const { player } = cmd;
      if (ecoLoanCd[player] > 0) {
        if (player === myP) showMsg(`Noodlening nog ${Math.ceil(ecoLoanCd[player])}s cooldown.`);
        return;
      }
      gold[player] += 85;
      ecoLoanCd[player] = 45;
      if (player === myP) showMsg('Noodlening geactiveerd: +85 goud');
      break;
    }

    case 'ECO_UPGRADE': {
      const { player } = cmd;
      const lvl = incomeLvl[player];
      const cost = 120 + lvl * 80;
      if (lvl >= 5) {
        if (player === myP) showMsg('Mijnbouw is al op max niveau.');
        return;
      }
      if (gold[player] < cost) {
        if (player === myP) showMsg('Onvoldoende goud voor mijnbouw-upgrade.');
        return;
      }
      gold[player] -= cost;
      incomeLvl[player] += 1;
      if (player === myP) showMsg(`Mijnbouw niveau ${incomeLvl[player]} bereikt.`);
      break;
    }

    case 'ARTY': {
      const { player, x, y } = cmd;
      const cost = 200;
      const cooldown = 35;
      const radius = 95;
      if (gold[player] < cost) {
        if (player === myP) showMsg('Onvoldoende goud voor artillerie.');
        return;
      }
      if (artyCd[player] > 0) {
        if (player === myP) showMsg(`Artillerie nog ${Math.ceil(artyCd[player])}s cooldown.`);
        return;
      }

      gold[player] -= cost;
      artyCd[player] = cooldown;
      fxExplosions.push({ x, y, r: radius, t: 0.6 });

      const enemies = playerEnts(1 - player);
      for (const e of enemies) {
        if (Math.hypot(e.x - x, e.y - y) > radius) continue;
        const damage = DEF[e.type].u ? 80 : 120;
        dealDamage(e, damage, null);
      }

      if (player === myP) showMsg('Artillerieaanval uitgevoerd!');
      break;
    }

    case 'TACTIC_BOOST': {
      const { player } = cmd;
      const cost = 110;
      const cooldown = 40;
      if (gold[player] < cost) {
        if (player === myP) showMsg('Onvoldoende goud voor Gevechtsboost.');
        return;
      }
      if (tactBoostCd[player] > 0) {
        if (player === myP) showMsg(`Gevechtsboost nog ${Math.ceil(tactBoostCd[player])}s cooldown.`);
        return;
      }
      gold[player] -= cost;
      tactBoostCd[player] = cooldown;
      tactBoostTimer[player] = 15;
      if (player === myP) showMsg('Gevechtsboost actief: +35% speed/attack (15s)');
      break;
    }

    case 'TACTIC_MERCS': {
      const { player } = cmd;
      const cost = 170;
      const cooldown = 50;
      if (gold[player] < cost) {
        if (player === myP) showMsg('Onvoldoende goud voor huurlingen.');
        return;
      }
      if (tactMercCd[player] > 0) {
        if (player === myP) showMsg(`Huurlingen nog ${Math.ceil(tactMercCd[player])}s cooldown.`);
        return;
      }
      if (playerUnits(player).length + 2 > POP_MAX) {
        if (player === myP) showMsg('Niet genoeg populatieruimte voor huurlingen.');
        return;
      }
      const base = getBase(player);
      if (!base) return;
      gold[player] -= cost;
      tactMercCd[player] = cooldown;
      spawnUnit(player, SOLDIER, base.x + TS, base.y + TS);
      spawnUnit(player, SOLDIER, base.x - TS, base.y - TS);
      if (player === myP) showMsg('Huurlingen aangekomen: 2 soldaten');
      break;
    }

    case 'TACTIC_REPAIR': {
      const { player } = cmd;
      const cost = 140;
      const cooldown = 45;
      if (gold[player] < cost) {
        if (player === myP) showMsg('Onvoldoende goud voor reparatieveld.');
        return;
      }
      if (tactRepairCd[player] > 0) {
        if (player === myP) showMsg(`Reparatieveld nog ${Math.ceil(tactRepairCd[player])}s cooldown.`);
        return;
      }
      gold[player] -= cost;
      tactRepairCd[player] = cooldown;
      for (const b of playerBuildings(player)) {
        b.hp = Math.min(b.maxHp, b.hp + 110);
      }
      if (player === myP) showMsg('Reparatieveld geactiveerd: gebouwen hersteld');
      break;
    }

    case 'BELASTING': {
      const { player } = cmd;
      if (belastingCd[player] > 0) {
        if (player === myP) showMsg(`Belasting nog ${Math.ceil(belastingCd[player])}s cooldown.`);
        return;
      }
      const bldgs = playerBuildings(player).length;
      const earned = bldgs * 18;
      gold[player] += earned;
      belastingCd[player] = 30;
      if (player === myP) showMsg(`Belasting geïnd: +${earned} goud (${bldgs} gebouwen)`);
      break;
    }

    case 'PLUNDER': {
      const { player } = cmd;
      if (plunderCd[player] > 0) {
        if (player === myP) showMsg(`Plunderen nog ${Math.ceil(plunderCd[player])}s cooldown.`);
        return;
      }
      const enemy = 1 - player;
      const enemyBase = getBase(enemy);
      if (!enemyBase) return;
      const nearUnits = playerUnits(player).filter(u => dist(u, enemyBase) < 6 * TS);
      if (nearUnits.length === 0) {
        if (player === myP) showMsg('Units moeten dicht bij de vijandelijke basis zijn om te plunderen.');
        return;
      }
      const stolen = Math.min(Math.floor(gold[enemy] * 0.2 + nearUnits.length * 15), 200);
      gold[player] += stolen;
      gold[enemy]  = Math.max(0, gold[enemy] - stolen);
      plunderCd[player] = 50;
      if (player === myP) showMsg(`Geplunderd: +${stolen} goud gestolen van de vijand!`);
      break;
    }
  }
}

function sendCmd(cmd) {
  const issuer = inferCmdPlayer(cmd) !== -1 ? inferCmdPlayer(cmd) : myP;
  if (!validateCommand(cmd, issuer)) {
    if (issuer === myP) showMsg('Actie geblokkeerd door anti-cheat validatie.', 3);
    return;
  }
  execCmd(cmd);
  if (gameMode === 'online' && net && net.connected) {
    net.emit('cmd', cmd);
  }
}

function updateAI(dt) {
  const aiP = 1;
  if (myP === aiP) return;

  aiThinkTimer -= dt;
  aiAttackTimer -= dt;
  if (aiThinkTimer > 0) return;
  aiThinkTimer = 2.5;                          // denkt trager

  const aiBase = getBase(aiP);
  const myBase = getBase(myP);
  if (!aiBase || !myBase) return;

  const aiWorkers = playerUnits(aiP).filter(e => e.type === WORKER);
  const aiBarracks = playerBuildings(aiP).filter(e => e.type === BARRACKS);
  const aiUnits = playerUnits(aiP).filter(e => e.type !== WORKER);

  // Geen noodlening — AI spaart langzamer
  // ECO_UPGRADE: maximaal lvl 1
  const aiIncomeCost = 120 + incomeLvl[aiP] * 80;
  if (incomeLvl[aiP] < 1 && gold[aiP] >= aiIncomeCost + 100) {
    execCmd({ type: 'ECO_UPGRADE', player: aiP });
  }

  // Max 2 workers in plaats van 4
  if (aiWorkers.length < 2 && gold[aiP] >= DEF[WORKER].cost) {
    const aiBaseBuild = playerBuildings(aiP).find(e => e.type === BASE);
    if (aiBaseBuild && aiBaseBuild.trainQ.length < 1) {
      execCmd({ type: 'TRAIN', player: aiP, bid: aiBaseBuild.id, utype: WORKER });
    }
  }

  // Bouwt pas kazerne als er al voldoende goud over is
  if (aiBarracks.length === 0 && gold[aiP] >= DEF[BARRACKS].cost + 80) {
    const spot = findBuildSpot(aiP, BARRACKS);
    if (spot) {
      execCmd({ type: 'BUILD', player: aiP, btype: BARRACKS, tx: spot.tx, ty: spot.ty });
    }
  }

  // Geen TACTIC_REPAIR, TACTIC_MERCS of TACTIC_BOOST — AI gebruikt geen tactieken

  // Traint mix van units, beperkt tot 8 units
  if (aiBarracks.length > 0 && playerUnits(aiP).length < 8) {
    const targetBarracks = aiBarracks[0];
    const trainPool = [
      { utype: SOLDIER,  cost: DEF[SOLDIER].cost },
      { utype: ARCHER,   cost: DEF[ARCHER].cost },
      { utype: CAVALRY,  cost: DEF[CAVALRY].cost },
      { utype: SPEARMAN, cost: DEF[SPEARMAN].cost },
    ];
    const affordable = trainPool.filter(u => gold[aiP] >= u.cost + 40);
    if (affordable.length > 0) {
      const pick = affordable[Math.floor(Math.random() * affordable.length)];
      execCmd({ type: 'TRAIN', player: aiP, bid: targetBarracks.id, utype: pick.utype });
    }
  }

  // Geen artillerie

  // Valt pas aan met 6+ units, en wacht 15 seconden tussen aanvallen
  if (aiAttackTimer <= 0) {
    aiAttackTimer = 15.0;
    const attackers = playerUnits(aiP).filter(e => e.type !== WORKER).map(e => e.id);
    if (attackers.length >= 6) {
      execCmd({ type: 'ATTACK', ids: attackers, tid: myBase.id });
    }
  }
}

function findBuildSpot(player, btype) {
  const base = getBase(player);
  if (!base) return null;

  const d = DEF[btype];
  const cx = (base.x / TS) | 0;
  const cy = (base.y / TS) | 0;

  for (let r = 3; r <= 12; r++) {
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        if (Math.abs(dx) !== r && Math.abs(dy) !== r) continue;
        const tx = cx + dx;
        const ty = cy + dy;
        if (!areaWalkable(tx, ty, d.fw, d.fh)) continue;
        if (bldgAtArea(tx, ty, d.fw, d.fh)) continue;
        return { tx, ty };
      }
    }
  }
  return null;
}

function showMsg(msg, dur = 3) { gameMsg = msg; msgTimer = dur; }

// Vision radius per type (in tiles)
const VISION_R = {
  [WORKER]: 5, [SOLDIER]: 6, [ARCHER]: 7, [CAVALRY]: 7, [SPEARMAN]: 5, [SIEGE]: 5,
  [BASE]: 8, [BARRACKS]: 5, [TOWER]: 7, [MARKET]: 4, [WALL]: 3,
};

function computeFog(p) {
  if (!fogEnabled || !running || myP === -1) return null;
  const visible = new Set();
  for (const e of playerEnts(p)) {
    const r = VISION_R[e.type] || 5;
    const cx = (e.x / TS) | 0;
    const cy = (e.y / TS) | 0;
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        if (dx * dx + dy * dy > r * r) continue;
        const tx = cx + dx, ty = cy + dy;
        if (tx >= 0 && tx < MW && ty >= 0 && ty < MH) visible.add(`${tx},${ty}`);
      }
    }
  }
  return visible;
}

function tileVisible(tx, ty) {
  return !fogTiles || fogTiles.has(`${tx},${ty}`);
}

function entVisible(e) {
  if (!fogTiles || e.player === myP) return true;
  const tx = (e.x / TS) | 0, ty = (e.y / TS) | 0;
  return fogTiles.has(`${tx},${ty}`);
}

function returnToLobby() {
  cleanupFirebaseRealtime(true);
  if (net && net.disconnect) net.disconnect();
  gameMode = 'offline';
  running = false;
  winner = null;
  sel.clear();
  buildMode = null;
  wallStartTile = null;
  strikeMode = false;
  rematchRequested = false;
  rematchListening = false;
  document.getElementById('game-screen').style.display = 'none';
  document.getElementById('lobby').style.display = 'flex';
  document.getElementById('room-info').style.display = 'none';
  document.getElementById('room-code-input').value = '';
  loadMyRatingFromFirebase();
  subscribeLeaderboard();
}

function requestRematch() {
  if (gameMode !== 'online' || !firebaseDb || !firebaseRoomRef) return;
  rematchRequested = true;
  firebaseRoomRef.child(`rematch/${firebaseClientId}`).set(firebase.database.ServerValue.TIMESTAMP);
  showMsg('Rematch gevraagd – wachten op tegenstander…', 60);
}

function listenForRematch() {
  if (rematchListening || !firebaseRoomRef) return;
  rematchListening = true;
  firebaseRoomRef.child('rematch').on('value', snap => {
    if (running || winner === null) return; // game still going
    const votes = Object.keys(snap.val() || {});
    if (votes.length >= 2) {
      // Both players ready – start new game in same room
      firebaseRoomRef.child('rematch').remove();
      matchResultSubmitted = false;
      rematchRequested = false;
      rematchListening = false;
      const newSeed = (((Date.now() ^ (Math.random() * 1e6)) >>> 0) || 1337);
      firebaseRoomRef.child('seed').set(newSeed).then(() => {
        initGame(newSeed, myPending !== undefined ? myPending : myP);
      });
    }
  });
}

function sanitizePlayerName(raw) {
  const clean = (raw || '').replace(/[^A-Za-z0-9 _\-]/g, '').trim();
  return clean.slice(0, 16) || 'Speler';
}

function ensureLocalProfile() {
  try {
    let pid = localStorage.getItem('wg_profile_id') || '';
    if (!pid) {
      pid = `p_${Date.now().toString(36)}_${((Math.random() * 1e8) | 0).toString(36)}`;
      localStorage.setItem('wg_profile_id', pid);
    }
    playerProfileId = pid;

    const storedName = sanitizePlayerName(localStorage.getItem('wg_player_name') || '');
    playerName = storedName;
  } catch (_err) {
    playerProfileId = `p_${Date.now().toString(36)}_${((Math.random() * 1e8) | 0).toString(36)}`;
    playerName = 'Speler';
  }

  const nameInput = document.getElementById('player-name');
  if (nameInput) {
    nameInput.value = playerName;
    nameInput.addEventListener('input', () => {
      nameInput.value = sanitizePlayerName(nameInput.value);
    });
    const saveName = () => {
      playerName = sanitizePlayerName(nameInput.value);
      nameInput.value = playerName;
      try { localStorage.setItem('wg_player_name', playerName); } catch (_err) {}
      updateMyRatingBadge();
    };
    nameInput.addEventListener('blur', saveName);
    nameInput.addEventListener('keydown', (e) => {
      if (e.key !== 'Enter') return;
      e.preventDefault();
      saveName();
    });
  }

  updateMyRatingBadge();
}

function updateMyRatingBadge() {
  const badge = document.getElementById('my-rating');
  if (!badge) return;
  badge.textContent = `${playerName} - Rating: ${playerRating} (W${playerWins}-L${playerLosses})`;
}

function renderLeaderboard() {
  const list = document.getElementById('leaderboard-list');
  if (!list) return;
  list.innerHTML = '';
  const rows = leaderboardRows.slice(0, 10);
  if (!rows.length) {
    const li = document.createElement('li');
    li.textContent = 'Nog geen ranked matches';
    list.appendChild(li);
    return;
  }
  rows.forEach((row, i) => {
    const li = document.createElement('li');
    const nm = sanitizePlayerName(row.name || 'Speler');
    const rt = Number.isFinite(row.rating) ? Math.round(row.rating) : 1000;
    const w = Number.isFinite(row.wins) ? row.wins : 0;
    const l = Number.isFinite(row.losses) ? row.losses : 0;
    li.textContent = `${i + 1}. ${nm} - ${rt} (${w}-${l})`;
    list.appendChild(li);
  });
}

function calcEloDelta(rA, rB, scoreA, k = 24) {
  const expectA = 1 / (1 + Math.pow(10, (rB - rA) / 400));
  return Math.round(k * (scoreA - expectA));
}

function finalizeGame(winnerIdx) {
  if (!running) return;
  winner = winnerIdx;
  running = false;
  submitOnlineMatchResult();
}

function loadMyRatingFromFirebase() {
  if (!firebaseDb || !playerProfileId) return;
  const myRef = firebaseDb.ref(`rooms/_global/ratings/${playerProfileId}`);
  myRef.once('value').then((snap) => {
    const cur = snap.val();
    if (!cur) {
      myRef.set({
        name: playerName,
        rating: 1000,
        wins: 0,
        losses: 0,
        updatedAt: firebase.database.ServerValue.TIMESTAMP,
      });
      playerRating = 1000;
      playerWins = 0;
      playerLosses = 0;
      updateMyRatingBadge();
      return;
    }
    playerRating = Number.isFinite(cur.rating) ? Math.round(cur.rating) : 1000;
    playerWins = Number.isFinite(cur.wins) ? cur.wins : 0;
    playerLosses = Number.isFinite(cur.losses) ? cur.losses : 0;
    updateMyRatingBadge();
  }).catch(() => {});
}

function subscribeLeaderboard() {
  if (!firebaseDb) return;
  const lbRef = firebaseDb.ref('rooms/_global/ratings').orderByChild('rating').limitToLast(10);
  lbRef.on('value', (snap) => {
    const rows = [];
    snap.forEach((child) => {
      const row = child.val() || {};
      rows.push({
        pid: child.key,
        name: sanitizePlayerName(row.name || 'Speler'),
        rating: Number.isFinite(row.rating) ? Math.round(row.rating) : 1000,
        wins: Number.isFinite(row.wins) ? row.wins : 0,
        losses: Number.isFinite(row.losses) ? row.losses : 0,
      });
    });
    rows.sort((a, b) => b.rating - a.rating);
    leaderboardRows = rows;
    renderLeaderboard();
  });
}

function submitOnlineMatchResult() {
  if (gameMode !== 'online' || !firebaseDb || !firebaseRoomRef || !firebaseRoomId) return;
  if (matchResultSubmitted || winner === null) return;

  // Use cached room players if available, otherwise fetch from Firebase
  let p0, p1;
  
  if (Array.isArray(firebaseRoomPlayers) && firebaseRoomPlayers.length >= 2) {
    p0 = firebaseRoomPlayers[0];
    p1 = firebaseRoomPlayers[1];
  } else {
    // Fallback: try to get the 2 most recent joiners from Firebase
    firebaseDb.ref(`rooms/${firebaseRoomId}/players`).once('value').then((snap) => {
      const players = snap.val() || {};
      const ids = Object.keys(players)
        .sort((a, b) => (players[a].joinedAt || 0) - (players[b].joinedAt || 0));
      
      if (ids.length < 2) return;
      
      const p0Data = players[ids[0]];
      const p1Data = players[ids[1]];
      
      if (!p0Data || !p1Data || !p0Data.pid || !p1Data.pid) return;
      
      // Now call the actual submission with these players
      submitRankedResult({
        pid: p0Data.pid,
        name: sanitizePlayerName(p0Data.name || 'Speler'),
      }, {
        pid: p1Data.pid,
        name: sanitizePlayerName(p1Data.name || 'Speler'),
      }, winner);
    }).catch(() => {});
    
    return;
  }
  
  if (!p0 || !p1 || !p0.pid || !p1.pid) return;

  const winnerPlayer = winner === 0 ? p0 : p1;
  const loserPlayer = winner === 0 ? p1 : p0;
  submitRankedResult(winnerPlayer, loserPlayer, winner);
}

function submitRankedResult(winnerPlayer, loserPlayer, winnerIdx) {
  if (matchResultSubmitted) return;
  matchResultSubmitted = true;
  
  const resultRef = firebaseRoomRef.child('result');
  resultRef.transaction((cur) => {
    if (cur) return cur;
    return {
      winnerPid: winnerPlayer.pid,
      loserPid: loserPlayer.pid,
      winnerName: winnerPlayer.name || 'Speler',
      loserName: loserPlayer.name || 'Speler',
      createdAt: Date.now(),
    };
  }, (err, committed) => {
    if (err || !committed) {
      matchResultSubmitted = false;
      return;
    }

    const ratingsRef = firebaseDb.ref('rooms/_global/ratings');
    Promise.all([
      ratingsRef.child(winnerPlayer.pid).once('value'),
      ratingsRef.child(loserPlayer.pid).once('value'),
    ]).then(([wSnap, lSnap]) => {
      const wCur = wSnap.val() || {};
      const lCur = lSnap.val() || {};
      const wRating = Number.isFinite(wCur.rating) ? Math.round(wCur.rating) : 1000;
      const lRating = Number.isFinite(lCur.rating) ? Math.round(lCur.rating) : 1000;
      const wDelta = calcEloDelta(wRating, lRating, 1);
      const lDelta = -wDelta;

      const updates = {};
      updates[`rooms/_global/ratings/${winnerPlayer.pid}`] = {
        name: sanitizePlayerName(winnerPlayer.name || wCur.name || 'Speler'),
        rating: wRating + wDelta,
        wins: (Number.isFinite(wCur.wins) ? wCur.wins : 0) + 1,
        losses: Number.isFinite(wCur.losses) ? wCur.losses : 0,
        updatedAt: firebase.database.ServerValue.TIMESTAMP,
      };
      updates[`rooms/_global/ratings/${loserPlayer.pid}`] = {
        name: sanitizePlayerName(loserPlayer.name || lCur.name || 'Speler'),
        rating: Math.max(100, lRating + lDelta),
        wins: Number.isFinite(lCur.wins) ? lCur.wins : 0,
        losses: (Number.isFinite(lCur.losses) ? lCur.losses : 0) + 1,
        updatedAt: firebase.database.ServerValue.TIMESTAMP,
      };
      return firebaseDb.ref().update(updates).then(() => ({ wDelta, lDelta }));
    }).then((deltaObj) => {
      if (!deltaObj) return;
      const myPid = playerProfileId;
      if (myPid === winnerPlayer.pid) {
        playerRating += deltaObj.wDelta;
        playerWins += 1;
        showMsg(`Ranked: +${deltaObj.wDelta} rating`, 8);
      } else if (myPid === loserPlayer.pid) {
        playerRating = Math.max(100, playerRating + deltaObj.lDelta);
        playerLosses += 1;
        showMsg(`Ranked: ${deltaObj.lDelta} rating`, 8);
      }
      updateMyRatingBadge();
    }).catch(() => {
      matchResultSubmitted = false;
    });
  }, false);
}

// ── Rendering ──────────────────────────────────────────────
function render() {
  const W = canvas.width, H = canvas.height;
  ctx.clearRect(0, 0, W, H);
  ctx.fillStyle = '#1a1a2e';
  ctx.fillRect(0, 0, W, H);

  // Recompute fog every frame
  fogTiles = computeFog(myP);

  // ─ Tiles
  const tx0 = Math.max(0, (camX / TS) | 0);
  const ty0 = Math.max(0, (camY / TS) | 0);
  const tx1 = Math.min(MW, tx0 + Math.ceil(W  / TS) + 2);
  const ty1 = Math.min(MH, ty0 + Math.ceil(H / TS) + 2);

  for (let ty = ty0; ty < ty1; ty++) {
    for (let tx = tx0; tx < tx1; tx++) {
      const t  = mapTiles[ty][tx];
      const sx = tx * TS - camX, sy = ty * TS - camY;
      ctx.fillStyle = TILE_COLOR[t];
      ctx.fillRect(sx, sy, TS, TS);
      // Subtle grid
      ctx.strokeStyle = 'rgba(0,0,0,0.18)';
      ctx.lineWidth = 0.5;
      ctx.strokeRect(sx, sy, TS, TS);
    }
  }

  // ─ Fog of war overlay
  if (fogTiles && running) {
    ctx.fillStyle = 'rgba(0,0,0,0.68)';
    for (let ty = ty0; ty < ty1; ty++) {
      for (let tx = tx0; tx < tx1; tx++) {
        if (!fogTiles.has(`${tx},${ty}`)) {
          ctx.fillRect(tx * TS - camX, ty * TS - camY, TS, TS);
        }
      }
    }
  }

  // ─ Build mode preview
  if (buildMode) {
    const d   = DEF[buildMode];
    const tx  = (mouseWorld.x / TS) | 0;
    const ty  = (mouseWorld.y / TS) | 0;
      let previewTiles = [{ tx, ty }];
      let ok  = areaWalkable(tx, ty, d.fw, d.fh) && !bldgAtArea(tx, ty, d.fw, d.fh);
      if (buildMode === WALL && wallStartTile) {
        const plan = getWallBuildTiles(wallStartTile.tx, wallStartTile.ty, tx, ty);
        if (plan.tiles) previewTiles = plan.tiles;
        ok = !!plan.tiles && canBuildWallTiles(plan.tiles);
      }
    ctx.fillStyle   = ok ? 'rgba(0,255,80,0.25)' : 'rgba(255,30,30,0.25)';
    ctx.strokeStyle = ok ? '#00ff50' : '#ff2020';
    ctx.lineWidth   = 2;
      for (const tile of previewTiles) {
        ctx.fillRect(tile.tx * TS - camX, tile.ty * TS - camY, d.fw * TS, d.fh * TS);
        ctx.strokeRect(tile.tx * TS - camX, tile.ty * TS - camY, d.fw * TS, d.fh * TS);
      }
  }

  if (strikeMode) {
    const radius = 95;
    ctx.strokeStyle = 'rgba(255,180,40,0.95)';
    ctx.fillStyle = 'rgba(255,140,20,0.18)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(mouseWorld.x - camX, mouseWorld.y - camY, radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  }

  // ─ Entities
  for (const e of allEnts()) {
    if (!entVisible(e)) continue;   // hide enemies in fog
    const d  = DEF[e.type];
    const sx = e.x - camX;
    const sy = e.y - camY;
    const isSel = sel.has(e.id);

    if (d.u) {
      // Unit – circle
      const r = 9;
      if (isSel) {
        ctx.strokeStyle = '#fff';
        ctx.lineWidth   = 2.5;
        ctx.beginPath(); ctx.arc(sx, sy, r + 4, 0, Math.PI * 2); ctx.stroke();
      }
      ctx.fillStyle = P_COLOR[e.player];
      ctx.beginPath(); ctx.arc(sx, sy, r, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = P_DARK[e.player]; ctx.lineWidth = 1.5; ctx.stroke();
      // Letter
      ctx.fillStyle = '#fff'; ctx.font = 'bold 9px Arial';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(d.letter, sx, sy);

      // HP bar (above unit)
      drawHPBar(sx - 9, sy - 16, 18, 3, e.hp / e.maxHp);

    } else {
      // Building – rectangle (x,y = centre)
      const bw = d.fw * TS, bh = d.fh * TS;
      const bx = sx - bw / 2, by = sy - bh / 2;
      if (isSel) {
        ctx.strokeStyle = '#fff'; ctx.lineWidth = 3;
        ctx.strokeRect(bx - 2, by - 2, bw + 4, bh + 4);
      }
      ctx.fillStyle = P_COLOR[e.player];
      ctx.fillRect(bx, by, bw, bh);
      ctx.strokeStyle = P_DARK[e.player]; ctx.lineWidth = 2;
      ctx.strokeRect(bx, by, bw, bh);
      // Letter
      ctx.fillStyle = '#fff';
      ctx.font = `bold ${Math.floor(Math.min(bw, bh) * 0.38)}px Arial`;
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(d.letter, sx, sy);
      // Train progress bar
      if (e.trainQ.length > 0 && e.trainTimer > 0) {
        const totalT = DEF[e.trainQ[0]].tm;
        const prog   = 1 - e.trainTimer / totalT;
        ctx.fillStyle = 'rgba(0,0,0,0.5)';
        ctx.fillRect(bx, by + bh - 5, bw, 5);
        ctx.fillStyle = '#00ffaa';
        ctx.fillRect(bx, by + bh - 5, bw * prog, 5);
      }
      // HP bar
      drawHPBar(bx, by - 7, bw, 4, e.hp / e.maxHp);
    }
  }

  // ─ Selection box
  if (selBox && (selBox.w > 4 || selBox.h > 4)) {
    ctx.strokeStyle = '#00ff88'; ctx.lineWidth = 1.5;
    ctx.setLineDash([5, 3]);
    ctx.strokeRect(selBox.x, selBox.y, selBox.w, selBox.h);
    ctx.setLineDash([]);
    ctx.fillStyle = 'rgba(0,255,136,0.07)';
    ctx.fillRect(selBox.x, selBox.y, selBox.w, selBox.h);
  }

  for (const fx of fxExplosions) {
    const p = fx.t / 0.6;
    const rr = fx.r * (1.2 - p * 0.5);
    ctx.beginPath();
    ctx.arc(fx.x - camX, fx.y - camY, rr, 0, Math.PI * 2);
    ctx.fillStyle = `rgba(255,120,20,${0.15 + 0.35 * p})`;
    ctx.fill();
    ctx.lineWidth = 3;
    ctx.strokeStyle = `rgba(255,220,90,${0.2 + 0.55 * p})`;
    ctx.stroke();
  }

  // ─ Game over overlay
  if (!running && winner !== null) {
    ctx.fillStyle = 'rgba(0,0,0,0.72)';
    ctx.fillRect(0, 0, W, H);
    const isWin = winner === myP;
    ctx.fillStyle = isWin ? '#ffdd00' : '#ff4444';
    ctx.font = 'bold 72px Arial'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(isWin ? '🏆 OVERWINNING!' : '💀 VERLOREN', W / 2, H / 2 - 24);
    ctx.fillStyle = '#ccc'; ctx.font = '22px Arial';
    if (rematchRequested) {
      ctx.fillText('Wachten op tegenstander voor rematch...', W / 2, H / 2 + 30);
    } else {
      ctx.fillText('Kies een optie hieronder', W / 2, H / 2 + 30);
    }
    // Rematch button (only online mode)
    if (gameMode === 'online' && !rematchRequested) {
      ctx.fillStyle = '#22aa55';
      ctx.font = 'bold 20px Arial';
      ctx.fillText('[ REMATCH ]', W / 2 - 120, H - 40);
    }
    // Lobby button
    ctx.fillStyle = '#4488ff';
    ctx.font = 'bold 20px Arial';
    ctx.fillText('[ TERUG NAAR LOBBY ]', W / 2 + 80, H - 40);
  }

  // ─ Minimap
  renderMinimap();
}

function drawHPBar(x, y, w, h, pct) {
  ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.fillRect(x, y, w, h);
  ctx.fillStyle = pct > 0.5 ? '#44ff44' : pct > 0.25 ? '#ffff44' : '#ff4444';
  ctx.fillRect(x, y, w * pct, h);
}

function renderMinimap() {
  const mW = miniCanvas.width, mH = miniCanvas.height;
  const sx = mW / MW, sy = mH / MH;

  miniCtx.clearRect(0, 0, mW, mH);
  // Terrain
  for (let ty = 0; ty < MH; ty++)
    for (let tx = 0; tx < MW; tx++) {
      miniCtx.fillStyle = TILE_DARK[mapTiles[ty][tx]];
      miniCtx.fillRect(tx * sx, ty * sy, sx + 0.5, sy + 0.5);
    }
  // Entities on minimap: hide enemy units in fog
  for (const e of allEnts()) {
    if (!entVisible(e)) continue;
    miniCtx.fillStyle = P_COLOR[e.player];
    miniCtx.fillRect(e.x / TS * sx - 1, e.y / TS * sy - 1, 3, 3);
  }
  // Camera viewport rect
  miniCtx.strokeStyle = 'rgba(255,255,255,0.7)'; miniCtx.lineWidth = 1;
  miniCtx.strokeRect(
    camX / TS * sx, camY / TS * sy,
    canvas.width  / TS * sx,
    canvas.height / TS * sy
  );
}

// ── HUD update ─────────────────────────────────────────────
function updateHUD() {
  document.getElementById('gold-0').textContent = Math.floor(gold[0]);
  document.getElementById('gold-1').textContent = Math.floor(gold[1]);
  document.getElementById('pop-0').textContent  = playerUnits(0).length;
  document.getElementById('pop-1').textContent  = playerUnits(1).length;
  document.getElementById('income-0').textContent = 2 + Math.min(playerUnits(0).filter(e => e.type === WORKER).length, 5) + incomeLvl[0] * 2 + playerBuildings(0).filter(e => e.type === MARKET).length * DEF[MARKET].income;
  document.getElementById('income-1').textContent = 2 + Math.min(playerUnits(1).filter(e => e.type === WORKER).length, 5) + incomeLvl[1] * 2 + playerBuildings(1).filter(e => e.type === MARKET).length * DEF[MARKET].income;

  updateLegend();

  const msgEl = document.getElementById('game-msg');
  const activeMsg = msgTimer > 0 ? gameMsg : '';
  msgEl.textContent = activeMsg;

  // Show disconnect timer if active
  if (running && gameMode === 'online' && disconnectTimer > 0) {
    msgEl.textContent = `Tegenstander verbroken: ${Math.ceil(disconnectTimer)}s om te reconnecten...`;
  }

  const panel   = document.getElementById('action-btns');
  const ecoPanel = document.getElementById('eco-btns');
  const nameEl  = document.getElementById('entity-name');
  const hpEl    = document.getElementById('entity-hp');
  const queueEl = document.getElementById('train-queue');

  ecoPanel.innerHTML = '';
  const myLvl = incomeLvl[myP] || 0;
  const upgCost = 120 + myLvl * 80;
  const cdLeft = ecoLoanCd[myP] || 0;
  const artyLeft = artyCd[myP] || 0;
  const boostLeft = tactBoostCd[myP] || 0;
  const mercLeft = tactMercCd[myP] || 0;
  const repairLeft  = tactRepairCd[myP] || 0;
  const belastLeft   = belastingCd[myP] || 0;
  const plunderLeft  = plunderCd[myP] || 0;
  addBtn(ecoPanel, artyLeft > 0 ? `Artillerie (${Math.ceil(artyLeft)}s)` : 'Artillerieaanval (200g)', 'econ', () => {
    if (artyLeft > 0) return;
    if (gold[myP] < 200) { showMsg('Onvoldoende goud voor artillerie.'); return; }
    strikeMode = true;
    buildMode = null;
    showMsg('Klik op de kaart om artillerie te richten. ESC = annuleren.', 5);
  });
  addBtn(ecoPanel, cdLeft > 0 ? `Noodlening (${Math.ceil(cdLeft)}s)` : 'Noodlening (+85g)', 'econ', () => {
    if (cdLeft <= 0) sendCmd({ type: 'ECO_LOAN', player: myP });
  });
  addBtn(ecoPanel, myLvl >= 5 ? 'Mijnbouw MAX' : `Mijnbouw +2/s (${upgCost}g)`, 'econ', () => {
    if (myLvl < 5) sendCmd({ type: 'ECO_UPGRADE', player: myP });
  });
  addBtn(ecoPanel, boostLeft > 0 ? `Gevechtsboost (${Math.ceil(boostLeft)}s)` : 'Gevechtsboost (110g)', 'econ', () => {
    if (boostLeft <= 0) sendCmd({ type: 'TACTIC_BOOST', player: myP });
  });
  addBtn(ecoPanel, mercLeft > 0 ? `Huurlingen (${Math.ceil(mercLeft)}s)` : 'Roep Huurlingen (170g)', 'econ', () => {
    if (mercLeft <= 0) sendCmd({ type: 'TACTIC_MERCS', player: myP });
  });
  addBtn(ecoPanel, repairLeft > 0 ? `Reparatieveld (${Math.ceil(repairLeft)}s)` : 'Reparatieveld (140g)', 'econ', () => {
    if (repairLeft <= 0) sendCmd({ type: 'TACTIC_REPAIR', player: myP });
  });
  addBtn(ecoPanel, belastLeft > 0 ? `Belasting (${Math.ceil(belastLeft)}s)` : 'Belasting innen (gratis)', 'econ', () => {
    if (belastLeft <= 0) sendCmd({ type: 'BELASTING', player: myP });
  });
  addBtn(ecoPanel, plunderLeft > 0 ? `Plunderen (${Math.ceil(plunderLeft)}s)` : 'Plunderen (units nodig)', 'econ', () => {
    if (plunderLeft <= 0) sendCmd({ type: 'PLUNDER', player: myP });
  });

  if (sel.size === 0) {
    panel.innerHTML = ''; nameEl.textContent = 'Niets geselecteerd';
    hpEl.textContent = ''; queueEl.textContent = ''; return;
  }

  const ids   = [...sel];
  const first = ents[ids[0]];
  if (!first) { sel.clear(); return; }

  if (sel.size === 1) {
    nameEl.textContent = `${typeName(first.type)} (${P_NAME[first.player]})`;
    hpEl.textContent   = `HP: ${Math.ceil(first.hp)} / ${first.maxHp}`;
    if (first.trainQ.length > 0) {
      queueEl.textContent = `In de rij: ${first.trainQ.map(typeName).join(', ')}`;
    } else {
      queueEl.textContent = '';
    }
  } else {
    nameEl.textContent  = `${sel.size} eenheden geselecteerd`;
    hpEl.textContent    = '';
    queueEl.textContent = '';
  }

  panel.innerHTML = '';
  if (first.player !== myP) return; // can't command opponent's units

  // Worker build buttons
  if (first.type === WORKER && sel.size === 1) {
    addBtn(panel, 'Barak bouwen (120g)', 'build', () => startBuild(BARRACKS));
    addBtn(panel, 'Toren bouwen (80g)',  'build', () => startBuild(TOWER));
    const myMarkets = playerBuildings(myP).filter(e => e.type === MARKET).length;
    addBtn(panel, myMarkets >= 2 ? 'Markt MAX (2/2)' : `Markt bouwen (150g, +4/s)`, 'build', () => {
      if (myMarkets < 2) startBuild(MARKET);
      else showMsg('Je kunt maximaal 2 markten bouwen.');
    });
    addBtn(panel, 'Muur bouwen (50g)', 'build', () => startBuild(WALL));
  }

  // Building train buttons
  const d = DEF[first.type];
  if (!d.u) {
    if (first.type === BASE || first.type === BARRACKS) {
      if (DEF[SOLDIER].ta.includes(first.type))
        addBtn(panel, `Train Soldaat (100g, 10s)`,       'train', () => sendCmd({ type:'TRAIN', player:myP, bid:first.id, utype:SOLDIER }));
      if (DEF[ARCHER].ta.includes(first.type))
        addBtn(panel, `Train Boogschutter (120g, 12s)`,  'train', () => sendCmd({ type:'TRAIN', player:myP, bid:first.id, utype:ARCHER }));
      if (DEF[CAVALRY].ta.includes(first.type))
        addBtn(panel, `Train Ruiter (130g, 13s)`,        'train', () => sendCmd({ type:'TRAIN', player:myP, bid:first.id, utype:CAVALRY }));
      if (DEF[SPEARMAN].ta.includes(first.type))
        addBtn(panel, `Train Speerdrager (110g, 11s)`,   'train', () => sendCmd({ type:'TRAIN', player:myP, bid:first.id, utype:SPEARMAN }));
      if (DEF[SIEGE].ta.includes(first.type))
        addBtn(panel, `Train Belegeraar (180g, 18s)`,    'train', () => sendCmd({ type:'TRAIN', player:myP, bid:first.id, utype:SIEGE }));
    }
    if (first.type === BASE) {
      addBtn(panel, `Train Werker (50g, 6s)`, 'train', () => sendCmd({ type:'TRAIN', player:myP, bid:first.id, utype:WORKER }));
    }
  }
}

function typeName(t) {
  return { worker:'Werker', soldier:'Soldaat', archer:'Boogschutter',
           cavalry:'Ruiter', spearman:'Speerdrager', siege:'Belegeraar',
           base:'Hoofdkwartier', barracks:'Kazerne', tower:'Toren',
           market:'Markt', wall:'Muur' }[t] || t;
}

const LEGEND_UNITS = [WORKER, SOLDIER, ARCHER, CAVALRY, SPEARMAN, SIEGE];
const COUNTER_LABEL = {
  [CAVALRY]:  '✓ vs Boogschutter',
  [ARCHER]:   '✓ vs Speerdrager',
  [SPEARMAN]: '✓ vs Ruiter',
  [SIEGE]:    '✓ vs Gebouwen',
};

function updateLegend() {
  if (myP === -1) return;
  const container = document.getElementById('legend-rows');
  if (!container) return;
  container.innerHTML = '';
  for (const utype of LEGEND_UNITS) {
    const count = playerUnits(myP).filter(e => e.type === utype).length;
    const d     = DEF[utype];
    const row   = document.createElement('div');
    row.className = 'legend-row';
    const clr = P_COLOR[myP];
    row.innerHTML = `
      <div class="legend-badge" style="background:${clr}22;border-color:${clr}66;color:${clr}">${d.letter}</div>
      <div class="legend-info">
        <div class="legend-name">${typeName(utype)}</div>
        <div class="legend-count">×${count}</div>
        ${COUNTER_LABEL[utype] ? `<div class="legend-counter">${COUNTER_LABEL[utype]}</div>` : ''}
      </div>
    `;
    container.appendChild(row);
  }
}

function addBtn(parent, text, cls, cb) {
  const btn = document.createElement('button');
  btn.textContent = text;
  btn.className   = `action-btn ${cls}`;
  // HUD is rebuilt every frame; trigger on mousedown so action is not lost before click fires.
  btn.onmousedown = (e) => {
    e.preventDefault();
    e.stopPropagation();
    cb();
  };
  parent.appendChild(btn);
}

function startBuild(btype) {
  buildMode = btype;
  wallStartTile = null;
  if (btype === WALL) {
    showMsg('Klik een startpunt en daarna een eindpunt voor je muur. Max 4 blokken. ESC = annuleren.', 5);
    return;
  }
  showMsg('Klik op de kaart om te bouwen. ESC = annuleren.', 5);
}

function getWallBuildTiles(startTx, startTy, endTx, endTy) {
  const dx = endTx - startTx;
  const dy = endTy - startTy;
  if (dx !== 0 && dy !== 0) {
    return { error: 'Muur moet horizontaal of verticaal gebouwd worden.', tiles: null };
  }

  const length = Math.max(Math.abs(dx), Math.abs(dy)) + 1;
  if (length > 4) {
    return { error: 'Muur mag maximaal 4 blokken lang zijn.', tiles: null };
  }

  const stepX = Math.sign(dx);
  const stepY = Math.sign(dy);
  const tiles = [];
  for (let i = 0; i < length; i++) {
    tiles.push({ tx: startTx + stepX * i, ty: startTy + stepY * i });
  }
  return { error: null, tiles };
}

function canBuildWallTiles(tiles) {
  return tiles.every(tile => areaWalkable(tile.tx, tile.ty, 1, 1) && !bldgAtArea(tile.tx, tile.ty, 1, 1));
}

// ── Build area collision check ─────────────────────────────
function bldgAtArea(tx, ty, tw, th) {
  for (const e of allEnts()) {
    const bd = DEF[e.type];
    if (bd.u) continue;
    const etx = ((e.x - bd.fw * TS / 2) / TS) | 0;
    const ety = ((e.y - bd.fh * TS / 2) / TS) | 0;
    // AABB overlap
    if (etx < tx + tw && etx + bd.fw > tx && ety < ty + th && ety + bd.fh > ty)
      return true;
  }
  return false;
}

// ── Input ──────────────────────────────────────────────────
function initInput() {
  canvas.addEventListener('mousedown',    onMouseDown);
  canvas.addEventListener('mousemove',    onMouseMove);
  canvas.addEventListener('mouseup',      onMouseUp);
  canvas.addEventListener('contextmenu',  onRightClick);
  canvas.addEventListener('touchstart',   onTouchStart, { passive: false });
  canvas.addEventListener('touchmove',    onTouchMove, { passive: false });
  canvas.addEventListener('touchend',     onTouchEnd, { passive: false });
  canvas.addEventListener('touchcancel',  onTouchCancel, { passive: false });
  document.addEventListener('keydown',    e => {
    keysDown[e.key] = true;
      if (e.key === 'Escape') { buildMode = null; wallStartTile = null; strikeMode = false; sel.clear(); }
    if (e.key === 'Delete' || e.key === 'Backspace') { /* reserved */ }
  });
  document.addEventListener('keyup', e => { keysDown[e.key] = false; });
}

function screenToWorld(sx, sy) { return { x: sx + camX, y: sy + camY }; }

function onMouseMove(e) {
  const r  = canvas.getBoundingClientRect();
  const sx = e.clientX - r.left, sy = e.clientY - r.top;
  mouseScreen = { x: sx, y: sy };
  mouseWorld  = screenToWorld(sx, sy);

  if (selStart) {
    selBox = {
      x: Math.min(sx, selStart.sx), y: Math.min(sy, selStart.sy),
      w: Math.abs(sx - selStart.sx), h: Math.abs(sy - selStart.sy),
    };
  }

  // Edge-scroll disabled (use arrow keys / WASD instead)
  // if (sx < EDGE)               camX -= CAM_SPD * 0.016;
  // if (sx > canvas.width - EDGE) camX += CAM_SPD * 0.016;
  // if (sy < EDGE)               camY -= CAM_SPD * 0.016;
  // if (sy > canvas.height - EDGE) camY += CAM_SPD * 0.016;
  clampCam();
}

function onMouseDown(e) {
  if (e.button !== 0) return;
  const r  = canvas.getBoundingClientRect();
  const sx = e.clientX - r.left, sy = e.clientY - r.top;
  const w  = screenToWorld(sx, sy);
  mouseWorld = w;

  // Game over click: route to rematch or lobby
  if (!running && winner !== null) {
    const r2 = canvas.getBoundingClientRect();
    const cx2 = e.clientX - r2.left;
    const cy2 = e.clientY - r2.top;
    const H2 = canvas.height;
    const W2 = canvas.width;
    const btnY = H2 - 40;
    const rematchX = W2 / 2 - 120;
    const lobbyX   = W2 / 2 + 80;

    // Rematch button zone: rematchX ± 80, btnY ± 18
    if (gameMode === 'online' && !rematchRequested &&
        cx2 >= rematchX - 80 && cx2 <= rematchX + 80 &&
        cy2 >= btnY - 18 && cy2 <= btnY + 18) {
      requestRematch();
    } else {
      returnToLobby();
    }
    return;
  }

  if (strikeMode) {
    sendCmd({ type: 'ARTY', player: myP, x: w.x, y: w.y });
    strikeMode = false;
    return;
  }

  if (buildMode) {
    const d   = DEF[buildMode];
    const tx  = (w.x / TS) | 0;
    const ty  = (w.y / TS) | 0;
      if (buildMode === WALL) {
        if (!wallStartTile) {
          if (areaWalkable(tx, ty, d.fw, d.fh) && !bldgAtArea(tx, ty, d.fw, d.fh)) {
            wallStartTile = { tx, ty };
            showMsg('Startpunt gekozen. Klik nu een eindpunt voor de muur.', 5);
          } else {
            showMsg('Hier kan geen muur starten!');
          }
          return;
        }

        const plan = getWallBuildTiles(wallStartTile.tx, wallStartTile.ty, tx, ty);
        if (!plan.tiles) {
          showMsg(plan.error);
          return;
        }
        if (!canBuildWallTiles(plan.tiles)) {
          showMsg('Muur kan hier niet gebouwd worden!');
          return;
        }
        sendCmd({ type: 'BUILD', player: myP, btype: buildMode, tiles: plan.tiles });
        buildMode = null;
        wallStartTile = null;
        return;
      }

    if (areaWalkable(tx, ty, d.fw, d.fh) && !bldgAtArea(tx, ty, d.fw, d.fh)) {
      sendCmd({ type: 'BUILD', player: myP, btype: buildMode, tx, ty });
    } else {
      showMsg('Hier kan niet gebouwd worden!');
    }
    buildMode = null;
      wallStartTile = null;
    return;
  }

  selStart = { sx, sy };
  selBox   = { x: sx, y: sy, w: 0, h: 0 };
}

function onMouseUp(e) {
  if (e.button !== 0) return;
  if (!selStart) return;

  const r  = canvas.getBoundingClientRect();
  const sx = e.clientX - r.left, sy = e.clientY - r.top;
  const dx = Math.abs(sx - selStart.sx), dy = Math.abs(sy - selStart.sy);

  if (dx < 5 && dy < 5) {
    clickSelect(mouseWorld.x, mouseWorld.y, e.shiftKey, false);
  } else {
    boxSelect(selBox);
  }

  selStart = null;
  selBox   = null;
}

function clickSelect(wx, wy, shift, allowTapCommand = false) {
  const clicked = entityAt(wx, wy);
  const myUnits = [...sel].filter(id => ents[id] && DEF[ents[id].type].u && ents[id].player === myP);

  if (!shift && clicked && clicked.player === myP) sel.clear();

  if (clicked) {
    if (clicked.player === myP) {
      sel.has(clicked.id) ? sel.delete(clicked.id) : sel.add(clicked.id);
    } else {
      // Click on enemy → attack with selected units
      issueAttack(clicked.id);
    }
  } else if (allowTapCommand && myUnits.length > 0) {
    // Mobile: tap ground with selected units to move
    sendCmd({ type: 'MOVE', ids: myUnits, wx, wy });
  } else if (!shift) {
    sel.clear();
  }
}

function boxSelect(box) {
  sel.clear();
  for (const e of allEnts()) {
    if (e.player !== myP || !DEF[e.type].u) continue;
    const sx = e.x - camX, sy = e.y - camY;
    if (sx >= box.x && sx <= box.x + box.w && sy >= box.y && sy <= box.y + box.h)
      sel.add(e.id);
  }
}

function entityAt(wx, wy) {
  // Buildings first (larger hit area)
  for (const e of allEnts()) {
    const d = DEF[e.type];
    if (!d.u) {
      const hw = d.fw * TS / 2, hh = d.fh * TS / 2;
      if (wx >= e.x - hw && wx <= e.x + hw && wy >= e.y - hh && wy <= e.y + hh) return e;
    }
  }
  // Units
  for (const e of allEnts()) {
    if (DEF[e.type].u && dist(e, { x: wx, y: wy }) <= 12) return e;
  }
  return null;
}

function issueAttack(targetId) {
  const myUnits = [...sel].filter(id => ents[id] && DEF[ents[id].type].u && ents[id].player === myP);
  if (myUnits.length) sendCmd({ type: 'ATTACK', ids: myUnits, tid: targetId });
}

function onRightClick(e) {
  e.preventDefault();
  if (!running || sel.size === 0) return;

  const r  = canvas.getBoundingClientRect();
  const sx = e.clientX - r.left, sy = e.clientY - r.top;
  const w  = screenToWorld(sx, sy);

  const myUnits = [...sel].filter(id => ents[id] && DEF[ents[id].type].u && ents[id].player === myP);
  if (!myUnits.length) return;

  const clicked = entityAt(w.x, w.y);
  if (clicked && clicked.player !== myP) {
    sendCmd({ type: 'ATTACK', ids: myUnits, tid: clicked.id });
  } else {
    sendCmd({ type: 'MOVE', ids: myUnits, wx: w.x, wy: w.y });
  }
}

function onTouchStart(e) {
  if (!e.touches || e.touches.length !== 1) return;
  e.preventDefault();
  const t = e.touches[0];
  touchStartScreen = { x: t.clientX, y: t.clientY };
  touchLastScreen = { x: t.clientX, y: t.clientY };
  touchMoved = false;

  onMouseDown({ button: 0, clientX: t.clientX, clientY: t.clientY });
}

function onTouchMove(e) {
  if (!e.touches || e.touches.length !== 1 || !touchStartScreen) return;
  e.preventDefault();
  const t = e.touches[0];
  touchLastScreen = { x: t.clientX, y: t.clientY };
  if (Math.abs(t.clientX - touchStartScreen.x) > 6 || Math.abs(t.clientY - touchStartScreen.y) > 6) {
    touchMoved = true;
  }
  onMouseMove({ clientX: t.clientX, clientY: t.clientY });
}

function onTouchEnd(e) {
  if (!touchStartScreen) return;
  e.preventDefault();

  const p = touchLastScreen || touchStartScreen;
  const r = canvas.getBoundingClientRect();
  const sx = p.x - r.left;
  const sy = p.y - r.top;
  const w = screenToWorld(sx, sy);

  if (!selStart) {
    touchStartScreen = null;
    touchLastScreen = null;
    touchMoved = false;
    return;
  }

  if (touchMoved && selBox && (selBox.w > 4 || selBox.h > 4)) {
    boxSelect(selBox);
    selStart = null;
    selBox = null;
  } else {
    clickSelect(w.x, w.y, false, true);
    selStart = null;
    selBox = null;
  }

  touchStartScreen = null;
  touchLastScreen = null;
  touchMoved = false;
}

function onTouchCancel(e) {
  if (e) e.preventDefault();
  touchStartScreen = null;
  touchLastScreen = null;
  touchMoved = false;
  selStart = null;
  selBox = null;
}

// ── Canvas resize ──────────────────────────────────────────
function resizeCanvas() {
  canvas.width  = canvas.clientWidth;
  canvas.height = canvas.clientHeight;
  miniCanvas.width  = miniCanvas.clientWidth  || 160;
  miniCanvas.height = miniCanvas.clientHeight || 90;
  clampCam();
}

// ── Network ────────────────────────────────────────────────
let net;
let firebaseDb = null;
let firebaseClientId = '';
let firebaseJoinedAt = 0;
let firebaseRoomId = '';
let firebasePresenceRef = null;
let firebasePlayersRef = null;
let firebaseCmdsRef = null;
let firebaseOpenRef = null;
let firebaseAssignRef = null;
let firebaseRoomRef = null;
let firebaseRoomPlayers = [];
let firebasePlayersHandler = null;
let firebaseCmdHandler = null;
let firebaseOpenHandler = null;
let firebaseAssignHandler = null;
let firebaseAutoResolving = false;
let matchResultSubmitted = false;

function ensureFirebaseClient() {
  if (typeof firebase === 'undefined' || !window.FIREBASE_CONFIG) return false;
  try {
    const cfg = window.FIREBASE_CONFIG;
    const app = firebase.apps.length ? firebase.app() : firebase.initializeApp(cfg);
    firebaseDb = firebase.database(app);
    if (!firebaseClientId) {
      firebaseClientId = `c_${Date.now().toString(36)}_${((Math.random() * 1e6) | 0).toString(36)}`;
      firebaseJoinedAt = Date.now();
    }
    return true;
  } catch (_err) {
    return false;
  }
}

function cleanupFirebaseRealtime(removePresence = true) {
  if (firebasePlayersRef && firebasePlayersHandler) {
    firebasePlayersRef.off('value', firebasePlayersHandler);
  }
  if (firebaseCmdsRef && firebaseCmdHandler) {
    firebaseCmdsRef.off('child_added', firebaseCmdHandler);
  }
  if (firebaseOpenRef && firebaseOpenHandler) {
    firebaseOpenRef.off('value', firebaseOpenHandler);
  }
  if (firebaseAssignRef && firebaseAssignHandler) {
    firebaseAssignRef.off('value', firebaseAssignHandler);
  }

  if (removePresence && firebasePresenceRef) {
    firebasePresenceRef.remove();
  }
  if (removePresence && firebaseOpenRef && firebaseClientId) {
    firebaseOpenRef.child(firebaseClientId).remove();
  }
  if (removePresence && firebaseAssignRef) {
    firebaseAssignRef.remove();
  }

  firebaseRoomId = '';
  firebaseRoomRef = null;
  firebaseRoomPlayers = [];
  firebasePresenceRef = null;
  firebasePlayersRef = null;
  firebaseCmdsRef = null;
  firebaseOpenRef = null;
  firebaseAssignRef = null;
  firebasePlayersHandler = null;
  firebaseCmdHandler = null;
  firebaseOpenHandler = null;
  firebaseAssignHandler = null;
  firebaseAutoResolving = false;
  matchResultSubmitted = false;
}

function startAIGame() {
  cleanupFirebaseRealtime(true);
  gameMode = 'ai';
  myPending = 0;
  document.getElementById('lobby-status').textContent = 'Singleplayer vs AI wordt gestart...';
  document.getElementById('room-info').style.display = 'none';
  if (net && net.connected && typeof net.disconnect === 'function') {
    net.disconnect();
  }
  net = null;
  const seed = ((Date.now() ^ (Math.random() * 1000000)) >>> 0) || 1337;
  initGame(seed, 0);
}

function initLobbyActions() {
  const aiBtn = document.getElementById('play-ai');
  const autoBtn = document.getElementById('play-online-auto');
  const partyBtn = document.getElementById('create-party-invite');
  const codeBtn = document.getElementById('play-online-code');
  const codeInput = document.getElementById('room-code-input');

  if (aiBtn) {
    aiBtn.onmousedown = (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (!running) startAIGame();
    };
  }

  if (autoBtn) {
    autoBtn.onmousedown = (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (!running) startFirebaseAutoMatch();
    };
  }

  if (partyBtn) {
    partyBtn.onmousedown = (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (!running) createPartyInvite();
    };
  }

  if (codeInput) {
    codeInput.addEventListener('input', () => {
      codeInput.value = sanitizeRoomCode(codeInput.value);
    });
    codeInput.addEventListener('keydown', (e) => {
      if (e.key !== 'Enter' || running) return;
      e.preventDefault();
      startFirebaseCodeMatch(codeInput.value);
    });
  }

  if (codeBtn) {
    codeBtn.onmousedown = (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (!running) {
        startFirebaseCodeMatch(codeInput ? codeInput.value : '');
      }
    };
  }
}

function createPartyInvite() {
  if (!ensureFirebaseClient()) {
    document.getElementById('lobby-status').textContent =
      'Firebase config ontbreekt. Vul public/firebase-config.js in of speel tegen AI.';
    return;
  }

  const roomId = `PTY${randRoomId(8)}`;
  const codeInput = document.getElementById('room-code-input');
  if (codeInput) codeInput.value = roomId;
  window.location.hash = roomId;

  const inviteUrl = `${window.location.origin}${window.location.pathname}#${roomId}`;
  document.getElementById('lobby-status').textContent =
    'Party invite gemaakt. Deel de link met je vriend.';

  if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
    navigator.clipboard.writeText(inviteUrl)
      .then(() => {
        showMsg('Party link gekopieerd naar klembord.', 3);
      })
      .catch(() => {
        document.getElementById('lobby-status').textContent =
          `Party link: ${inviteUrl}`;
      });
  } else {
    document.getElementById('lobby-status').textContent =
      `Party link: ${inviteUrl}`;
  }

  connectFirebaseRoom(roomId, 'Party invite actief… wacht op je teammate.');
}

function randRoomId(len = 6) {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let out = '';
  for (let i = 0; i < len; i++) out += chars[(Math.random() * chars.length) | 0];
  return out;
}

function sanitizeRoomCode(raw) {
  return (raw || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 12);
}

function makeAutoRoomId(a, b) {
  const ids = [a, b].sort();
  return `AUTO${ids[0].slice(-4)}${ids[1].slice(-4)}`.toUpperCase();
}

function connectFirebaseRoom(roomId, waitText) {
  if (!ensureFirebaseClient()) return false;

  cleanupFirebaseRealtime(true);
  gameMode = 'online';
  firebaseRoomId = roomId;

  const roomRef = firebaseDb.ref(`rooms/${roomId}`);
  firebaseRoomRef = roomRef;
  firebaseRoomPlayers = [];
  matchResultSubmitted = false;
  firebasePlayersRef = roomRef.child('players');
  firebaseCmdsRef = roomRef.child('cmds');
  firebasePresenceRef = firebasePlayersRef.child(firebaseClientId);

  firebasePresenceRef.set({
    joinedAt: firebase.database.ServerValue.TIMESTAMP,
    name: playerName,
    pid: playerProfileId,
  });
  firebasePresenceRef.onDisconnect().remove();

  roomRef.child('seed').transaction(cur => cur || (((Date.now() ^ (Math.random() * 1000000)) >>> 0) || 1337));

  net = {
    connected: true,
    emit(event, payload) {
      if (event !== 'cmd') return;
      firebaseCmdsRef.push({
        from: firebaseClientId,
        cmd: payload,
        ts: firebase.database.ServerValue.TIMESTAMP,
      });
    },
    disconnect() {
      this.connected = false;
      cleanupFirebaseRealtime(true);
    },
  };

  let started = false;

  firebasePlayersHandler = (snap) => {
    if (gameMode !== 'online') return;
    const players = snap.val() || {};
    const ids = Object.keys(players)
      .sort((a, b) => (players[a].joinedAt || 0) - (players[b].joinedAt || 0));
    const idx = ids.indexOf(firebaseClientId);
    firebaseRoomPlayers = ids.slice(0, 2).map((id, slot) => ({
      clientId: id,
      slot,
      pid: players[id] && players[id].pid ? players[id].pid : '',
      name: players[id] && players[id].name ? players[id].name : 'Speler',
      joinedAt: players[id] && players[id].joinedAt ? players[id].joinedAt : 0,
    }));

    document.getElementById('room-id').textContent = roomId;
    document.getElementById('room-info').style.display = 'block';

    if (idx === -1) {
      document.getElementById('lobby-status').textContent = 'Verbinding met room is verbroken.';
      return;
    }

    if (idx > 1) {
      document.getElementById('lobby-status').textContent = 'Kamer is vol. Gebruik een andere code.';
      document.getElementById('waiting-msg').textContent = 'Deze room ondersteunt maximaal 2 spelers.';
      return;
    }

    myPending = idx;
    document.getElementById('lobby-status').textContent =
      `Verbonden (serverloos)! Jij speelt als ${P_NAME[idx]}.`;

    if (ids.length < 2) {
      if (running) {
        // Opponent disconnected during game - start 10-second reconnect timer
        if (disconnectTimer <= 0) {
          disconnectTimer = 10;  // 10 second reconnect window
          disconnectingPlayer = myP === 0 ? 1 : 0;  // The OTHER player is disconnected
          showMsg(`Tegenstander verbroken. ${Math.ceil(disconnectTimer)}s reconnect timeout...`, 12);
        }
      } else {
        document.getElementById('waiting-msg').textContent = waitText;
      }
      return;
    }

    // Opponent reconnected, cancel timeout
    if (running && ids.length === 2 && disconnectTimer > 0) {
      disconnectTimer = 0;
      disconnectingPlayer = -1;
      showMsg('Tegenstander terug!', 3);
    }

    document.getElementById('waiting-msg').textContent = 'Tegenstander gevonden! Spel start…';

    if (!started && !running) {
      started = true;
      roomRef.child('seed').once('value').then(seedSnap => {
        if (gameMode !== 'online' || running) return;
        const seed = seedSnap.val() || 1337;
        initGame(seed, myPending);
        listenForRematch();
      });
    }
  };
  firebasePlayersRef.on('value', firebasePlayersHandler);

  firebaseCmdHandler = (snap) => {
    if (gameMode !== 'online') return;
    const data = snap.val();
    if (!data || data.from === firebaseClientId || !data.cmd) return;
    if (data.ts && data.ts + 1500 < firebaseJoinedAt) return;

    const sender = (firebaseRoomPlayers || []).find(p => p.clientId === data.from);
    if (!sender || (sender.slot !== 0 && sender.slot !== 1)) {
      flagCheat(1 - myP, 'onbekende sender');
      return;
    }

    const issuer = sender.slot;
    const now = Date.now();
    cmdWindow[issuer].push(now);
    cmdWindow[issuer] = cmdWindow[issuer].filter(t => now - t <= 3000);
    if (cmdWindow[issuer].length > MAX_REMOTE_CMDS_PER_3S) {
      flagCheat(issuer, 'command flood');
      return;
    }

    if (!validateCommand(data.cmd, issuer)) {
      flagCheat(issuer, 'ongeldige command');
      return;
    }

    execCmd(data.cmd);
  };
  firebaseCmdsRef.on('child_added', firebaseCmdHandler);

  return true;
}

function startFirebaseAutoMatch() {
  if (!ensureFirebaseClient()) {
    document.getElementById('lobby-status').textContent =
      'Firebase config ontbreekt. Vul public/firebase-config.js in of speel tegen AI.';
    return;
  }

  cleanupFirebaseRealtime(true);
  gameMode = 'online';
  document.getElementById('room-info').style.display = 'none';
  document.getElementById('lobby-status').textContent = 'Automatch zoekt een tegenstander…';
  window.location.hash = '';

  const mmRef = firebaseDb.ref('rooms/_matchmaking');
  firebaseOpenRef = mmRef.child('open');
  firebaseAssignRef = mmRef.child(`assignments/${firebaseClientId}`);

  firebaseOpenRef.child(firebaseClientId).set({ joinedAt: firebase.database.ServerValue.TIMESTAMP });
  firebaseOpenRef.child(firebaseClientId).onDisconnect().remove();
  firebaseAssignRef.onDisconnect().remove();

  firebaseAssignHandler = (snap) => {
    if (gameMode !== 'online' || running || firebaseRoomId) return;
    const assignedRoom = sanitizeRoomCode(snap.val() || '');
    if (!assignedRoom) return;
    window.location.hash = assignedRoom;
    firebaseAssignRef.remove();
    connectFirebaseRoom(assignedRoom, 'Automatch actief… wacht op synchronisatie.');
  };
  firebaseAssignRef.on('value', firebaseAssignHandler);

  firebaseOpenHandler = (snap) => {
    if (gameMode !== 'online' || running || firebaseRoomId || firebaseAutoResolving) return;
    const waiting = snap.val() || {};
    const oppIds = Object.keys(waiting)
      .filter(id => id !== firebaseClientId)
      .sort((a, b) => (waiting[a].joinedAt || 0) - (waiting[b].joinedAt || 0));

    if (!oppIds.length) return;

    firebaseAutoResolving = true;
    const oppId = oppIds[0];
    const claimRef = mmRef.child(`claims/${oppId}`);

    claimRef.transaction(cur => cur || firebaseClientId, (err, committed, claimSnap) => {
      if (err || !committed || !claimSnap || claimSnap.val() !== firebaseClientId) {
        firebaseAutoResolving = false;
        return;
      }

      const roomId = makeAutoRoomId(firebaseClientId, oppId);
      mmRef.update({
        [`assignments/${firebaseClientId}`]: roomId,
        [`assignments/${oppId}`]: roomId,
        [`open/${firebaseClientId}`]: null,
        [`open/${oppId}`]: null,
        [`claims/${oppId}`]: null,
      }).finally(() => {
        firebaseAutoResolving = false;
      });
    }, false);
  };

  firebaseOpenRef.on('value', firebaseOpenHandler);
}

function startFirebaseCodeMatch(inputCode) {
  if (!ensureFirebaseClient()) {
    document.getElementById('lobby-status').textContent =
      'Firebase config ontbreekt. Vul public/firebase-config.js in of speel tegen AI.';
    return;
  }

  const roomId = sanitizeRoomCode(inputCode) || randRoomId(6);
  const codeInput = document.getElementById('room-code-input');
  if (codeInput) codeInput.value = roomId;
  window.location.hash = roomId;

  connectFirebaseRoom(roomId, 'Wachten op tegenstander met dezelfde kamercode…');
}

function initNetwork() {
  if (ensureFirebaseClient()) {
    gameMode = 'online';
    document.getElementById('online-badge').textContent = 'Serverloze multiplayer via Firebase';
    document.getElementById('lobby-status').textContent =
      'Kies: Automatisch Matchen of Join met Kamercode.';
    loadMyRatingFromFirebase();
    subscribeLeaderboard();

    const hashRoom = sanitizeRoomCode((window.location.hash || '').replace('#', '').trim());
    const codeInput = document.getElementById('room-code-input');
    if (hashRoom) {
      if (codeInput) codeInput.value = hashRoom;
      startFirebaseCodeMatch(hashRoom);
    }
    return;
  }

  if (typeof io !== 'function') {
    gameMode = 'offline';
    document.getElementById('online-badge').textContent = 'Online uitgeschakeld (geen Firebase config)';
    document.getElementById('lobby-status').textContent =
      'Online niet actief: voeg Firebase config toe in public/firebase-config.js. Gebruik intussen Speel Tegen AI.';
    document.getElementById('room-info').style.display = 'none';
    return;
  }

  gameMode = 'online';
  net = io();

  net.on('joined', ({ playerIndex, roomId }) => {
    if (gameMode !== 'online') return;
    myPending = playerIndex;
    document.getElementById('lobby-status').textContent =
      `Verbonden! Jij speelt als ${P_NAME[playerIndex]}.`;
    document.getElementById('room-id').textContent     = roomId;
    document.getElementById('room-info').style.display = 'block';
    document.getElementById('waiting-msg').textContent =
      playerIndex === 0 ? 'Wachten op tegenstander…' : 'Tegenstander gevonden! Spel start…';
  });

  net.on('game_start', ({ seed }) => {
    if (gameMode !== 'online') return;
    initGame(seed, myPending);
    listenForRematch();
  });

  net.on('cmd', (cmd) => {
    execCmd(cmd); // execute opponent's command in local simulation
  });

  net.on('opponent_left', () => {
    if (gameMode !== 'online') return;
    showMsg('De tegenstander heeft de verbinding verbroken.', 10);
    if (running) { winner = myP; running = false; }
  });

  net.on('connect_error', () => {
    document.getElementById('lobby-status').textContent = 'Kan geen verbinding maken met de server.';
  });
}

// ── Bootstrap ──────────────────────────────────────────────
window.addEventListener('DOMContentLoaded', () => {
  canvas      = document.getElementById('canvas');
  ctx         = canvas.getContext('2d');
  miniCanvas  = document.getElementById('minimap');
  miniCtx     = miniCanvas.getContext('2d');

  ensureLocalProfile();
  initLobbyActions();
  initInput();
  initNetwork();

  window.addEventListener('resize', resizeCanvas);
});
