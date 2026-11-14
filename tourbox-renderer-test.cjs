// Isolated renderer checks for the original archives listed in versions.json.

const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const versions = require('./versions.json');
const installedArchive = path.join(process.env.ProgramFiles, 'TourBox Console', 'app', 'resources', 'app.asar');

const beta = versions[0];
const stable = versions[1];
const stableSymbols = {
  _0x405308: '_0x5bd6a0', _0x2f7e0a: '_0x6bb61a', _0xf774fa: '_0x54cb88',
  _0x23cf0d: '_0x534d2a', _0x5d5476: '_0x1d7960', _0x534239: '_0x53348c',
  _0x57cd7b: '_0x25d525', _0x10ae00: '_0x37b18d', _0x3d9106: '_0x7d8a36',
  _0x38af98: '_0x5e9796', _0x1d71c8: '_0xfa9be7', _0x3b55be: '_0x103433',
  _0x420403: '_0x4ddd23', _0x4547: '_0x22db', _0x25d7: '_0x2c77', _0x3e927c: '_0x4ebe08',
  _0x5cbff4: '_0x251eb9', _0x47f3f0: '_0x5c15f3', _0x27b731: '_0xd225d4', _0x372488: '_0x37dbdb',
};

function portSymbols(text, version) {
  if (version === beta) return text;
  assert.equal(version, stable, 'Unknown renderer port');
  return text.replace(/\b_0x[\da-f]+\b/g, name => stableSymbols[name] ?? name);
}

function detectVersion(bytes) {
  const hash = sha256(bytes);
  const version = versions.find(item => item.original === hash);
  assert(version, 'Unsupported original TourBox archive');
  return version;
}

function sha256(bytes) {
  return crypto.createHash('sha256').update(bytes).digest('hex');
}

function readArchiveParts(archivePath) {
  const archive = fs.readFileSync(archivePath);
  assert.equal(archive.readUInt32LE(0), 4, 'Unrecognized ASAR preamble');
  const headerBytes = archive.readUInt32LE(4);
  const headerJsonBytes = archive.readUInt32LE(12);
  assert(headerBytes >= 8 && headerJsonBytes <= headerBytes - 8 && 8 + headerBytes <= archive.length);
  const header = JSON.parse(archive.subarray(16, 16 + headerJsonBytes));
  const runtime = header.files.out.files.renderer.files;

  function archiveEntry(entry) {
    assert(Number.isSafeInteger(entry?.size) && /^\d+$/.test(entry?.offset));
    const start = 8 + headerBytes + Number(entry.offset);
    const end = start + entry.size;
    assert(Number.isSafeInteger(end) && start >= 8 + headerBytes && end <= archive.length);
    return archive.subarray(start, end);
  }

  function asset(filename, expectedHash) {
    const file = runtime.assets.files[filename];
    const payload = archiveEntry(file);
    const digest = sha256(payload);
    assert.equal(file.integrity?.algorithm, 'SHA256');
    assert.equal(digest, file.integrity.hash, `${filename} does not match its recorded ASAR integrity hash`);
    assert.equal(digest, expectedHash, `${filename} differs from the tested baseline`);
    return payload.toString('utf8');
  }

  return { html: archiveEntry(runtime['color-pick.html']).toString('utf8'), asset };
}

function readActiveRenderer(archivePath, version) {
  const { html, asset } = readArchiveParts(archivePath);
  assert(html.includes(`./assets/${version.renderer}`), 'Packaged color-picker HTML uses a different renderer');
  return asset(version.renderer, version.rendererHash);
}

function readHslToRgb(archivePath, version) {
  const hooks = readArchiveParts(archivePath).asset(version.hooks, version.hooksHash);
  const start = hooks.indexOf('hslToRgb = ');
  const end = hooks.indexOf(', hslToHex = ', start);
  assert(start >= 0 && end > start, 'Color conversion body not found');
  return new Function(`const ${hooks.slice(start, end)}; return hslToRgb;`)();
}

function replaceOnce(text, before, after) {
  const start = text.indexOf(before);
  assert(start >= 0 && text.indexOf(before, start + before.length) < 0, `Unexpected renderer anchor ${before.slice(0, 80)}`);
  return text.slice(0, start) + after + text.slice(start + before.length);
}

function createRendererCandidate(baseline, version) {
  assert.equal(sha256(baseline), version.rendererHash, 'Renderer differs from the tested baseline');
  const beforeStart = version === beta ? '  if (_0x5dc959) {\n    const _0x47a3ed' : '  if (_0xcbc7a8) {\n    const _0x4cfd53';
  const beforeEnd = version === beta ? '  _0x23cf0d[_0x44aadf(1476)][_0x44aadf(562)]' : '  _0x534d2a["hsvSquare"][_0x1ba55d(1075)]';
  const start = baseline.indexOf(beforeStart);
  const end = baseline.indexOf(beforeEnd, start);
  assert(start >= 0 && end > start, 'Original wheel redraw block not found');

  const after = `  const wheelSize = _0x405308.value + COLOR_WHEEL_CANVAS_EXTRA$1;
  const ratio = getColorWheelRenderScale();
  const photoshopOrientation = isPSHueRing();
  const hue = _0x2f7e0a.value;
  const next = {
    x: _0xf774fa.centerX, y: _0xf774fa.centerY,
    outerRadius: _0xf774fa.outerRadius, innerRadius: _0xf774fa.innerRadius,
    centerRadius: _0xf774fa.centerAreaRadius, squareSize: _0xf774fa.squareSize,
    wheelSize, ratio, photoshopOrientation,
  };
  const previous = colorWheelTextureState.get(_0x23cf0d);
  if (!previous || previous.wheelSize !== wheelSize || previous.ratio !== ratio ||
      previous.photoshopOrientation !== photoshopOrientation || previous.x !== next.x || previous.y !== next.y ||
      previous.outerRadius !== next.outerRadius || previous.innerRadius !== next.innerRadius) {
    const ring = createHueRingCanvas(_0xf774fa, wheelSize, photoshopOrientation);
    drawHiDpiSourceCanvas(_0x23cf0d.hueRing, ring, wheelSize, wheelSize, wheelSize);
    _0x23cf0d.hueRing.set({ x: next.x - wheelSize / 2, y: next.y - wheelSize / 2 });
  }
  if (!previous || previous.squareHue !== hue || previous.x !== next.x || previous.y !== next.y ||
      previous.squareSize !== next.squareSize) {
    updateHsvSquareNodes(_0x23cf0d, _0xf774fa, hue);
  }
  next.squareHue = hue;

  const triangleSize = getHslTriangleDisplaySize(_0xf774fa);
  next.triangle = previous?.triangle;
  const triangleWasDrawnForCurrentColor = next.triangle?.hue === hue &&
    next.triangle.size === triangleSize && next.triangle.radius === next.centerRadius;
  if (_0x5d5476 === 'hsl' && !triangleWasDrawnForCurrentColor) {
    const triangle = createTriangleCanvas(_0xf774fa, hue);
    drawHiDpiSourceCanvas(_0x23cf0d.hslTriangle, triangle, triangleSize, triangleSize, triangleSize);
    if (triangle) next.triangle = { hue, size: triangleSize, radius: next.centerRadius };
  }
  if (previous?.x !== next.x || previous?.y !== next.y || previous?.centerRadius !== next.centerRadius ||
      previous?.innerRadius !== next.innerRadius) {
    _0x23cf0d.hslTriangle.set({ x: next.x - triangleSize / 2, y: next.y - triangleSize / 2 });
  }
  colorWheelTextureState.set(_0x23cf0d, next);
`;
  let candidate = replaceOnce(baseline, baseline.slice(start, end), portSymbols(after, version));
  candidate = replaceOnce(candidate, '}, createColorWheelRenderer = (',
    '}, colorWheelTextureState = new WeakMap(), createColorWheelRenderer = (');
  const eagerTriangle = version === beta
    ? '  const _0x3f8576 = createTriangleCanvas(_0x57cd7b, _0x2f7e0a[_0x4bef59(1147)]), _0x38af98 = getHslTriangleDisplaySize(_0x57cd7b), _0x1d71c8 = createHiDpiCanvasNode(_0x3f8576, _0x38af98, _0x38af98, _0x38af98);'
    : '  const _0x3c8d2a = createTriangleCanvas(_0x25d525, _0x6bb61a[_0x426bf8(1842)]), _0x5e9796 = getHslTriangleDisplaySize(_0x25d525), _0xfa9be7 = createHiDpiCanvasNode(_0x3c8d2a, _0x5e9796, _0x5e9796, _0x5e9796);';
  candidate = replaceOnce(candidate, eagerTriangle,
    portSymbols('  const _0x38af98 = getHslTriangleDisplaySize(_0x57cd7b), _0x1d71c8 = new hi$1({ width: _0x38af98, height: _0x38af98, hitSelf: false, hitChildren: false, smooth: true });', version));
  candidate = replaceOnce(candidate,
    portSymbols('  return updateColorWheelRenderer(_0x534239, _0x3d9106, ![]),', version),
    portSymbols(`  colorWheelTextureState.set(_0x534239, {
    x: _0x57cd7b.centerX, y: _0x57cd7b.centerY,
    outerRadius: _0x57cd7b.outerRadius, innerRadius: _0x57cd7b.innerRadius,
    centerRadius: _0x57cd7b.centerAreaRadius, squareSize: _0x57cd7b.squareSize,
    wheelSize: _0x10ae00, ratio: getColorWheelRenderScale(),
    photoshopOrientation: isPSHueRing(), squareHue: _0x2f7e0a.value,
  });
  return updateColorWheelRenderer(_0x534239, _0x3d9106, ![]),`, version));
  return candidate;
}

function addTriangleCache(candidate, moduleSource, version) {
  const exportLine = 'export function createHslTriangleRenderer';
  assert(moduleSource.includes(exportLine), 'Triangle module export changed');
  assert(!candidate.includes('cachedHslTriangleRenderer'));
  const insertBefore = portSymbols('const _0x420403 = _0x4547;', version);
  const declaration = `${moduleSource.replace(exportLine, 'function createHslTriangleRenderer')}
let cachedHslTriangleRenderer;
const drawCachedHslTriangle = (geometry, hue) => {
  cachedHslTriangleRenderer ??= createHslTriangleRenderer({ hslToRgb: _0x3b55be });
  return cachedHslTriangleRenderer(geometry, hue);
};
`;
  const wrapper = replaceOnce(candidate, portSymbols('const triangle = createTriangleCanvas(_0xf774fa, hue);', version),
    portSymbols('const triangle = drawCachedHslTriangle(_0xf774fa, hue);', version));
  return replaceOnce(wrapper, insertBefore, portSymbols(declaration, version) + insertBefore);
}

function between(source, startMarker, endMarker) {
  const start = source.indexOf(startMarker);
  const end = source.indexOf(endMarker, start + startMarker.length);
  assert(start >= 0 && end > start);
  return source.slice(start, end);
}

function runFixture(baseline, rendererSource, decoder, version, hslToRgb) {
  const includeKernel = hslToRgb !== undefined;
  const candidate = rendererSource !== baseline;
  const functions = between(rendererSource, candidate ? 'colorWheelTextureState = ' : 'createColorWheelRenderer = ',
    '}, updatePreviewIndicator =');
  const kernelText = includeKernel ? between(rendererSource, 'const RENDER_SCALE = ', portSymbols('const _0x420403 = _0x4547;', version)) : '';
  const state = { hue: 0, size: 210, dpr: 1, orientation: true };
  const count = { ring: 0, triangle: 0, sqrt: 0, square: 0, forces: 0 };
  const view = new class NodeMock {
    constructor(initial) { Object.assign(this, initial); }
    set(state) { Object.assign(this, state); }
    add() {}
    requestRender() {}
    forceRender() { count.forces++; }
  }();
  const NodeMock = view.constructor;
  const environment = {
    getColorWheelGeometry$1() {
      const outerRadius = state.size / 2 - 12;
      const innerRadius = outerRadius - (state.size === 210 ? 20 : 28);
      return { outerRadius, innerRadius, centerAreaRadius: innerRadius - 6, squareSize: 75,
        centerX: state.size / 2, centerY: state.size / 2 + 12 };
    },
    getHslTriangleDisplaySize: geometry => Math.round(geometry.innerRadius * 2.25),
    getColorWheelRenderScale: () => state.dpr,
    isPSHueRing: () => state.orientation,
    createHueRingCanvas(geometry, size, application) { count.ring++; return { size, application }; },
    createTriangleCanvas(geometry, hue) { count.triangle++; return { geometry, hue }; },
    createHsvSquareNodes() { return { hsvSquare: new NodeMock() }; },
    createPreviewRingCanvas() { return {}; },
    drawHiDpiSourceCanvas(node, canvas, size) { node.set({ pixels: canvas, width: size }); },
    drawSourceCanvas$1() {},
    createCanvasNode$1: () => new NodeMock(),
    createHiDpiCanvasNode: canvas => new NodeMock({ pixels: canvas }),
    getCenterIndicatorScale: () => ({}), getHueIndicatorPosition: () => ({}),
    getCenterIndicatorPosition: () => ({}), getCenterIndicatorSize: () => ({}), getHueIndicatorSize: () => ({}),
    updateHsvSquareNodes(renderer, geometry, hue) { count.square++; renderer.hsvSquare.set({ hue }); },
    _0x2f7e0a: { get value() { return state.hue; } }, _0x3e927c: { get value() { return state.size; } },
    _0x405308: { get value() { return state.size - 22; } },
    _0x5cbff4: { value: 100 }, _0x47f3f0: { value: 50 }, _0x27b731: { value: 100 }, _0x372488: { value: 50 },
    COLOR_WHEEL_CANVAS_EXTRA$1: 22,
    hi$1: NodeMock, xe$1: NodeMock, ve$1: NodeMock, Se$1: NodeMock, ze$1: NodeMock,
    Math: Object.assign(Object.create(Math), { sqrt(value) { count.sqrt++; return Math.sqrt(value); } }),
    _0x3b55be: hslToRgb,
    document: {
      createElement() {
        return { getContext() { return {
          createImageData(w, h) { count.triangle++; return { data: new Uint8ClampedArray(w * h * 4) }; },
          putImageData() {},
        }; } };
      },
    },
  };
  const bindings = Object.fromEntries(Object.entries(environment).map(([name, value]) => [portSymbols(name, version), value]));
  const { createColorWheelRenderer, updateColorWheelRenderer } = vm.runInNewContext(`
${decoder}
${kernelText}
const ${functions}};
({ createColorWheelRenderer, updateColorWheelRenderer });`, bindings, { timeout: 3000 });

  const snapshots = [];
  const renderer = createColorWheelRenderer(view, 300, 'hsv');
  function record(step, mode, render = true) {
    if (render) updateColorWheelRenderer(renderer, mode, true);
    assert.equal(renderer.hslTriangle.visible, mode === 'hsl');
    assert.equal(renderer.hsvSquare.visible, mode === 'hsv');
    snapshots.push({ step, ...count });
  }
  record('open HSV', 'hsv', false);
  state.hue = 23;
  record('HSV hue changed', 'hsv');
  record('duplicate HSV redraw', 'hsv');
  updateColorWheelRenderer(renderer, 'hsl', false);
  record('switch to HSL', 'hsl', false);
  state.hue = 71;
  record('HSL hue changed', 'hsl');
  record('duplicate HSL redraw', 'hsl');
  state.orientation = false;
  record('Photoshop orientation changed', 'hsl');
  assert.equal(renderer.hueRing.pixels.application, false);
  state.dpr = 1.5;
  record('DPI changed', 'hsl');
  state.size = 290;
  record('panel size changed', 'hsl');
  state.hue = 182;
  record('new hidden triangle hue', 'hsv');
  updateColorWheelRenderer(renderer, 'hsl', false);
  record('switch back to HSL', 'hsl', false);
  if (!includeKernel && candidate) assert.equal(renderer.hslTriangle.pixels.hue, 182);
  if (includeKernel) assert.equal(renderer.hslTriangle.pixels.width, 708);

  const second = createColorWheelRenderer(new NodeMock(), 300, 'hsl');
  assert.equal(second.hslTriangle.visible, true);
  assert(second.hslTriangle.pixels);
  snapshots.push({ step: 'recreate renderer in HSL', ...count });
  return snapshots;
}


function verifyRendererCandidate(baseline, textureCandidate, combined, archivePath, version) {
  const rotation = between(baseline, portSymbols('const _0x420403 = ', version), 'import {');
  const decoder = `${rotation}\n${between(baseline, portSymbols('function _0x4547(', version), '\n}')}}\n${between(baseline, portSymbols('function _0x25d7(', version), '\n}')}}`;
  const original = runFixture(baseline, baseline, decoder, version);
  const optimized = runFixture(baseline, textureCandidate, decoder, version);
  const optimizedWithCache = runFixture(baseline, combined, decoder, version, readHslToRgb(archivePath, version));
  assert.deepEqual(optimized.map(({ ring }) => ring), [1, 1, 1, 1, 1, 1, 2, 3, 4, 4, 4, 5]);
  assert.deepEqual(optimized.map(({ triangle }) => triangle), [0, 0, 0, 1, 2, 2, 2, 2, 3, 3, 4, 5]);
  assert.deepEqual(optimizedWithCache.map(({ triangle }) => triangle), optimized.map(({ triangle }) => triangle));
  assert.deepEqual(optimizedWithCache.map(({ sqrt }) => sqrt), [0, 0, 0, 1, 1, 1, 1, 1, 2, 2, 2, 2]);
  assert.deepEqual(optimized.map(({ forces }) => forces), original.map(({ forces }) => forces));
  return { original: original.at(-1), optimized: optimizedWithCache.at(-1) };
}

if (require.main === module) {
  assert(process.argv.length <= 3, 'Usage: node tourbox-renderer-test.cjs [original-asar]');
  const archivePath = process.argv[2] ?? installedArchive;
  const version = detectVersion(fs.readFileSync(archivePath));
  const baseline = readActiveRenderer(archivePath, version);
  const textureCandidate = createRendererCandidate(baseline, version);
  const kernel = fs.readFileSync(path.join(__dirname, 'tourbox-hsl-triangle.mjs'), 'utf8');
  const combined = addTriangleCache(textureCandidate, kernel, version);
  const counts = verifyRendererCandidate(baseline, textureCandidate, combined, archivePath, version);
  console.log(JSON.stringify({ version: version.version, checksPassed: true, counts }, null, 2));
}

module.exports = { readActiveRenderer, createRendererCandidate, addTriangleCache, readHslToRgb,
  verifyRendererCandidate, installedArchive, detectVersion, replaceOnce };
