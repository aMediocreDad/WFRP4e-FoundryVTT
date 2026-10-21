/**
 * Local escape-route estimate, not a tactical pathfinder. Coordinates are pixels.
 * Search a quarter-grid lattice, sweeping the mover's footprint against enemies
 * and movement walls. Allies may yield passage. Finding any clear exit is enough;
 * failure is an estimate which the GM can override (5e p.167).
 */
export function hasEscapeRoute({ mover, enemies, bounds, gridSize, wallBlocked }) {
  if (!enemies.length) return true;
  const step = gridSize / 4;
  if (!(step > 0)) return null;
  const origin = { x: mover.x + mover.width / 2, y: mover.y + mover.height / 2 };
  const half = { x: mover.width / 2, y: mover.height / 2 };
  const radius = Math.max(mover.width, mover.height, gridSize) + gridSize * 2;
  const rect = p => ({ x: p.x - half.x, y: p.y - half.y, width: mover.width, height: mover.height });
  const overlap = (a, b) => Math.max(0, Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x))
    * Math.max(0, Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y));
  const distance = (a, b) => Math.hypot(
    Math.max(0, b.x - a.x - a.width, a.x - b.x - b.width),
    Math.max(0, b.y - a.y - a.height, a.y - b.y - b.height)
  );
  // Sweep the centre, corners and edge midpoints. Inset very slightly so merely
  // touching a wall or neighbouring token does not count as crossing it.
  const offsets = [-1, 0, 1].flatMap(x => [-1, 0, 1].map(y => ({
    x: x * Math.max(0, half.x - 0.01), y: y * Math.max(0, half.y - 0.01)
  })));
  const canMove = (a, b) => {
    const before = rect(a), after = rect(b);
    if (after.x < bounds.x || after.y < bounds.y
      || after.x + after.width > bounds.x + bounds.width
      || after.y + after.height > bounds.y + bounds.height) return false;
    // Allow initially overlapping tokens to separate, but never deepen overlap.
    // Substeps also prevent a diagonal move from cutting through a corner.
    for (const fraction of [0.5, 1]) {
      const sample = rect({ x: a.x + (b.x - a.x) * fraction, y: a.y + (b.y - a.y) * fraction });
      if (enemies.some(e => {
        const prior = overlap(before, e), next = overlap(sample, e);
        return next > 0 && (prior === 0 || next >= prior);
      })) return false;
    }
    return !offsets.some(o => wallBlocked(
      { x: a.x + o.x, y: a.y + o.y }, { x: b.x + o.x, y: b.y + o.y }
    ));
  };
  const queue = [{ i: 0, j: 0, ...origin }], visited = new Set(["0,0"]);
  const directions = [-1, 0, 1].flatMap(i => [-1, 0, 1].filter(j => i || j).map(j => [i, j]));
  for (let index = 0; index < queue.length; index++) {
    const here = queue[index];
    // Beyond the local enemies' footprints with half a yard/grid interval of clearance.
    if (index && enemies.every(e => distance(rect(here), e) >= gridSize / 2)) return true;
    for (const [di, dj] of directions) {
      const i = here.i + di, j = here.j + dj, key = `${i},${j}`;
      if (visited.has(key) || Math.abs(i * step) > radius || Math.abs(j * step) > radius) continue;
      const next = { i, j, x: origin.x + i * step, y: origin.y + j * step };
      if (!canMove(here, next)) continue;
      visited.add(key);
      queue.push(next);
    }
  }
  return false;
}

/**
 * Attack edges imply opposing sides. Connected allies count, unrelated melees do
 * not. An odd cycle (e.g. a three-way fight) cannot describe two sides: defer to
 * the GM rather than silently treating two enemies as allies.
 */
export function engagementSides(tokenId, edges) {
  const sides = new Map([[tokenId, 0]]), queue = [tokenId];
  for (let index = 0; index < queue.length; index++) {
    const id = queue[index], side = sides.get(id);
    for (const edge of edges) {
      const other = edge.a === id ? edge.b : edge.b === id ? edge.a : null;
      if (!other) continue;
      if (sides.has(other)) {
        if (sides.get(other) === side) return null;
      } else {
        sides.set(other, 1 - side);
        queue.push(other);
      }
    }
  }
  return {
    allies: [...sides].filter(([, side]) => side === 0).map(([id]) => id),
    enemies: [...sides].filter(([, side]) => side === 1).map(([id]) => id)
  };
}
