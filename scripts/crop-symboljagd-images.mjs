import { mkdir, readdir, readFile, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { PNG } from "pngjs";

const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const repositoryRoot = path.resolve(packageRoot, "../..");
const sourcePath = path.join(packageRoot, "public/host/card-table/symboljagd-atlas.png");
const outputDirectories = [
  path.join(packageRoot, "public/host/card-table/symboljagd-icons"),
  path.join(packageRoot, "public/controller/card-table/symboljagd-icons"),
  path.join(repositoryRoot, "apps/host/public/card-table/symboljagd-icons"),
  path.join(repositoryRoot, "apps/controller/public/card-table/symboljagd-icons")
];
const mainComponentMinArea = 2_500;

function isBackground(pixelData, offset) {
  const alpha = pixelData[offset + 3];
  return alpha < 12 || (pixelData[offset] >= 246 && pixelData[offset + 1] >= 246 && pixelData[offset + 2] >= 246);
}

function readComponents(image) {
  const { width, height, data } = image;
  const visited = new Uint8Array(width * height);
  const queue = new Int32Array(width * height);
  const components = [];
  const neighbors = [-1, 1, -width, width, -width - 1, -width + 1, width - 1, width + 1];

  for (let start = 0; start < visited.length; start += 1) {
    if (visited[start] || data[start * 4 + 3] < 12) continue;
    let count = 1;
    queue[0] = start;
    visited[start] = 1;
    let sumX = 0;
    let sumY = 0;
    let minX = width;
    let minY = height;
    let maxX = 0;
    let maxY = 0;

    for (let cursor = 0; cursor < count; cursor += 1) {
      const point = queue[cursor];
      const x = point % width;
      const y = Math.floor(point / width);
      sumX += x;
      sumY += y;
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);

      for (const delta of neighbors) {
        const adjacent = point + delta;
        const adjacentX = adjacent % width;
        const adjacentY = Math.floor(adjacent / width);
        if (adjacent < 0 || adjacent >= visited.length || Math.abs(adjacentX - x) > 1 || Math.abs(adjacentY - y) > 1) continue;
        if (visited[adjacent] || data[adjacent * 4 + 3] < 12) continue;
        visited[adjacent] = 1;
        queue[count] = adjacent;
        count += 1;
      }
    }

    components.push({
      area: count,
      centerX: sumX / count,
      centerY: sumY / count,
      minX,
      minY,
      maxX,
      maxY,
      points: queue.slice(0, count)
    });
  }

  return components;
}

function symbolCellFor(x, y, cellWidth, cellHeight) {
  const column = Math.floor(x / cellWidth);
  const row = Math.floor(y / cellHeight);
  return row * 8 + column;
}

function makeCutout(source, components, symbolId) {
  const primary = components.filter((component) => component.area >= mainComponentMinArea && component.symbolId === symbolId);
  if (primary.length !== 1) throw new Error(`Symbol ${symbolId} has ${primary.length} main image components; expected exactly one.`);
  const group = components.filter((component) => component.symbolId === symbolId);
  const points = group.flatMap((component) => Array.from(component.points));
  const bounds = group.reduce((value, component) => ({
    minX: Math.min(value.minX, component.minX), minY: Math.min(value.minY, component.minY),
    maxX: Math.max(value.maxX, component.maxX), maxY: Math.max(value.maxY, component.maxY)
  }), { minX: source.width, minY: source.height, maxX: 0, maxY: 0 });
  const padding = 2;
  const left = bounds.minX - padding;
  const top = bounds.minY - padding;
  const width = bounds.maxX - bounds.minX + padding * 2 + 1;
  const height = bounds.maxY - bounds.minY + padding * 2 + 1;
  const cutout = new PNG({ width, height });

  for (const point of points) {
    const x = point % source.width;
    const y = Math.floor(point / source.width);
    const sourceOffset = point * 4;
    const targetOffset = ((y - top) * width + (x - left)) * 4;
    source.data.copy(cutout.data, targetOffset, sourceOffset, sourceOffset + 4);
  }

  for (let x = 0; x < width; x += 1) {
    if (!isBackground(cutout.data, x * 4) || !isBackground(cutout.data, ((height - 1) * width + x) * 4)) {
      throw new Error(`Symbol ${symbolId} has a non-transparent top or bottom cut edge.`);
    }
  }
  for (let y = 0; y < height; y += 1) {
    if (!isBackground(cutout.data, (y * width) * 4) || !isBackground(cutout.data, (y * width + width - 1) * 4)) {
      throw new Error(`Symbol ${symbolId} has a non-transparent left or right cut edge.`);
    }
  }

  return { cutout, path: { kind: "transparent alpha contour" } };
}

async function writeImages() {
  const source = PNG.sync.read(await readFile(sourcePath));
  const cellWidth = source.width / 8;
  const cellHeight = source.height / 8;
  const components = readComponents(source);
  const mainComponents = components.filter((component) => component.area >= mainComponentMinArea);
  if (mainComponents.length < 56 || mainComponents.length > 57) throw new Error(`Found ${mainComponents.length} main symbols; expected 57 or a single pair of touching symbols. No files were replaced.`);

  const occupied = new Set();
  for (const component of mainComponents) {
    const symbolId = symbolCellFor(component.centerX, component.centerY, cellWidth, cellHeight);
    if (symbolId < 0 || symbolId > 56 || occupied.has(symbolId)) {
      throw new Error(`Main image components do not map uniquely to 57 atlas cells (duplicate or out-of-range cell ${symbolId}).`);
    }
    component.symbolId = symbolId;
    occupied.add(symbolId);
  }
  const missingIds = Array.from({ length: 57 }, (_, symbolId) => symbolId).filter((symbolId) => !occupied.has(symbolId));
  if (missingIds.length > 1) throw new Error(`Only ${occupied.size} atlas cells have a main symbol; unable to safely recover ${missingIds.length} missing symbols.`);

  const seeds = [...mainComponents];
  for (const symbolId of missingIds) {
    seeds.push({ symbolId, centerX: (symbolId % 8 + 0.5) * cellWidth, centerY: (Math.floor(symbolId / 8) + 0.5) * cellHeight, area: 0, synthetic: true });
  }
  const nearestSeed = (x, y, candidates = seeds) => candidates.reduce((best, candidate) => {
    const distance = Math.hypot(x - candidate.centerX, y - candidate.centerY);
    return !best || distance < best.distance ? { candidate, distance } : best;
  }, undefined)?.candidate;
  const grouped = Array.from({ length: 57 }, (_, symbolId) => ({ symbolId, points: [] }));
  for (const component of components) {
    if (component.area >= mainComponentMinArea) {
      const adjacentMissing = missingIds.find((symbolId) => {
        const columnGap = Math.abs((symbolId % 8) - (component.symbolId % 8));
        const rowGap = Math.abs(Math.floor(symbolId / 8) - Math.floor(component.symbolId / 8));
        return component.area > 18_000 && columnGap + rowGap === 1 && component.maxY - component.minY > cellHeight * 1.6;
      });
      if (adjacentMissing !== undefined) {
        const ownerSeeds = [
          { ...component, centerX: (component.symbolId % 8 + 0.5) * cellWidth, centerY: (Math.floor(component.symbolId / 8) + 0.5) * cellHeight },
          seeds.find((seed) => seed.symbolId === adjacentMissing)
        ];
        for (const point of component.points) {
          const owner = nearestSeed(point % source.width, Math.floor(point / source.width), ownerSeeds);
          grouped[owner.symbolId].points.push(point);
        }
      } else {
        grouped[component.symbolId].points.push(...component.points);
      }
    } else {
      const owner = nearestSeed(component.centerX, component.centerY);
      if (owner && Math.hypot(component.centerX - owner.centerX, component.centerY - owner.centerY) <= Math.min(cellWidth, cellHeight) * 0.72) {
        grouped[owner.symbolId].points.push(...component.points);
      }
    }
  }

  const symbolComponents = grouped.map(({ symbolId, points }) => {
    if (points.length < mainComponentMinArea) throw new Error(`Symbol ${symbolId} has only ${points.length} source pixels after separating neighboring artwork.`);
    const xs = points.map((point) => point % source.width);
    const ys = points.map((point) => Math.floor(point / source.width));
    return {
      symbolId,
      area: points.length,
      centerX: xs.reduce((sum, x) => sum + x, 0) / points.length,
      centerY: ys.reduce((sum, y) => sum + y, 0) / points.length,
      minX: Math.min(...xs), minY: Math.min(...ys), maxX: Math.max(...xs), maxY: Math.max(...ys), points
    };
  });
  const prepared = symbolComponents.map(({ symbolId }) => makeCutout(source, symbolComponents, symbolId));
  const buffers = prepared.map(({ cutout }) => PNG.sync.write(cutout, { colorType: 6, inputColorType: 6 }));
  for (const directory of outputDirectories) {
    await mkdir(directory, { recursive: true });
    for (let symbolId = 0; symbolId < buffers.length; symbolId += 1) {
      await writeFile(path.join(directory, `${String(symbolId).padStart(2, "0")}.png`), buffers[symbolId]);
    }
    for (const name of await readdir(directory)) {
      if (/^\d{2}\.png$/.test(name) && Number.parseInt(name, 10) >= 57) await unlink(path.join(directory, name));
    }
  }

  console.log(`Prepared 57 individually cut images in ${outputDirectories.length} host/controller asset folders.`);
  console.log(`Every original symbol pixel is retained; touching artwork is split by nearest symbol center, and each crop has transparent outer padding.`);
}

async function verifyImages() {
  for (const directory of outputDirectories) {
    for (let symbolId = 0; symbolId < 57; symbolId += 1) {
      const image = PNG.sync.read(await readFile(path.join(directory, `${String(symbolId).padStart(2, "0")}.png`)));
      for (let x = 0; x < image.width; x += 1) {
        if (!isBackground(image.data, x * 4) || !isBackground(image.data, ((image.height - 1) * image.width + x) * 4)) throw new Error(`Unsafe horizontal edge in ${directory}/${symbolId}.png`);
      }
      for (let y = 0; y < image.height; y += 1) {
        if (!isBackground(image.data, y * image.width * 4) || !isBackground(image.data, (y * image.width + image.width - 1) * 4)) throw new Error(`Unsafe vertical edge in ${directory}/${symbolId}.png`);
      }
    }
  }
  console.log(`Verified 228 finished images. Every crop edge is transparent or near-white.`);
}

if (process.argv.includes("--verify")) await verifyImages();
else await writeImages();
