const RENDER_SCALE = 3;
const EDGE_SAMPLES = [[0.25, 0.25], [0.75, 0.25], [0.25, 0.75], [0.75, 0.75]];

function sampleTriangle(size, radius) {
  const center = size / 2;
  const halfHeight = Math.sqrt(3) / 2 * radius;
  const left = center - 0.5 * radius;
  const right = center + radius;
  const top = center - halfHeight;
  const bottom = center + halfHeight;
  const rightX = right - left;
  const rightY = center - top;
  const bottomY = bottom - top;
  const rightDot = rightX * rightX + rightY * rightY;
  const crossDot = rightY * bottomY;
  const bottomDot = bottomY * bottomY;
  const denominator = rightDot * bottomDot - crossDot * crossDot;

  // Only scan pixels whose subpixel samples can touch the triangle.
  const xMin = Math.max(0, Math.floor(left) - 1);
  const xMax = Math.min(size - 1, Math.ceil(right));
  const yMin = Math.max(0, Math.floor(top) - 1);
  const yMax = Math.min(size - 1, Math.ceil(bottom));
  const capacity = (xMax - xMin + 1) * (yMax - yMin + 1);
  const offsets = new Uint32Array(capacity);
  const saturation = new Float64Array(capacity);
  const lightness = new Float64Array(capacity);
  const opacity = new Uint8Array(capacity);
  let count = 0;

  for (let y = yMin; y <= yMax; y++) {
    for (let x = xMin; x <= xMax; x++) {
      let coverage = 0;
      let alphaTotal = 0;
      let betaTotal = 0;
      for (const [sampleX, sampleY] of EDGE_SAMPLES) {
        const dx = x + sampleX - left;
        const dy = y + sampleY - top;
        const rightProjection = dx * rightX + dy * rightY;
        const bottomProjection = dy * bottomY;
        const beta = (bottomDot * rightProjection - crossDot * bottomProjection) / denominator;
        const gamma = (rightDot * bottomProjection - crossDot * rightProjection) / denominator;
        const alpha = 1 - beta - gamma;
        if (alpha >= 0 && beta >= 0 && gamma >= 0) {
          coverage++;
          alphaTotal += alpha;
          betaTotal += beta;
        }
      }
      if (coverage === 0) continue;

      const alpha = alphaTotal / coverage;
      const beta = betaTotal / coverage;
      offsets[count] = (y * size + x) * 4;
      // Preserve the original arithmetic before rounding to 8-bit RGB.
      saturation[count] = (beta * 100) / 100;
      lightness[count] = ((alpha + beta * 0.5) * 100) / 100;
      opacity[count] = Math.round(coverage / EDGE_SAMPLES.length * 255);
      count++;
    }
  }

  return {
    size,
    radius,
    offsets: offsets.slice(0, count),
    saturation: saturation.slice(0, count),
    lightness: lightness.slice(0, count),
    opacity: opacity.slice(0, count),
  };
}

/**
 * Experimental replacement for the TourBox Console 5.12.0 Beta10.1 HSL triangle painter.
 * Create one instance per renderer with its existing hslToRgb(hue, saturation, lightness).
 * Hue is in degrees. Saturation and lightness are in [0, 1].
 * The returned function accepts the existing wheel geometry and hue, and returns a canvas.
 */
export function createHslTriangleRenderer({ hslToRgb, document = globalThis.document }) {
  let cache;

  return function drawHslTriangle({ innerRadius, centerAreaRadius }, hue) {
    const size = Math.round(innerRadius * 2.25) * RENDER_SCALE;
    const radius = centerAreaRadius * RENDER_SCALE;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const context = canvas.getContext('2d');
    if (!context) return null;

    if (cache?.size !== size || cache?.radius !== radius) {
      cache = sampleTriangle(size, radius);
    }

    const { offsets, saturation, lightness, opacity } = cache;
    const image = context.createImageData(size, size);
    const pixels = image.data;
    for (let i = 0; i < offsets.length; i++) {
      const [r, g, b] = hslToRgb(hue, saturation[i], lightness[i]);
      const offset = offsets[i];
      pixels[offset] = Math.round(r);
      pixels[offset + 1] = Math.round(g);
      pixels[offset + 2] = Math.round(b);
      pixels[offset + 3] = opacity[i];
    }
    context.putImageData(image, 0, 0);
    return canvas;
  };
}
