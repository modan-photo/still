import { renderRotatedPreview } from '../../src/render/rotation';
import { renderCroppedPreview } from '../../src/render/crop';
import { renderBorderPreview } from '../../src/render/border';
import { applyAdjustmentsToImageData } from '../../src/render/adjustments';
import { renderWatermarkPreview } from '../../src/render/watermark';
import type { RenderSpec } from '../../src/types/renderSpec';

interface Case {
  id: string;
  sourceFile?: string;
  spec: RenderSpec;
  exact: boolean;
  width: number;
  height: number;
}

async function loadImage(url: string) {
  const image = new Image();
  image.src = url;
  await image.decode();
  return image;
}

// Mirror MainCanvas's full-density render calls with an explicit source-pixel scale.
async function render(image: HTMLImageElement, spec: RenderSpec) {
  let source = renderRotatedPreview(image, spec.rotation);
  if (spec.crop?.enabled) source = renderCroppedPreview(source, spec.crop);
  const width = source instanceof HTMLImageElement ? source.naturalWidth : source.width;
  const height = source instanceof HTMLImageElement ? source.naturalHeight : source.height;
  const layer = document.createElement('canvas');
  layer.width = width;
  layer.height = height;
  const context = layer.getContext('2d')!;
  context.drawImage(source, 0, 0);
  if (spec.adjustments) {
    context.putImageData(
      applyAdjustmentsToImageData(context.getImageData(0, 0, width, height), spec.adjustments),
      0,
      0,
    );
  }
  const canvas = document.createElement('canvas');
  if (spec.border) renderBorderPreview(canvas, layer, spec.border, width, height);
  else {
    canvas.width = width;
    canvas.height = height;
    canvas.getContext('2d')!.drawImage(layer, 0, 0);
  }
  if (spec.watermark) {
    const originalLongEdge = Math.max(spec.source.width, spec.source.height);
    await renderWatermarkPreview(canvas, spec.watermark, originalLongEdge, 1);
  }
  return canvas;
}

async function run() {
  const runId = new URLSearchParams(location.search).get('run');
  if (!runId || !/^render-parity-\d+$/.test(runId))
    throw new Error('Generate fixtures with npm run render:fixtures and open the printed URL.');
  const root = `/verification-output/${runId}/`;
  for (const [family, filename] of [
    ['Noto Sans SC', 'NotoSansSC-VF.ttf'],
    ['Noto Sans Arabic', 'NotoSansArabic-Variable.ttf'],
    ['Noto Emoji', 'NotoEmoji-Variable.ttf'],
  ]) {
    const font = new FontFace(family, `url(/src-tauri/resources/fonts/${filename})`, {
      weight: '100 900',
    });
    document.fonts.add(await font.load());
  }
  const response = await fetch(`${root}manifest.json`);
  if (!response.ok) throw new Error(`Missing manifest: ${response.status}`);
  const cases: Case[] = await response.json();
  const results = [];
  const table = document.createElement('table');
  table.innerHTML =
    '<tr><th>Case</th><th>Mode</th><th>Dimensions</th><th>Different pixels</th><th>Max channel delta</th><th>Mean channel delta</th></tr>';
  document.querySelector('#results')!.append(table);
  for (const item of cases) {
    const image = await loadImage(`${root}${item.sourceFile ?? 'source.png'}`);
    const actual = await render(image, item.spec);
    const reference = await loadImage(`${root}${item.id}.png`);
    const expected = document.createElement('canvas');
    expected.width = reference.naturalWidth;
    expected.height = reference.naturalHeight;
    expected.getContext('2d')!.drawImage(reference, 0, 0);
    const dimensionsMatch = actual.width === item.width && actual.height === item.height;
    let differentPixels = 0;
    let maxDelta = 0;
    let totalDelta = 0;
    let maxPremultipliedDelta = 0;
    let totalPremultipliedDelta = 0;
    if (dimensionsMatch) {
      const a = actual.getContext('2d')!.getImageData(0, 0, actual.width, actual.height).data;
      const b = expected.getContext('2d')!.getImageData(0, 0, expected.width, expected.height).data;
      for (let index = 0; index < a.length; index += 4) {
        let changed = false;
        for (let channel = 0; channel < 4; channel += 1) {
          const delta = Math.abs(a[index + channel] - b[index + channel]);
          maxDelta = Math.max(maxDelta, delta);
          totalDelta += delta;
          // Straight RGB at near-zero alpha exaggerates invisible differences.
          const premultipliedDelta =
            channel === 3
              ? delta
              : Math.abs(
                  Math.round((a[index + channel] * a[index + 3]) / 255) -
                    Math.round((b[index + channel] * b[index + 3]) / 255),
                );
          maxPremultipliedDelta = Math.max(maxPremultipliedDelta, premultipliedDelta);
          totalPremultipliedDelta += premultipliedDelta;
          changed ||= delta !== 0;
        }
        differentPixels += Number(changed);
      }
    }
    const result = {
      id: item.id,
      exact: item.exact,
      dimensionsMatch,
      differentPixels,
      maxDelta,
      meanDelta: dimensionsMatch ? totalDelta / (actual.width * actual.height * 4) : null,
      maxPremultipliedDelta,
      meanPremultipliedDelta: dimensionsMatch
        ? totalPremultipliedDelta / (actual.width * actual.height * 4)
        : null,
      pass: item.exact ? dimensionsMatch && differentPixels === 0 : null,
      alphaBounds:
        item.sourceFile === 'transparent.png'
          ? { canvas: alphaBounds(actual), rust: alphaBounds(expected) }
          : undefined,
    };
    results.push(result);
    const row = table.insertRow();
    for (const value of [
      item.id,
      item.exact ? 'Exact' : 'Review rasterization',
      `${actual.width}×${actual.height} / ${item.width}×${item.height}`,
      differentPixels,
      maxDelta,
      result.meanDelta?.toFixed(4),
    ]) {
      row.insertCell().textContent = String(value);
    }
    const detail = document.createElement('details');
    const label = document.createElement('summary');
    label.textContent = `${item.id} — Canvas / Rust`;
    detail.append(label, actual, reference);
    document.querySelector('#results')!.append(detail);
  }
  document.querySelector('#report')!.textContent = JSON.stringify(
    { runId, userAgent: navigator.userAgent, results },
    null,
    2,
  );
  document.querySelector('#status')!.textContent =
    `${results.length} cases complete; ${results.filter((r) => r.exact && !r.pass).length} exact failures; ${results.filter((r) => !r.dimensionsMatch).length} dimension failures. Rasterization differences require review.`;
}

function alphaBounds(canvas: HTMLCanvasElement) {
  const pixels = canvas.getContext('2d')!.getImageData(0, 0, canvas.width, canvas.height).data;
  let left = canvas.width,
    top = canvas.height,
    right = -1,
    bottom = -1;
  for (let y = 0; y < canvas.height; y += 1) {
    for (let x = 0; x < canvas.width; x += 1) {
      if (pixels[(y * canvas.width + x) * 4 + 3] < 32) continue;
      left = Math.min(left, x);
      top = Math.min(top, y);
      right = Math.max(right, x);
      bottom = Math.max(bottom, y);
    }
  }
  return right < 0 ? null : { left, top, right, bottom };
}

run().catch((error) => {
  document.querySelector('#status')!.textContent = `Failed: ${String(error)}`;
});
