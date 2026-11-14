process.noAsar = true;

const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const {
  addTriangleCache, createRendererCandidate, installedArchive, readActiveRenderer, verifyRendererCandidate,
} = require('./tourbox-renderer-test.cjs');

const originalArchiveHash = 'b6af1d346bac18f61db88911195f23152c393cf2f1246f2d9aabbfa6a375eb1f';
const releaseHash = '833870ed28c1783b79b1126f33f5dde947a81ac473870052bb95327610f65303';
const targetName = 'out/renderer/assets/color-pick-CsEO1ybR.js';

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

function replaceRenderer(originalBytes, renderer) {
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

function verifyArchive(originalBytes, modifiedBytes, renderer) {
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

function main() {
  const [sourceArchive, output, ...extra] = process.argv.slice(2);
  assert(sourceArchive && output && extra.length === 0, 'Usage: node build-tourbox-patch.cjs <original-asar> <output-asar>');
  const originalBytes = fs.readFileSync(sourceArchive);
  assert.equal(sha256(originalBytes), originalArchiveHash, 'This patch requires the tested TourBox 5.12.0 Beta10.1 build');
  const baseline = readActiveRenderer(sourceArchive);
  const textureCandidate = createRendererCandidate(baseline);
  const kernel = fs.readFileSync(path.join(__dirname, 'tourbox-hsl-triangle.mjs'), 'utf8');
  const optimized = addTriangleCache(textureCandidate, kernel);
  verifyRendererCandidate(baseline, textureCandidate, optimized, sourceArchive);
  const call = 'void window["api"][_0x24bba9(2053)]["setResidentMode"](_0x56618b[_0x24bba9(498)], _0x5a0cd4?.[_0x24bba9(1498)]);';
  assert.equal(optimized.split(call).length, 2, 'Unexpected resident-mode call count');
  const guarded = 'if (!(_0x56618b["isResident"] === false && localStorage.getItem("inkpick.residentLock") !== "0" && _0x5a0cd4 && _0x5a0cd4["isResident"] === true)) { ' + call + ' }';
  const toggle = fs.readFileSync(path.join(__dirname, 'resident-inject.js'), 'utf8');
  const combined = optimized.replace(call, () => guarded) + '\n\n/* --- InkPick resident lock --- */\n' + toggle + '\n';
  const syntax = spawnSync(process.execPath, ['--input-type=module', '--check'], {
    input: combined, encoding: 'utf8', windowsHide: true,
  });
  if (syntax.error) throw syntax.error;
  assert.equal(syntax.status, 0, syntax.stderr);
  const renderer = Buffer.from(combined);
  const modifiedBytes = replaceRenderer(originalBytes, renderer);
  const untouched = verifyArchive(originalBytes, modifiedBytes, renderer);
  assert.equal(sha256(modifiedBytes), releaseHash, 'Generated patch differs from the tested release');
  const outputDir = fs.realpathSync(path.dirname(path.resolve(output)));
  const installation = path.dirname(installedArchive).toLowerCase();
  assert(outputDir.toLowerCase() !== installation && !outputDir.toLowerCase().startsWith(installation + path.sep),
    'Run the builder from a user folder outside the installation');
  fs.writeFileSync(output, modifiedBytes, { flag: 'wx' });
  console.log(`Source: ${sourceArchive}`);
  console.log(`Built ${output}`);
  console.log(`Verified ${untouched} untouched archive entries.`);
  console.log(`Original SHA-256:  ${originalArchiveHash}`);
  console.log(`Optimized SHA-256: ${sha256(modifiedBytes)}`);
}

try {
  main();
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
