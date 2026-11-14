// For the verified TourBox Console 5.12.0 Beta10.1 Windows build. Node.js 20 or later.
// Keep beside tourbox-hsl-triangle.mjs in this workspace's outputs directory.
// node .\outputs\tourbox-renderer-test.cjs          Run the isolated renderer checks.
// node .\outputs\tourbox-renderer-test.cjs --emit   Also generate work\render_review\color-pick-candidate.mjs.
// This script reads TourBox's installation. It only writes the optional workspace scratch file.

const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const rendererFilename = 'color-pick-CsEO1ybR.js';
const rendererBaselineSha256 = '6b928f0296933e5aae0c3988ec95d0cec11e34aa5add95bbdcdd39f8a95a63f3';
const hooksSha256 = 'd29505bcad7b049ccfdf9c92d17b2b9c2e417374042f11cd572f3c5ff5418115';
const installedArchive = path.join(process.env.ProgramFiles, 'TourBox Console', 'app', 'resources', 'app.asar');

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

function readActiveRenderer(archivePath) {
  const { html, asset } = readArchiveParts(archivePath);
  assert(html.includes(`./assets/${rendererFilename}`), 'Packaged color-picker HTML uses a different renderer');
  return asset(rendererFilename, rendererBaselineSha256);
}

function readHslToRgb(archivePath) {
  const hooks = readArchiveParts(archivePath).asset('hooks-Fzz7vV7n.js', hooksSha256);
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

function createRendererCandidate(baseline) {
  assert.equal(sha256(baseline), rendererBaselineSha256, 'Renderer differs from the tested baseline');
  const beforeStart = '  if (_0x5dc959) {\n    const _0x47a3ed';
  const beforeEnd = '  _0x23cf0d[_0x44aadf(1476)][_0x44aadf(562)]';
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
  let candidate = replaceOnce(baseline, baseline.slice(start, end), after);
  candidate = replaceOnce(candidate, '}, createColorWheelRenderer = (',
    '}, colorWheelTextureState = new WeakMap(), createColorWheelRenderer = (');
  candidate = replaceOnce(candidate,
    '  const _0x3f8576 = createTriangleCanvas(_0x57cd7b, _0x2f7e0a[_0x4bef59(1147)]), _0x38af98 = getHslTriangleDisplaySize(_0x57cd7b), _0x1d71c8 = createHiDpiCanvasNode(_0x3f8576, _0x38af98, _0x38af98, _0x38af98);',
    '  const _0x38af98 = getHslTriangleDisplaySize(_0x57cd7b), _0x1d71c8 = new hi$1({ width: _0x38af98, height: _0x38af98, hitSelf: false, hitChildren: false, smooth: true });');
  candidate = replaceOnce(candidate,
    '  return updateColorWheelRenderer(_0x534239, _0x3d9106, ![]),',
    `  colorWheelTextureState.set(_0x534239, {
    x: _0x57cd7b.centerX, y: _0x57cd7b.centerY,
    outerRadius: _0x57cd7b.outerRadius, innerRadius: _0x57cd7b.innerRadius,
    centerRadius: _0x57cd7b.centerAreaRadius, squareSize: _0x57cd7b.squareSize,
    wheelSize: _0x10ae00, ratio: getColorWheelRenderScale(),
    photoshopOrientation: isPSHueRing(), squareHue: _0x2f7e0a.value,
  });
  return updateColorWheelRenderer(_0x534239, _0x3d9106, ![]),`);
  return candidate;
}

function addTriangleCache(candidate, moduleSource) {
  const exportLine = 'export function createHslTriangleRenderer';
  assert(moduleSource.includes(exportLine), 'Triangle module export changed');
  assert(!candidate.includes('cachedHslTriangleRenderer'));
  const insertBefore = 'const _0x420403 = _0x4547;';
  const declaration = `${moduleSource.replace(exportLine, 'function createHslTriangleRenderer')}
let cachedHslTriangleRenderer;
const drawCachedHslTriangle = (geometry, hue) => {
  cachedHslTriangleRenderer ??= createHslTriangleRenderer({ hslToRgb: _0x3b55be });
  return cachedHslTriangleRenderer(geometry, hue);
};
`;
  const wrapper = replaceOnce(candidate, 'const triangle = createTriangleCanvas(_0xf774fa, hue);',
    'const triangle = drawCachedHslTriangle(_0xf774fa, hue);');
  return replaceOnce(wrapper, insertBefore, declaration + insertBefore);
}

function between(source, startMarker, endMarker) {
  const start = source.indexOf(startMarker);
  const end = source.indexOf(endMarker, start + startMarker.length);
  assert(start >= 0 && end > start);
  return source.slice(start, end);
}

function runFixture(baseline, rendererSource, decoder, hslToRgb) {
  const includeKernel = hslToRgb !== undefined;
  const candidate = rendererSource !== baseline;
  const functions = between(rendererSource, candidate ? 'colorWheelTextureState = ' : 'createColorWheelRenderer = ',
    '}, updatePreviewIndicator =');
  const kernelText = includeKernel ? between(rendererSource, 'const RENDER_SCALE = ', 'const _0x420403 = _0x4547;') : '';
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
  const { createColorWheelRenderer, updateColorWheelRenderer } = vm.runInNewContext(`
${decoder}
${kernelText}
const ${functions}};
({ createColorWheelRenderer, updateColorWheelRenderer });`, {
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
  });

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


function verifyRendererCandidate(baseline, textureCandidate, combined, archivePath = installedArchive) {
  const rotation = between(baseline, 'const _0x420403 = ', 'import {');
  const decoder = `${rotation}\n${between(baseline, 'function _0x4547(', '\n}')}}\n${between(baseline, 'function _0x25d7(', '\n}')}}`;
  const original = runFixture(baseline, baseline, decoder);
  const optimized = runFixture(baseline, textureCandidate, decoder);
  const optimizedWithCache = runFixture(baseline, combined, decoder, readHslToRgb(archivePath));
  assert.deepEqual(optimized.map(({ ring }) => ring), [1, 1, 1, 1, 1, 1, 2, 3, 4, 4, 4, 5]);
  assert.deepEqual(optimized.map(({ triangle }) => triangle), [0, 0, 0, 1, 2, 2, 2, 2, 3, 3, 4, 5]);
  assert.deepEqual(optimizedWithCache.map(({ triangle }) => triangle), optimized.map(({ triangle }) => triangle));
  assert.deepEqual(optimizedWithCache.map(({ sqrt }) => sqrt), [0, 0, 0, 1, 1, 1, 1, 1, 2, 2, 2, 2]);
  assert.deepEqual(optimized.map(({ forces }) => forces), original.map(({ forces }) => forces));
  return { original: original.at(-1), optimized: optimizedWithCache.at(-1) };
}

function emitScratchFile(candidate) {
  const outputs = fs.realpathSync(__dirname);
  assert.equal(path.basename(outputs).toLowerCase(), 'outputs', 'Keep the script in its workspace outputs folder');
  const workspace = path.dirname(outputs);
  const programFiles = [process.env.ProgramFiles, process.env['ProgramFiles(x86)'], process.env.ProgramW6432]
    .filter(Boolean).map(directory => path.resolve(directory).toLowerCase());
  for (const root of programFiles) {
    assert(workspace.toLowerCase() !== root && !workspace.toLowerCase().startsWith(root + path.sep),
      'The scratch file must be outside Program Files');
  }
  let destination = workspace;
  for (const component of ['work', 'render_review']) {
    destination = path.join(destination, component);
    if (!fs.existsSync(destination)) fs.mkdirSync(destination);
    assert.equal(fs.realpathSync(destination).toLowerCase(), destination.toLowerCase(),
      'The scratch folder must stay inside the workspace');
  }
  const output = path.join(destination, 'color-pick-candidate.mjs');
  fs.writeFileSync(output, candidate, { flag: 'wx' });
  return output;
}

if (require.main === module) {
  const flags = process.argv.slice(2);
  assert(flags.length === 0 || (flags.length === 1 && flags[0] === '--emit'), 'Usage: node tourbox-renderer-test.cjs [--emit]');
  const baseline = readActiveRenderer(installedArchive);
  const textureCandidate = createRendererCandidate(baseline);
  const kernel = fs.readFileSync(path.join(__dirname, 'tourbox-hsl-triangle.mjs'), 'utf8');
  const combined = addTriangleCache(textureCandidate, kernel);
  const counts = verifyRendererCandidate(baseline, textureCandidate, combined);
  const emitted = flags.length ? emitScratchFile(combined) : undefined;
  console.log(JSON.stringify({ checksPassed: true, baselineSha256: sha256(baseline), candidateSha256: sha256(combined),
    counts, emitted }, null, 2));
}

module.exports = { readActiveRenderer, createRendererCandidate, addTriangleCache, readHslToRgb,
  verifyRendererCandidate, installedArchive };
