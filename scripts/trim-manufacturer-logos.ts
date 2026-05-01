import fs from 'node:fs/promises';
import path from 'node:path';

interface Point {
  x: number;
  y: number;
}

interface Bounds {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

interface ViewBox {
  minX: number;
  minY: number;
  width: number;
  height: number;
}

interface CliOptions {
  dir: string;
  dryRun: boolean;
  padding: number;
  targets: string[];
}

const SVG_ROOT_RE = /<svg\b[^>]*>/;
const PATH_DATA_RE = /\bd="([^"]+)"/g;
const PATH_TOKEN_RE = /[a-zA-Z]|[-+]?(?:\d*\.\d+|\d+)(?:[eE][-+]?\d+)?/g;
const DEFAULT_PADDING = 0.5;
const CUBIC_SAMPLE_STEPS = 64;
const QUADRATIC_SAMPLE_STEPS = 48;

function createBounds(): Bounds {
  return {
    minX: Number.POSITIVE_INFINITY,
    minY: Number.POSITIVE_INFINITY,
    maxX: Number.NEGATIVE_INFINITY,
    maxY: Number.NEGATIVE_INFINITY,
  };
}

function includePoint(bounds: Bounds, x: number, y: number) {
  if (!Number.isFinite(x) || !Number.isFinite(y)) {
    return;
  }

  bounds.minX = Math.min(bounds.minX, x);
  bounds.minY = Math.min(bounds.minY, y);
  bounds.maxX = Math.max(bounds.maxX, x);
  bounds.maxY = Math.max(bounds.maxY, y);
}

function hasBounds(bounds: Bounds) {
  return Number.isFinite(bounds.minX)
    && Number.isFinite(bounds.minY)
    && Number.isFinite(bounds.maxX)
    && Number.isFinite(bounds.maxY);
}

function lerpPoint(start: Point, end: Point, t: number): Point {
  return {
    x: start.x + (end.x - start.x) * t,
    y: start.y + (end.y - start.y) * t,
  };
}

function sampleLine(bounds: Bounds, start: Point, end: Point) {
  includePoint(bounds, start.x, start.y);
  includePoint(bounds, end.x, end.y);
}

function sampleQuadratic(bounds: Bounds, start: Point, control: Point, end: Point, steps = QUADRATIC_SAMPLE_STEPS) {
  for (let step = 0; step <= steps; step += 1) {
    const t = step / steps;
    const oneMinusT = 1 - t;
    const x = oneMinusT * oneMinusT * start.x
      + 2 * oneMinusT * t * control.x
      + t * t * end.x;
    const y = oneMinusT * oneMinusT * start.y
      + 2 * oneMinusT * t * control.y
      + t * t * end.y;
    includePoint(bounds, x, y);
  }
}

function sampleCubic(
  bounds: Bounds,
  start: Point,
  control1: Point,
  control2: Point,
  end: Point,
  steps = CUBIC_SAMPLE_STEPS,
) {
  for (let step = 0; step <= steps; step += 1) {
    const t = step / steps;
    const oneMinusT = 1 - t;
    const x = oneMinusT ** 3 * start.x
      + 3 * oneMinusT ** 2 * t * control1.x
      + 3 * oneMinusT * t * t * control2.x
      + t ** 3 * end.x;
    const y = oneMinusT ** 3 * start.y
      + 3 * oneMinusT ** 2 * t * control1.y
      + 3 * oneMinusT * t * t * control2.y
      + t ** 3 * end.y;
    includePoint(bounds, x, y);
  }
}

function vectorAngle(ux: number, uy: number, vx: number, vy: number) {
  const dot = ux * vx + uy * vy;
  const len = Math.hypot(ux, uy) * Math.hypot(vx, vy);
  if (!len) {
    return 0;
  }

  const normalized = Math.min(1, Math.max(-1, dot / len));
  const angle = Math.acos(normalized);
  const cross = ux * vy - uy * vx;
  return cross < 0 ? -angle : angle;
}

function sampleArc(
  bounds: Bounds,
  start: Point,
  rxInput: number,
  ryInput: number,
  rotation: number,
  largeArcFlag: boolean,
  sweepFlag: boolean,
  end: Point,
) {
  let rx = Math.abs(rxInput);
  let ry = Math.abs(ryInput);

  if (!rx || !ry || (start.x === end.x && start.y === end.y)) {
    sampleLine(bounds, start, end);
    return;
  }

  const phi = rotation * (Math.PI / 180);
  const cosPhi = Math.cos(phi);
  const sinPhi = Math.sin(phi);

  const dx = (start.x - end.x) / 2;
  const dy = (start.y - end.y) / 2;
  const x1p = cosPhi * dx + sinPhi * dy;
  const y1p = -sinPhi * dx + cosPhi * dy;

  const lambda = (x1p * x1p) / (rx * rx) + (y1p * y1p) / (ry * ry);
  if (lambda > 1) {
    const scale = Math.sqrt(lambda);
    rx *= scale;
    ry *= scale;
  }

  const rxSq = rx * rx;
  const rySq = ry * ry;
  const x1pSq = x1p * x1p;
  const y1pSq = y1p * y1p;
  const denominator = rxSq * y1pSq + rySq * x1pSq;

  if (!denominator) {
    sampleLine(bounds, start, end);
    return;
  }

  const numerator = Math.max(0, (rxSq * rySq) - (rxSq * y1pSq) - (rySq * x1pSq));
  const factor = (largeArcFlag === sweepFlag ? -1 : 1) * Math.sqrt(numerator / denominator);
  const cxp = factor * ((rx * y1p) / ry);
  const cyp = factor * (-(ry * x1p) / rx);

  const centerX = cosPhi * cxp - sinPhi * cyp + ((start.x + end.x) / 2);
  const centerY = sinPhi * cxp + cosPhi * cyp + ((start.y + end.y) / 2);

  const ux = (x1p - cxp) / rx;
  const uy = (y1p - cyp) / ry;
  const vx = (-x1p - cxp) / rx;
  const vy = (-y1p - cyp) / ry;

  let theta1 = vectorAngle(1, 0, ux, uy);
  let deltaTheta = vectorAngle(ux, uy, vx, vy);

  if (!sweepFlag && deltaTheta > 0) {
    deltaTheta -= Math.PI * 2;
  } else if (sweepFlag && deltaTheta < 0) {
    deltaTheta += Math.PI * 2;
  }

  const steps = Math.max(32, Math.ceil(Math.abs(deltaTheta) / (Math.PI / 24)));
  for (let step = 0; step <= steps; step += 1) {
    const t = step / steps;
    const theta = theta1 + deltaTheta * t;
    const cosTheta = Math.cos(theta);
    const sinTheta = Math.sin(theta);
    const x = centerX + (rx * cosPhi * cosTheta) - (ry * sinPhi * sinTheta);
    const y = centerY + (rx * sinPhi * cosTheta) + (ry * cosPhi * sinTheta);
    includePoint(bounds, x, y);
  }
}

function isCommandToken(token: string | undefined) {
  return !!token && /^[a-zA-Z]$/.test(token);
}

function parsePathBounds(pathData: string, bounds: Bounds) {
  const tokens = pathData.match(PATH_TOKEN_RE) || [];
  let index = 0;
  let command = '';
  let current: Point = { x: 0, y: 0 };
  let subpathStart: Point = { x: 0, y: 0 };
  let prevCubicControl: Point | null = null;
  let prevQuadraticControl: Point | null = null;
  let prevCommand = '';

  const readNumber = () => {
    const token = tokens[index];
    if (!token || isCommandToken(token)) {
      throw new Error(`Unexpected path token while parsing "${pathData.slice(0, 48)}..."`);
    }

    index += 1;
    return Number.parseFloat(token);
  };

  while (index < tokens.length) {
    const token = tokens[index];
    if (isCommandToken(token)) {
      command = token;
      index += 1;
    } else if (!command) {
      throw new Error(`Path data is missing an initial command: "${pathData.slice(0, 48)}..."`);
    }

    const absolute = command === command.toUpperCase();
    const normalizedCommand = command.toUpperCase();

    if (normalizedCommand === 'Z') {
      sampleLine(bounds, current, subpathStart);
      current = { ...subpathStart };
      prevCubicControl = null;
      prevQuadraticControl = null;
      prevCommand = 'Z';
      command = '';
      continue;
    }

    if (normalizedCommand === 'M') {
      let firstMove = true;
      while (!isCommandToken(tokens[index]) && index < tokens.length) {
        const nextX = readNumber();
        const nextY = readNumber();
        const destination = {
          x: absolute ? nextX : current.x + nextX,
          y: absolute ? nextY : current.y + nextY,
        };

        if (firstMove) {
          current = destination;
          subpathStart = destination;
          includePoint(bounds, current.x, current.y);
          prevCommand = 'M';
          firstMove = false;
        } else {
          sampleLine(bounds, current, destination);
          current = destination;
          prevCommand = 'L';
        }

        prevCubicControl = null;
        prevQuadraticControl = null;
      }

      continue;
    }

    while (!isCommandToken(tokens[index]) && index < tokens.length) {
      if (normalizedCommand === 'L') {
        const nextX = readNumber();
        const nextY = readNumber();
        const destination = {
          x: absolute ? nextX : current.x + nextX,
          y: absolute ? nextY : current.y + nextY,
        };
        sampleLine(bounds, current, destination);
        current = destination;
        prevCubicControl = null;
        prevQuadraticControl = null;
        prevCommand = 'L';
        continue;
      }

      if (normalizedCommand === 'H') {
        const nextX = readNumber();
        const destination = {
          x: absolute ? nextX : current.x + nextX,
          y: current.y,
        };
        sampleLine(bounds, current, destination);
        current = destination;
        prevCubicControl = null;
        prevQuadraticControl = null;
        prevCommand = 'H';
        continue;
      }

      if (normalizedCommand === 'V') {
        const nextY = readNumber();
        const destination = {
          x: current.x,
          y: absolute ? nextY : current.y + nextY,
        };
        sampleLine(bounds, current, destination);
        current = destination;
        prevCubicControl = null;
        prevQuadraticControl = null;
        prevCommand = 'V';
        continue;
      }

      if (normalizedCommand === 'C') {
        const control1 = {
          x: absolute ? readNumber() : current.x + readNumber(),
          y: absolute ? readNumber() : current.y + readNumber(),
        };
        const control2 = {
          x: absolute ? readNumber() : current.x + readNumber(),
          y: absolute ? readNumber() : current.y + readNumber(),
        };
        const destination = {
          x: absolute ? readNumber() : current.x + readNumber(),
          y: absolute ? readNumber() : current.y + readNumber(),
        };
        sampleCubic(bounds, current, control1, control2, destination);
        current = destination;
        prevCubicControl = control2;
        prevQuadraticControl = null;
        prevCommand = 'C';
        continue;
      }

      if (normalizedCommand === 'S') {
        const control1 = (prevCommand === 'C' || prevCommand === 'S') && prevCubicControl
          ? {
              x: current.x + (current.x - prevCubicControl.x),
              y: current.y + (current.y - prevCubicControl.y),
            }
          : { ...current };
        const control2 = {
          x: absolute ? readNumber() : current.x + readNumber(),
          y: absolute ? readNumber() : current.y + readNumber(),
        };
        const destination = {
          x: absolute ? readNumber() : current.x + readNumber(),
          y: absolute ? readNumber() : current.y + readNumber(),
        };
        sampleCubic(bounds, current, control1, control2, destination);
        current = destination;
        prevCubicControl = control2;
        prevQuadraticControl = null;
        prevCommand = 'S';
        continue;
      }

      if (normalizedCommand === 'Q') {
        const control = {
          x: absolute ? readNumber() : current.x + readNumber(),
          y: absolute ? readNumber() : current.y + readNumber(),
        };
        const destination = {
          x: absolute ? readNumber() : current.x + readNumber(),
          y: absolute ? readNumber() : current.y + readNumber(),
        };
        sampleQuadratic(bounds, current, control, destination);
        current = destination;
        prevQuadraticControl = control;
        prevCubicControl = null;
        prevCommand = 'Q';
        continue;
      }

      if (normalizedCommand === 'T') {
        const control = (prevCommand === 'Q' || prevCommand === 'T') && prevQuadraticControl
          ? {
              x: current.x + (current.x - prevQuadraticControl.x),
              y: current.y + (current.y - prevQuadraticControl.y),
            }
          : { ...current };
        const destination = {
          x: absolute ? readNumber() : current.x + readNumber(),
          y: absolute ? readNumber() : current.y + readNumber(),
        };
        sampleQuadratic(bounds, current, control, destination);
        current = destination;
        prevQuadraticControl = control;
        prevCubicControl = null;
        prevCommand = 'T';
        continue;
      }

      if (normalizedCommand === 'A') {
        const rx = readNumber();
        const ry = readNumber();
        const rotation = readNumber();
        const largeArcFlag = readNumber() !== 0;
        const sweepFlag = readNumber() !== 0;
        const destination = {
          x: absolute ? readNumber() : current.x + readNumber(),
          y: absolute ? readNumber() : current.y + readNumber(),
        };
        sampleArc(bounds, current, rx, ry, rotation, largeArcFlag, sweepFlag, destination);
        current = destination;
        prevQuadraticControl = null;
        prevCubicControl = null;
        prevCommand = 'A';
        continue;
      }

      throw new Error(`Unsupported SVG path command "${command}"`);
    }
  }
}

function parseViewBox(svgTag: string): ViewBox | null {
  const match = svgTag.match(/\bviewBox="([^"]+)"/);
  if (!match) {
    return null;
  }

  const numbers = match[1].trim().split(/[\s,]+/).map((value) => Number.parseFloat(value));
  if (numbers.length !== 4 || numbers.some((value) => !Number.isFinite(value))) {
    return null;
  }

  return {
    minX: numbers[0],
    minY: numbers[1],
    width: numbers[2],
    height: numbers[3],
  };
}

function clampBoundsToViewBox(bounds: Bounds, viewBox: ViewBox | null) {
  if (!viewBox) {
    return bounds;
  }

  return {
    minX: Math.max(bounds.minX, viewBox.minX),
    minY: Math.max(bounds.minY, viewBox.minY),
    maxX: Math.min(bounds.maxX, viewBox.minX + viewBox.width),
    maxY: Math.min(bounds.maxY, viewBox.minY + viewBox.height),
  };
}

function formatNumber(value: number) {
  const rounded = Number(value.toFixed(3));
  return Number.isInteger(rounded) ? String(rounded) : String(rounded);
}

function formatViewBox(bounds: Bounds) {
  return [
    formatNumber(bounds.minX),
    formatNumber(bounds.minY),
    formatNumber(bounds.maxX - bounds.minX),
    formatNumber(bounds.maxY - bounds.minY),
  ].join(' ');
}

function setSvgAttribute(svgTag: string, name: string, value: string) {
  const attributeRe = new RegExp(`\\s${name}="[^"]*"`);
  if (attributeRe.test(svgTag)) {
    return svgTag.replace(attributeRe, ` ${name}="${value}"`);
  }

  return svgTag.replace('<svg', `<svg ${name}="${value}"`);
}

function buildTargetBounds(bounds: Bounds, padding: number, viewBox: ViewBox | null) {
  const paddedBounds = clampBoundsToViewBox({
    minX: bounds.minX - padding,
    minY: bounds.minY - padding,
    maxX: bounds.maxX + padding,
    maxY: bounds.maxY + padding,
  }, viewBox);

  return {
    minX: paddedBounds.minX,
    minY: paddedBounds.minY,
    maxX: Math.max(paddedBounds.maxX, paddedBounds.minX + 0.001),
    maxY: Math.max(paddedBounds.maxY, paddedBounds.minY + 0.001),
  };
}

function parseCliOptions(argv: string[]): CliOptions {
  const options: CliOptions = {
    dir: path.resolve(process.cwd(), 'public/rsi-manufacturers'),
    dryRun: false,
    padding: DEFAULT_PADDING,
    targets: [],
  };

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];

    if (argument === '--dry-run') {
      options.dryRun = true;
      continue;
    }

    if (argument === '--dir') {
      options.dir = path.resolve(process.cwd(), argv[index + 1] || options.dir);
      index += 1;
      continue;
    }

    if (argument === '--padding') {
      const nextValue = Number.parseFloat(argv[index + 1] || '');
      if (!Number.isFinite(nextValue) || nextValue < 0) {
        throw new Error(`Invalid --padding value: ${argv[index + 1] || '(missing)'}`);
      }
      options.padding = nextValue;
      index += 1;
      continue;
    }

    options.targets.push(path.resolve(process.cwd(), argument));
  }

  return options;
}

async function resolveTargetFiles(options: CliOptions) {
  if (options.targets.length) {
    return options.targets;
  }

  const entries = await fs.readdir(options.dir);
  return entries
    .filter((entry) => entry.endsWith('.svg'))
    .sort()
    .map((entry) => path.join(options.dir, entry));
}

async function trimSvgFile(filePath: string, padding: number, dryRun: boolean) {
  const source = await fs.readFile(filePath, 'utf8');
  const svgTagMatch = source.match(SVG_ROOT_RE);
  if (!svgTagMatch) {
    throw new Error(`Could not find <svg> root tag in ${filePath}`);
  }

  const svgTag = svgTagMatch[0];
  const viewBox = parseViewBox(svgTag);
  const bounds = createBounds();
  const pathMatches = Array.from(source.matchAll(PATH_DATA_RE));

  pathMatches.forEach((match) => {
    parsePathBounds(match[1], bounds);
  });

  if (!hasBounds(bounds)) {
    throw new Error(`Could not compute bounds for ${filePath}`);
  }

  const trimmedBounds = buildTargetBounds(bounds, padding, viewBox);
  const nextViewBox = formatViewBox(trimmedBounds);
  let nextSvgTag = setSvgAttribute(svgTag, 'viewBox', nextViewBox);
  nextSvgTag = setSvgAttribute(nextSvgTag, 'width', formatNumber(trimmedBounds.maxX - trimmedBounds.minX));
  nextSvgTag = setSvgAttribute(nextSvgTag, 'height', formatNumber(trimmedBounds.maxY - trimmedBounds.minY));

  if (nextSvgTag === svgTag) {
    return null;
  }

  const nextSource = source.replace(svgTag, nextSvgTag);
  if (!dryRun) {
    await fs.writeFile(filePath, nextSource, 'utf8');
  }

  return {
    filePath,
    previousViewBox: viewBox ? `${formatNumber(viewBox.minX)} ${formatNumber(viewBox.minY)} ${formatNumber(viewBox.width)} ${formatNumber(viewBox.height)}` : '(missing)',
    nextViewBox,
  };
}

async function main() {
  const options = parseCliOptions(process.argv.slice(2));
  const targetFiles = await resolveTargetFiles(options);

  if (!targetFiles.length) {
    throw new Error(`No SVG files found in ${options.dir}`);
  }

  let changedFiles = 0;
  for (const filePath of targetFiles) {
    const result = await trimSvgFile(filePath, options.padding, options.dryRun);
    if (!result) {
      continue;
    }

    changedFiles += 1;
    console.log(
      `${options.dryRun ? '[dry-run] ' : ''}${path.basename(result.filePath)}: ${result.previousViewBox} -> ${result.nextViewBox}`,
    );
  }

  console.log(
    `${options.dryRun ? 'Would update' : 'Updated'} ${changedFiles} of ${targetFiles.length} manufacturer logo SVG files.`,
  );
}

void main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(message);
  process.exitCode = 1;
});
