process.noAsar = true;

const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const {
  addTriangleCache, createRendererCandidate, detectVersion, installedArchive, readActiveRenderer,
  replaceOnce, verifyRendererCandidate,
} = require('./tourbox-renderer-test.cjs');

function sha256(bytes) {
  return crypto.createHash('sha256').update(bytes).digest('hex');
}

function readArchive(bytes) {
  assert(bytes.length >= 16 && bytes.readUInt32LE(0) === 4, 'Unsupported ASAR header');
  const dataStart = 8 + bytes.readUInt32LE(4);
  const headerEnd = 16 + bytes.readUInt32LE(12);
  assert(headerEnd <= dataStart && dataStart <= bytes.length, 'Invalid ASAR data boundary');
  const header = JSON.parse(bytes.subarray(16, headerEnd));
  const files = new Map();

  function visit(entries, prefix) {
    for (const [name, entry] of Object.entries(entries)) {
      const fullName = prefix + name;
      if (entry.files) visit(entry.files, fullName + '/');
      else files.set(fullName, entry);
    }
  }

  visit(header.files, '');
  const data = bytes.subarray(dataStart);
  function readEntry(entry) {
    const offset = Number(entry.offset);
    assert(Number.isSafeInteger(offset) && offset >= 0 && Number.isSafeInteger(entry.size) &&
      entry.size >= 0 && offset + entry.size <= data.length, 'Invalid packed entry');
    return data.subarray(offset, offset + entry.size);
  }

  return { header, files, data, readEntry };
}

function serializeHeader(header) {
  const json = Buffer.from(JSON.stringify(header));
  const paddedLength = Math.ceil(json.length / 4) * 4;
  const prefix = Buffer.alloc(16 + paddedLength);
  prefix.writeUInt32LE(4, 0);
  prefix.writeUInt32LE(paddedLength + 8, 4);
  prefix.writeUInt32LE(paddedLength + 4, 8);
  prefix.writeUInt32LE(json.length, 12);
  json.copy(prefix, 16);
  return prefix;
}

function replaceRenderer(originalBytes, targetName, renderer) {
  const archive = readArchive(originalBytes);
  const target = archive.files.get(targetName);
  assert(target && !target.unpacked && target.integrity?.algorithm === 'SHA256');
  const offset = Number(target.offset);
  const end = offset + target.size;
  assert.equal(sha256(archive.readEntry(target)), target.integrity.hash);
  const displacement = renderer.length - target.size;

  for (const entry of archive.files.values()) {
    if (entry === target || entry.offset === undefined) continue;
    const start = Number(entry.offset);
    assert(start + entry.size <= offset || start >= end, 'Renderer overlaps a different ASAR entry');
    if (start >= end) entry.offset = String(start + displacement);
  }

  const blockSize = target.integrity.blockSize;
  assert(Number.isSafeInteger(blockSize) && blockSize > 0);
  const blocks = [];
  for (let start = 0; start < renderer.length; start += blockSize) {
    blocks.push(sha256(renderer.subarray(start, start + blockSize)));
  }
  target.size = renderer.length;
  target.integrity = { algorithm: 'SHA256', hash: sha256(renderer), blockSize, blocks };
  return Buffer.concat([serializeHeader(archive.header), archive.data.subarray(0, offset), renderer,
    archive.data.subarray(end)]);
}

function verifyArchive(originalBytes, modifiedBytes, targetName, renderer) {
  const original = readArchive(originalBytes);
  const modified = readArchive(modifiedBytes);
  assert.deepEqual([...original.files.keys()], [...modified.files.keys()]);
  for (const [name, entry] of original.files) {
    const newEntry = modified.files.get(name);
    if (name === targetName) {
      assert(modified.readEntry(newEntry).equals(renderer));
      assert.equal(newEntry.integrity.hash, sha256(renderer));
    } else if (entry.offset === undefined) {
      assert.deepEqual(newEntry, entry, name);
    } else {
      assert.deepEqual({ ...newEntry, offset: entry.offset }, entry, name);
      assert(original.readEntry(entry).equals(modified.readEntry(newEntry)), name);
    }
  }
  return original.files.size - 1;
}

function patchResidentMode(optimized, version) {
  if (version.version === '5.12.1') {
    const header = 'function handleJavaResidentModeChange(_0x3cec66, _0x180515, _0x375401) {';
    const guard = `function keepColorLabResident(request, config) {
  return request.isResident === false && config?.isResident === true &&
    localStorage.getItem('inkpick.residentLock') !== '0';
}
`;
    let patched = replaceOnce(optimized, header, `${guard}${header}
  if (keepColorLabResident(_0x3cec66, _0x180515)) return;`);
    const hold = '_0x1342e1(_0x5f404c["current"]?.[_0x34a30d(1384)] === !![] && !_0x3a974b["isResident"]),';
    patched = replaceOnce(patched, hold, `if (!keepColorLabResident(_0x3a974b, _0x5f404c.current)) ${hold.slice(0, -1)};
        `);
    verifyResidentMode(patched);
    return patched;
  }
  const call = 'void window["api"][_0x24bba9(2053)]["setResidentMode"](_0x56618b[_0x24bba9(498)], _0x5a0cd4?.[_0x24bba9(1498)]);';
  const guarded = 'if (!(_0x56618b["isResident"] === false && localStorage.getItem("inkpick.residentLock") !== "0" && _0x5a0cd4 && _0x5a0cd4["isResident"] === true)) { ' + call + ' }';
  return replaceOnce(optimized, call, guarded);
}

function verifyResidentMode(patched) {
  const start = patched.indexOf('function keepColorLabResident(');
  const end = patched.indexOf('function ColorPickerWebSocketBridge()', start);
  const handler = patched.slice(start, end);
  const bridgeStart = patched.indexOf('if (!keepColorLabResident(_0x3a974b,');
  const bridgeEnd = patched.indexOf('_0x3f9820 = _0x3a974b;', bridgeStart) + '_0x3f9820 = _0x3a974b;'.length;
  assert(start >= 0 && end > start && bridgeStart >= 0 && bridgeEnd > bridgeStart);
  const names = { 354: 'api', 1437: 'colorPick', 1384: 'isResident', 852: 'mode', 183: 'current', 974: 'peek' };
  const run = new Function('request', 'config', 'lock', `
    const calls = [], localStorage = { getItem: () => lock };
    const _0x4ddd23 = key => names[key], _0x34a30d = _0x4ddd23;
    const names = ${JSON.stringify(names)};
    const window = {api: {colorPick: {setResidentMode: value => calls.push(['native', value])}}};
    const postColorPickerMessage = () => calls.push(['ui']);
    const postColorPickModeChangeToWindow = () => calls.push(['mode']);
    const _0x22186a = () => 'hsl', _0x3491d4 = {undefined: 'hsl'};
    const _0x3a974b = request, _0x5f404c = {current: config}, _0x5c9f12 = {peek: () => false};
    let _0x3f9820;
    const _0x1342e1 = hold => calls.push(['hold', hold]);
    ${handler}
    ${patched.slice(bridgeStart, bridgeEnd)}
    return {calls, acknowledged: _0x3f9820 === request};
  `);
  for (const [resident, requested, lock, hold] of [[true,false,null,null], [true,false,'0',true],
    [false,false,'1',false], [true,true,'1',false], [undefined,false,'1',false]]) {
    const config = resident === undefined ? null : { isResident: resident, mode: 'hsl' };
    const result = run({ isResident: requested }, config, lock);
    assert.equal(result.acknowledged, true);
    assert.deepEqual(result.calls, hold === null ? [] : [['hold',hold],['ui'],['ui'],['native',requested]]);
  }
}

function main() {
  const [sourceArchive, output, ...extra] = process.argv.slice(2);
  assert(sourceArchive && output && extra.length === 0, 'Usage: node build-tourbox-patch.cjs <original-asar> <output-asar>');
  const originalBytes = fs.readFileSync(sourceArchive);
  const version = detectVersion(originalBytes);
  const baseline = readActiveRenderer(sourceArchive, version);
  const textureCandidate = createRendererCandidate(baseline, version);
  const kernel = fs.readFileSync(path.join(__dirname, 'tourbox-hsl-triangle.mjs'), 'utf8');
  const optimized = addTriangleCache(textureCandidate, kernel, version);
  verifyRendererCandidate(baseline, textureCandidate, optimized, sourceArchive, version);
  const toggle = fs.readFileSync(path.join(__dirname, 'resident-inject.js'), 'utf8');
  const combined = patchResidentMode(optimized, version) + '\n\n/* --- InkPick resident lock --- */\n' + toggle + '\n';
  const syntax = spawnSync(process.execPath, ['--input-type=module', '--check'], {
    input: combined, encoding: 'utf8', windowsHide: true,
  });
  if (syntax.error) throw syntax.error;
  assert.equal(syntax.status, 0, syntax.stderr);
  const renderer = Buffer.from(combined);
  const targetName = `out/renderer/assets/${version.renderer}`;
  const modifiedBytes = replaceRenderer(originalBytes, targetName, renderer);
  const untouched = verifyArchive(originalBytes, modifiedBytes, targetName, renderer);
  const digest = sha256(modifiedBytes);
  console.log(`Optimized SHA-256: ${digest}`);
  assert.equal(digest, version.patched, 'Generated patch differs from the tested release');
  const outputDir = fs.realpathSync(path.dirname(path.resolve(output)));
  const installation = path.dirname(installedArchive).toLowerCase();
  assert(outputDir.toLowerCase() !== installation && !outputDir.toLowerCase().startsWith(installation + path.sep),
    'Run the builder from a user folder outside the installation');
  fs.writeFileSync(output, modifiedBytes, { flag: 'wx' });
  console.log(`Source: ${sourceArchive}`);
  console.log(`Built ${output}`);
  console.log(`Verified ${untouched} untouched archive entries.`);
  console.log(`Original SHA-256:  ${version.original}`);
}

try {
  main();
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
