"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DIFFICULTY_CONFIGS = void 0;
exports.generateLevel = generateLevel;
exports.validateBoard = validateBoard;
exports.getArrowDirection = getArrowDirection;
exports.DIFFICULTY_CONFIGS = {
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
function canPieceEscape(cells, dir, remaining, rows, cols) {
    const head = cells[cells.length - 1];
    let targetR = head.r;
    let targetC = head.c;
    // Dynamically calculate target coordinate based on facing direction
    if (dir === 'up')
        targetR -= 1;
    else if (dir === 'down')
        targetR += 1;
    else if (dir === 'left')
        targetC -= 1;
    else if (dir === 'right')
        targetC += 1;
    // If off the board (out of bounds), it is unblocked and clear to escape
    if (targetR < 0 || targetR >= rows || targetC < 0 || targetC >= cols) {
        return true;
    }
    // If on the board, unblocked if the target cell has already escaped / been cleared
    return !remaining.has(`${targetR},${targetC}`);
}
// Wall-hugging score logic: favor cells adjacent to already-filled spaces or boundaries
function getWallHugScore(r, c, remaining, rows, cols) {
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
function growSnake(head, dir, remaining, rows, cols, maxLen = 25, turnWeight = 0.5) {
    const has = (r, c) => remaining.has(`${r},${c}`);
    let best = [head];
    for (let trial = 0; trial < 15; trial++) {
        let current = [head];
        const visited = new Set([`${head.r},${head.c}`]);
        while (current.length < maxLen) {
            const tail = current[0];
            const neighbors = [
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
                if (scoreA === scoreB)
                    return Math.random() - 0.5;
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
            if (!extended)
                break;
        }
        if (current.length > best.length)
            best = current;
        if (best.length === maxLen)
            break;
    }
    return best;
}
function tryGenerateLevel(config, allowMicro) {
    const { rows, cols, maxLen, turnWeight, minLen } = config;
    const grid = Array(rows).fill(null).map(() => Array(cols).fill(null));
    const remaining = new Set();
    for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
            remaining.add(`${r},${c}`);
        }
    }
    const blocks = [];
    const dirs = ['up', 'down', 'left', 'right'];
    let idCounter = 0;
    while (remaining.size > 0) {
        const candidates = [];
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
        let best = null;
        const sampleSize = Math.min(candidates.length, 10);
        const blockMaxLen = Math.max(minLen, Math.floor(Math.random() * (maxLen - minLen + 1)) + minLen);
        for (let i = 0; i < sampleSize; i++) {
            const cand = candidates[i];
            const snake = growSnake(cand.head, cand.dir, remaining, rows, cols, blockMaxLen, turnWeight);
            if (!best || snake.length > best.snake.length) {
                best = { snake, dir: cand.dir };
            }
            if (best.snake.length === blockMaxLen)
                break;
        }
        if (!best)
            return null; // Deadlock
        // Strict minimum path length for this difficulty
        if (!allowMicro && best.snake.length < minLen) {
            return null; // Deadlock, restart
        }
        for (const c of best.snake) {
            remaining.delete(`${c.r},${c.c}`);
        }
        let blockDir = best.dir;
        if (best.snake.length >= 2) {
            const h = best.snake[best.snake.length - 1];
            const p = best.snake[best.snake.length - 2];
            const dr = h.r - p.r;
            const dc = h.c - p.c;
            if (dc > 0)
                blockDir = 'right';
            else if (dr > 0)
                blockDir = 'down';
            else if (dc < 0)
                blockDir = 'left';
            else if (dr < 0)
                blockDir = 'up';
        }
        const block = {
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
function getArrowDirection(arrow) {
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
function validateBoard(arrowsArray, rows, cols) {
    if (!arrowsArray || arrowsArray.length === 0) return true;
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

    let remainingArrows = arrowsArray.map((arrow) => ({
        ...arrow,
        cells: arrow.cells.map((c) => ({ ...c })),
    }));

    const occupied = new Set();
    for (const arrow of remainingArrows) {
        for (const cell of arrow.cells) {
            occupied.add(`${cell.r},${cell.c}`);
        }
    }

    while (remainingArrows.length > 0) {
        let removedAny = false;
        const stillRemaining = [];

        for (const arrow of remainingArrows) {
            const head = arrow.cells[arrow.cells.length - 1];
            const dir = getArrowDirection(arrow);

            let targetR = head.r;
            let targetC = head.c;
            if (dir === 'up') targetR -= 1;
            else if (dir === 'down') targetR += 1;
            else if (dir === 'left') targetC -= 1;
            else if (dir === 'right') targetC += 1;

            const isOffBoard = targetR < 0 || targetR >= boardRows || targetC < 0 || targetC >= boardCols;
            const isNextTileEmpty = isOffBoard || !occupied.has(`${targetR},${targetC}`);

            if (isNextTileEmpty) {
                for (const cell of arrow.cells) {
                    occupied.delete(`${cell.r},${cell.c}`);
                }
                removedAny = true;
            } else {
                stillRemaining.push(arrow);
            }
        }

        if (!removedAny) {
            return false;
        }

        remainingArrows = stillRemaining;
    }

    return true;
}
function generateLevel(activeDifficulty = 'medium', retryCount = 0) {
    const config = exports.DIFFICULTY_CONFIGS[activeDifficulty] || exports.DIFFICULTY_CONFIGS.medium;
    const MAX_RETRIES = 50;

    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
        const candidate = tryGenerateLevel(config, false);
        if (candidate && validateBoard(candidate.blocks, candidate.rows, candidate.cols)) {
            return { ...candidate, difficulty: activeDifficulty };
        }
    }

    for (let fallbackAttempt = 0; fallbackAttempt < MAX_RETRIES; fallbackAttempt++) {
        const fallbackCandidate = tryGenerateLevel(config, true);
        if (fallbackCandidate && validateBoard(fallbackCandidate.blocks, fallbackCandidate.rows, fallbackCandidate.cols)) {
            return { ...fallbackCandidate, difficulty: activeDifficulty };
        }
    }

    if (retryCount < 5) {
        return generateLevel(activeDifficulty, retryCount + 1);
    }

    let guaranteed = tryGenerateLevel(config, true);
    while (!guaranteed || !validateBoard(guaranteed.blocks, guaranteed.rows, guaranteed.cols)) {
        guaranteed = tryGenerateLevel(config, true);
    }
    return { ...guaranteed, difficulty: activeDifficulty };
}
