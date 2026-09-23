export type Direction = 'up' | 'down' | 'left' | 'right';
export type Difficulty = 'easy' | 'medium' | 'hard' | 'extraHard';

// React Native global (true in dev builds). Declared here so plain-JS tooling
// and tsc stay happy; guarded with typeof checks at use sites.
declare const __DEV__: boolean | undefined;

export interface CellCoord {
  r: number;
  c: number;
}

export interface Block {
  type: 'arrow';
  id: string;
  direction: Direction;
  cells: CellCoord[]; // Ordered from tail (cells[0]) to head (cells[len - 1])
  len: number;
}

export interface DifficultyConfig {
  cols: number;
  rows: number;
  maxLen: number;
  turnWeight: number; // 0 = straightaways prioritized; 1 = turns / curling prioritized
  minLen: number;
}

export const DIFFICULTY_CONFIGS: Record<Difficulty, DifficultyConfig> = {
  easy: {
    cols: 5,
    rows: 7,
    maxLen: 8, // long straightaways
    turnWeight: 0.1, // low turn weight
    minLen: 2,
  },
  medium: {
    cols: 7,
    rows: 10,
    maxLen: 6,
    turnWeight: 0.5, // medium turn weight
    minLen: 2,
  },
  hard: {
    cols: 9,
    rows: 13,
    maxLen: 4,
    turnWeight: 0.85, // high turn weight (forces L-shapes and curling)
    minLen: 2,
  },
  extraHard: {
    cols: 11,
    rows: 15,
    maxLen: 2, // dense micro-pathing
    turnWeight: 1.0, // extreme turn weight
    minLen: 1,
  },
};

// Head-Clearance Collision Logic:
// Evaluates strictly the single grid coordinate directly in front of the arrow's head.
// Ignores all adjacent tiles touching the arrow's tail or body.
function canPieceEscape(cells: CellCoord[], dir: Direction, remaining: Set<string>, rows: number, cols: number): boolean {
  const head = cells[cells.length - 1];
  let targetR = head.r;
  let targetC = head.c;

  // Dynamically calculate target coordinate based on facing direction
  if (dir === 'up') targetR -= 1;
  else if (dir === 'down') targetR += 1;
  else if (dir === 'left') targetC -= 1;
  else if (dir === 'right') targetC += 1;

  // If off the board (out of bounds), it is unblocked and clear to escape
  if (targetR < 0 || targetR >= rows || targetC < 0 || targetC >= cols) {
    return true;
  }

  // If on the board, unblocked if the target cell has already escaped / been cleared
  return !remaining.has(`${targetR},${targetC}`);
}

// Wall-hugging score logic: favor cells adjacent to already-filled spaces or boundaries
function getWallHugScore(r: number, c: number, remaining: Set<string>, rows: number, cols: number): number {
  let score = 0;
  const adj = [
    { r: r - 1, c: c },
    { r: r + 1, c: c },
    { r: r, c: c - 1 },
    { r: r, c: c + 1 },
  ];
  for (const a of adj) {
    if (a.r < 0 || a.r >= rows || a.c < 0 || a.c >= cols || !remaining.has(`${a.r},${a.c}`)) {
      score++;
    }
  }
  return score;
}

// Aggressive space-filling snake growth with wall-hugging and difficulty-based turn bias
function growSnake(
  head: CellCoord, 
  dir: Direction, 
  remaining: Set<string>, 
  rows: number, 
  cols: number, 
  maxLen: number = 25,
  turnWeight: number = 0.5
): CellCoord[] {
  const has = (r: number, c: number) => remaining.has(`${r},${c}`);
  let best: CellCoord[] = [head];

  for (let trial = 0; trial < 15; trial++) {
    let current: CellCoord[] = [head];
    const visited = new Set<string>([`${head.r},${head.c}`]);

    while (current.length < maxLen) {
      const tail = current[0];
      const neighbors: CellCoord[] = [
        { r: tail.r - 1, c: tail.c },
        { r: tail.r + 1, c: tail.c },
        { r: tail.r, c: tail.c - 1 },
        { r: tail.r, c: tail.c + 1 },
      ];

      // Determine current segment direction if length >= 2
      let curDr = 0;
      let curDc = 0;
      if (current.length >= 2) {
        curDr = current[0].r - current[1].r;
        curDc = current[0].c - current[1].c;
      }

      // Sort neighbors based on wall hugging score and turn weight
      neighbors.sort((a, b) => {
        let scoreA = getWallHugScore(a.r, a.c, remaining, rows, cols);
        let scoreB = getWallHugScore(b.r, b.c, remaining, rows, cols);

        if (current.length >= 2) {
          const isStraightA = (a.r - tail.r === curDr) && (a.c - tail.c === curDc);
          const isStraightB = (b.r - tail.r === curDr) && (b.c - tail.c === curDc);

          // Low turnWeight favors straight lines; high turnWeight favors turns (curling/L-shapes)
          const turnBiasA = isStraightA ? (1 - turnWeight) * 4 : turnWeight * 4;
          const turnBiasB = isStraightB ? (1 - turnWeight) * 4 : turnWeight * 4;

          scoreA += turnBiasA;
          scoreB += turnBiasB;
        }

        // Add slight randomization to tie-breaks
        if (scoreA === scoreB) return Math.random() - 0.5;
        return scoreB - scoreA;
      });

      let extended = false;
      for (const n of neighbors) {
        const nKey = `${n.r},${n.c}`;
        if (has(n.r, n.c) && !visited.has(nKey)) {
          const nextSnake = [n, ...current];
          if (canPieceEscape(nextSnake, dir, remaining, rows, cols)) {
            current = nextSnake;
            visited.add(nKey);
            extended = true;
            break;
          }
        }
      }
      if (!extended) break;
    }

    if (current.length > best.length) best = current;
    if (best.length === maxLen) break;
  }

  return best;
}

function tryGenerateLevel(config: DifficultyConfig, allowMicro: boolean) {
  const { rows, cols, maxLen, turnWeight, minLen } = config;
  
  const grid: (Block | null)[][] = Array(rows).fill(null).map(() => Array(cols).fill(null));
  
  const remaining = new Set<string>();
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      remaining.add(`${r},${c}`);
    }
  }
  
  const blocks: Block[] = [];
  const dirs: Direction[] = ['up', 'down', 'left', 'right'];
  let idCounter = 0;

  while (remaining.size > 0) {
    const candidates: { head: CellCoord; dir: Direction }[] = [];

    for (const key of remaining) {
      const [hr, hc] = key.split(',').map(Number);
      for (const dir of dirs) {
        if (canPieceEscape([{ r: hr, c: hc }], dir, remaining, rows, cols)) {
          candidates.push({ head: { r: hr, c: hc }, dir });
        }
      }
    }

    if (candidates.length === 0) {
      return null; // Deadlock
    }

    candidates.sort(() => Math.random() - 0.5);
    let best: { snake: CellCoord[]; dir: Direction } | null = null;
    const sampleSize = Math.min(candidates.length, 10);

    const blockMaxLen = Math.max(minLen, Math.floor(Math.random() * (maxLen - minLen + 1)) + minLen);

    for (let i = 0; i < sampleSize; i++) {
      const cand = candidates[i];
      const snake = growSnake(cand.head, cand.dir, remaining, rows, cols, blockMaxLen, turnWeight);

      if (!best || snake.length > best.snake.length) {
        best = { snake, dir: cand.dir };
      }
      if (best.snake.length === blockMaxLen) break;
    }

    if (!best) return null; // Deadlock
    
    // Strict minimum path length for this difficulty
    if (!allowMicro && best.snake.length < minLen) {
      return null; // Deadlock, restart
    }

    for (const c of best.snake) {
      remaining.delete(`${c.r},${c.c}`);
    }

    // The escape direction `best.dir` is guaranteed clear BY CONSTRUCTION: when this
    // block was placed, its head target was off-board or a cell owned by an
    // EARLIER-placed block — so removing blocks in forward placement order always
    // solves the level (each block's target is empty by the time it's its turn).
    // Store it as the arrow's direction. (Deriving direction from body geometry
    // instead could disagree with the guaranteed-clear direction and produce
    // unsolvable-looking boards.)
    const blockDir: Direction = best.dir;

    const block: Block = {
      type: 'arrow',
      id: `block_${idCounter++}`,
      direction: blockDir,
      cells: best.snake,
      len: best.snake.length,
    };

    blocks.push(block);
    for (const c of best.snake) {
      grid[c.r][c.c] = block;
    }
  }

  return {
    grid,
    blocks,
    totalBlocks: blocks.length,
    rows,
    cols,
  };
}

/**
 * Resolves an arrow's facing direction.
 *
 * Prefers the generator-stored escape direction, which is guaranteed clear by
 * construction (see tryGenerateLevel). Falls back to body geometry only for
 * arrow objects built without a stored direction.
 */
export function getArrowDirection(arrow: Block): Direction {
  if (arrow && arrow.direction) {
    return arrow.direction;
  }
  if (!arrow || !arrow.cells || arrow.cells.length < 2) {
    return arrow?.direction || 'right';
  }
  const h = arrow.cells[arrow.cells.length - 1];
  const p = arrow.cells[arrow.cells.length - 2];
  const dr = h.r - p.r;
  const dc = h.c - p.c;
  if (dc > 0) return 'right';
  if (dr > 0) return 'down';
  if (dc < 0) return 'left';
  if (dr < 0) return 'up';
  return arrow.direction || 'right';
}

/**
 * Validates that a generated matrix of arrows is 100% solvable without deadlocks.
 *
 * Simulates the game by iteratively removing any arrow whose head-clearance is valid
 * (i.e. the next tile in its facing direction is empty or off the board).
 *
 * Returns:
 * - true if all arrows are successfully cleared (0 remaining).
 * - false if a full pass completes without being able to remove any arrow (deadlock).
 */
export function validateBoard(arrowsArray: Block[], rows?: number, cols?: number): boolean {
  if (!arrowsArray || arrowsArray.length === 0) return true;

  // Infer dimensions if not explicitly passed
  let maxR = 0;
  let maxC = 0;
  for (const a of arrowsArray) {
    for (const c of a.cells) {
      if (c.r > maxR) maxR = c.r;
      if (c.c > maxC) maxC = c.c;
    }
  }
  const boardRows = rows || maxR + 1;
  const boardCols = cols || maxC + 1;

  // 1. Deep copy of the generated arrows
  let remainingArrows: Block[] = arrowsArray.map((arrow) => ({
    ...arrow,
    cells: arrow.cells.map((c) => ({ ...c })),
  }));

  // Build current occupied coordinates set
  const occupied = new Set<string>();
  for (const arrow of remainingArrows) {
    for (const cell of arrow.cells) {
      occupied.add(`${cell.r},${cell.c}`);
    }
  }

  // 2. Simulation loop
  while (remainingArrows.length > 0) {
    let removedAny = false;
    const stillRemaining: Block[] = [];

    for (const arrow of remainingArrows) {
      const head = arrow.cells[arrow.cells.length - 1];
      const dir = getArrowDirection(arrow);

      let targetR = head.r;
      let targetC = head.c;
      if (dir === 'up') targetR -= 1;
      else if (dir === 'down') targetR += 1;
      else if (dir === 'left') targetC -= 1;
      else if (dir === 'right') targetC += 1;

      // Exact player clearance logic: unblocked if target is off-board or empty
      const isOffBoard = targetR < 0 || targetR >= boardRows || targetC < 0 || targetC >= boardCols;
      const isNextTileEmpty = isOffBoard || !occupied.has(`${targetR},${targetC}`);

      if (isNextTileEmpty) {
        // Arrow can escape: free its occupied tiles immediately
        for (const cell of arrow.cells) {
          occupied.delete(`${cell.r},${cell.c}`);
        }
        removedAny = true;
      } else {
        stillRemaining.push(arrow);
      }
    }

    // Deadlock detected: full pass without removing ANY arrows, but arrows still remain
    if (!removedAny) {
      return false;
    }

    remainingArrows = stillRemaining;
  }

  // 100% solvable: all arrows cleared
  return true;
}

export function generateLevel(activeDifficulty: Difficulty = 'medium'): any {
  const config = DIFFICULTY_CONFIGS[activeDifficulty] || DIFFICULTY_CONFIGS.medium;

  // Single-pass generation. Levels are solvable by construction (see tryGenerateLevel),
  // so the old validate-and-retry storm is gone. This small bounded loop only recovers
  // from rare placement deadlocks (tryGenerateLevel returning null) — it never
  // re-validates, and it never loops forever.
  for (let attempt = 0; attempt < 10; attempt++) {
    const candidate = tryGenerateLevel(config, false);
    if (candidate) {
      assertSolvableByConstruction(candidate);
      return { ...candidate, difficulty: activeDifficulty };
    }
  }

  // Fallback: relax the minimum-length rule (lets endgame singletons become
  // length-1 blocks instead of discarding a nearly-complete board).
  for (let attempt = 0; attempt < 10; attempt++) {
    const candidate = tryGenerateLevel(config, true);
    if (candidate) {
      assertSolvableByConstruction(candidate);
      return { ...candidate, difficulty: activeDifficulty };
    }
  }

  throw new Error(`[LevelGenerator] could not place a ${activeDifficulty} level after 20 attempts`);
}

// Dev-only sanity check that the construction invariant holds. Never runs in
// production or in plain-JS test harnesses (no __DEV__ global there).
function assertSolvableByConstruction(candidate: { blocks: Block[]; rows: number; cols: number }): void {
  if (typeof __DEV__ !== 'undefined' && __DEV__) {
    if (!validateBoard(candidate.blocks, candidate.rows, candidate.cols)) {
      console.warn('[LevelGenerator] construction invariant violated — this should never happen');
    }
  }
}
