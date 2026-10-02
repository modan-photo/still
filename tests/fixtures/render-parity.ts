import { renderRotatedPreview } from '../../src/render/rotation';
import { renderCroppedPreview } from '../../src/render/crop';
import { renderBorderPreview } from '../../src/render/border';
import { applyAdjustmentsToImageData } from '../../src/render/adjustments';
import { renderWatermarkPreview } from '../../src/render/watermark';
import type { RenderSpec } from '../../src/types/renderSpec';

interface Case {
  id: string;
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

// Mirror MainCanvas's full-density render calls, including its crop watermark adapter.
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
    const watermark =
      spec.crop?.enabled && spec.watermark.font?.sizeUnit === 'percent'
        ? {
            ...spec.watermark,
            font: {
              ...spec.watermark.font,
              sizeUnit: 'px' as const,
              size: (originalLongEdge * spec.watermark.font.size) / 100,
            },
          }
        : spec.watermark;
    await renderWatermarkPreview(
      canvas,
      watermark,
      spec.crop?.enabled ? Math.max(canvas.width, canvas.height) : originalLongEdge,
    );
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
  const image = await loadImage(`${root}source.png`);
  const results = [];
  const table = document.createElement('table');
  table.innerHTML =
    '<tr><th>Case</th><th>Mode</th><th>Dimensions</th><th>Different pixels</th><th>Max channel delta</th><th>Mean channel delta</th></tr>';
  document.querySelector('#results')!.append(table);
  for (const item of cases) {
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
    if (dimensionsMatch) {
      const a = actual.getContext('2d')!.getImageData(0, 0, actual.width, actual.height).data;
      const b = expected.getContext('2d')!.getImageData(0, 0, expected.width, expected.height).data;
      for (let index = 0; index < a.length; index += 4) {
        let changed = false;
        for (let channel = 0; channel < 4; channel += 1) {
          const delta = Math.abs(a[index + channel] - b[index + channel]);
          maxDelta = Math.max(maxDelta, delta);
          totalDelta += delta;
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
      pass: item.exact ? dimensionsMatch && differentPixels === 0 : null,
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

run().catch((error) => {
  document.querySelector('#status')!.textContent = `Failed: ${String(error)}`;
});
