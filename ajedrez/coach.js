/* =====================================================================
 * coach.js  —  the "professional player": an evaluator, a negamax search
 * (used both as the opponent and to analyse your moves), and a coach that
 * explains, in English, WHY a move is good or bad using real chess ideas.
 *
 * Depends on engine.js (ChessEngine / require).
 * ===================================================================== */

(function (root) {
  "use strict";

  const E = (typeof require !== "undefined")
    ? require("./engine.js")
    : root.ChessEngine;
  const { rc, idx, algebraic, opposite, WHITE, BLACK } = E;

  // ---- material and piece-square tables ------------------------------
  const VALUE = { P: 100, N: 320, B: 330, R: 500, Q: 900, K: 20000 };

  // Tables are written from White's point of view, rank 8 (row 0) on top.
  const PST = {
    P: [
       0,  0,  0,  0,  0,  0,  0,  0,
      50, 50, 50, 50, 50, 50, 50, 50,
      10, 10, 20, 30, 30, 20, 10, 10,
       5,  5, 10, 25, 25, 10,  5,  5,
       0,  0,  0, 20, 20,  0,  0,  0,
       5, -5,-10,  0,  0,-10, -5,  5,
       5, 10, 10,-20,-20, 10, 10,  5,
       0,  0,  0,  0,  0,  0,  0,  0,
    ],
    N: [
      -50,-40,-30,-30,-30,-30,-40,-50,
      -40,-20,  0,  0,  0,  0,-20,-40,
      -30,  0, 10, 15, 15, 10,  0,-30,
      -30,  5, 15, 20, 20, 15,  5,-30,
      -30,  0, 15, 20, 20, 15,  0,-30,
      -30,  5, 10, 15, 15, 10,  5,-30,
      -40,-20,  0,  5,  5,  0,-20,-40,
      -50,-40,-30,-30,-30,-30,-40,-50,
    ],
    B: [
      -20,-10,-10,-10,-10,-10,-10,-20,
      -10,  0,  0,  0,  0,  0,  0,-10,
      -10,  0,  5, 10, 10,  5,  0,-10,
      -10,  5,  5, 10, 10,  5,  5,-10,
      -10,  0, 10, 10, 10, 10,  0,-10,
      -10, 10, 10, 10, 10, 10, 10,-10,
      -10,  5,  0,  0,  0,  0,  5,-10,
      -20,-10,-10,-10,-10,-10,-10,-20,
    ],
    R: [
       0,  0,  0,  0,  0,  0,  0,  0,
       5, 10, 10, 10, 10, 10, 10,  5,
      -5,  0,  0,  0,  0,  0,  0, -5,
      -5,  0,  0,  0,  0,  0,  0, -5,
      -5,  0,  0,  0,  0,  0,  0, -5,
      -5,  0,  0,  0,  0,  0,  0, -5,
      -5,  0,  0,  0,  0,  0,  0, -5,
       0,  0,  0,  5,  5,  0,  0,  0,
    ],
    Q: [
      -20,-10,-10, -5, -5,-10,-10,-20,
      -10,  0,  0,  0,  0,  0,  0,-10,
      -10,  0,  5,  5,  5,  5,  0,-10,
       -5,  0,  5,  5,  5,  5,  0, -5,
        0,  0,  5,  5,  5,  5,  0, -5,
      -10,  5,  5,  5,  5,  5,  0,-10,
      -10,  0,  5,  0,  0,  0,  0,-10,
      -20,-10,-10, -5, -5,-10,-10,-20,
    ],
    K: [
      -30,-40,-40,-50,-50,-40,-40,-30,
      -30,-40,-40,-50,-50,-40,-40,-30,
      -30,-40,-40,-50,-50,-40,-40,-30,
      -30,-40,-40,-50,-50,-40,-40,-30,
      -20,-30,-30,-40,-40,-30,-30,-20,
      -10,-20,-20,-20,-20,-20,-20,-10,
       20, 20,  0,  0,  0,  0, 20, 20,
       20, 30, 10,  0,  0, 10, 30, 20,
    ],
  };

  function mirror(index) {
    const [r, c] = rc(index);
    return idx(7 - r, c);
  }

  const INF = 1e7;
  const MATE = 1e6;

  // Static evaluation from White's point of view (centipawns).
  function evaluate(g) {
    let score = 0;
    for (let i = 0; i < 64; i++) {
      const p = g.board[i];
      if (!p) continue;
      const v = VALUE[p[1]];
      const pst = PST[p[1]][p[0] === WHITE ? i : mirror(i)];
      if (p[0] === WHITE) score += v + pst;
      else score -= v + pst;
    }
    return score;
  }

  function relEval(g) {
    // from the side-to-move's perspective
    return g.turn === WHITE ? evaluate(g) : -evaluate(g);
  }

  // Order moves: captures first, by Most-Valuable-Victim / Least-Valuable-Attacker.
  function orderMoves(moves) {
    return moves.slice().sort((a, b) => {
      const av = a.captured ? VALUE[a.captured[1]] * 10 - VALUE[a.piece[1]] : 0;
      const bv = b.captured ? VALUE[b.captured[1]] * 10 - VALUE[b.piece[1]] : 0;
      return bv - av;
    });
  }

  // Negamax with alpha-beta.  Returns score for the side to move.
  function negamax(g, depth, alpha, beta) {
    if (depth === 0) return relEval(g);
    const moves = g.legalMoves();
    if (moves.length === 0) {
      if (g.inCheck(g.turn)) return -MATE - depth; // prefer slower mates
      return 0; // stalemate
    }
    let best = -INF;
    for (const m of orderMoves(moves)) {
      g.makeMove(m);
      const score = -negamax(g, depth - 1, -beta, -alpha);
      g.undoMove();
      if (score > best) best = score;
      if (best > alpha) alpha = best;
      if (alpha >= beta) break;
    }
    return best;
  }

  // Score every legal move for the side to move, best first.
  // Returns [{move, san, score}]  (score from the mover's perspective).
  function analyse(game, depth) {
    const g = game.clone();
    const moves = g.legalMoves();
    const scored = [];
    for (const m of moves) {
      const san = g.toSAN(m);
      g.makeMove(m);
      const score = -negamax(g, depth - 1, -INF, INF);
      g.undoMove();
      scored.push({ move: m, san, score });
    }
    scored.sort((a, b) => b.score - a.score);
    return scored;
  }

  // Opponent move: strongest move, with a little randomness among moves
  // that are practically equal so games are not identical every time.
  function chooseMove(game, depth, jitter = 25) {
    const ranked = analyse(game, depth);
    if (ranked.length === 0) return null;
    const top = ranked[0].score;
    const pool = ranked.filter((r) => top - r.score <= jitter);
    return pool[Math.floor(Math.random() * pool.length)].move;
  }

  // ---- Static Exchange Evaluation (SEE) ------------------------------
  // "If I start capturing on this square, what do I net?"  Positive means
  // the side to move wins material there.  This is what powers the
  // concrete "you are hanging a piece" explanations.
  function attackersTo(g, square, color) {
    // Return list of indices of `color` pieces that attack `square`.
    const list = [];
    const [r, c] = rc(square);
    const pawnDir = color === WHITE ? 1 : -1; // where its pawns come FROM
    for (const dc of [-1, 1]) {
      const rr = r + pawnDir, cc = c + dc;
      if (E.onBoard(rr, cc) && g.board[idx(rr, cc)] === color + "P")
        list.push(idx(rr, cc));
    }
    const kn = [[-2,-1],[-2,1],[-1,-2],[-1,2],[1,-2],[1,2],[2,-1],[2,1]];
    for (const [dr, dc] of kn) {
      const rr = r + dr, cc = c + dc;
      if (E.onBoard(rr, cc) && g.board[idx(rr, cc)] === color + "N")
        list.push(idx(rr, cc));
    }
    for (let dr = -1; dr <= 1; dr++)
      for (let dc = -1; dc <= 1; dc++) {
        if (!dr && !dc) continue;
        const rr = r + dr, cc = c + dc;
        if (E.onBoard(rr, cc) && g.board[idx(rr, cc)] === color + "K")
          list.push(idx(rr, cc));
      }
    const scan = (dirs, types) => {
      for (const [dr, dc] of dirs) {
        let rr = r + dr, cc = c + dc;
        while (E.onBoard(rr, cc)) {
          const p = g.board[idx(rr, cc)];
          if (p) {
            if (p[0] === color && types.indexOf(p[1]) >= 0) list.push(idx(rr, cc));
            break;
          }
          rr += dr; cc += dc;
        }
      }
    };
    scan([[-1,0],[1,0],[0,-1],[0,1]], "RQ");
    scan([[-1,-1],[-1,1],[1,-1],[1,1]], "BQ");
    return list;
  }

  // Static Exchange Evaluation via the standard "swap" algorithm.  Returns
  // the material the side to move nets by starting a capture sequence on
  // `square` (positive = winning material there).  Handles x-ray attackers
  // because each capturing piece is slid onto the square before the next
  // attacker is looked up.
  function see(game, square, sideToMove) {
    const g = game.clone();
    const target = g.board[square];
    if (!target) return 0;

    const gain = [VALUE[target[1]]];
    let side = sideToMove;
    let d = 0;

    while (true) {
      const attackers = attackersTo(g, square, side)
        .sort((a, b) => VALUE[g.board[a][1]] - VALUE[g.board[b][1]]);
      if (attackers.length === 0) break;
      const from = attackers[0];
      const attackerVal = VALUE[g.board[from][1]];
      d++;
      gain[d] = attackerVal - gain[d - 1];
      // slide the attacker onto the square so x-ray attackers appear
      g.board[square] = g.board[from];
      g.board[from] = null;
      side = opposite(side);
    }

    // Minimax back; the final speculative capture is intentionally dropped,
    // because the side on move can always decline to continue.
    while (--d > 0) gain[d - 1] = -Math.max(-gain[d - 1], gain[d]);
    return gain[0];
  }

  // Largest material the enemy can win on their next move (by any capture).
  function bestEnemyCapture(game) {
    const enemy = game.turn; // after you move, it's the enemy's turn
    let best = null;
    for (const m of game.legalMoves()) {
      if (!m.captured && m.flag !== "enpassant") continue;
      const net = see(game, m.to, enemy);
      if (net > 0 && (!best || net > best.net))
        best = { move: m, net, san: game.toSAN(m) };
    }
    return best;
  }

  // ---- classification -------------------------------------------------
  // cpLoss is how much worse (in centipawns) the played move is than the
  // engine's best, measured from the player's perspective.
  function classify(cpLoss, wasBest) {
    if (wasBest) return { key: "best", label: "Best move", icon: "✔" };
    if (cpLoss < 20) return { key: "great", label: "Great move", icon: "✔" };
    if (cpLoss < 60) return { key: "good", label: "Good move", icon: "·" };
    if (cpLoss < 130) return { key: "inaccuracy", label: "Inaccuracy", icon: "?!" };
    if (cpLoss < 300) return { key: "mistake", label: "Mistake", icon: "?" };
    return { key: "blunder", label: "Blunder", icon: "??" };
  }

  const PIECE_NAME = { P: "pawn", N: "knight", B: "bishop", R: "rook", Q: "queen", K: "king" };

  // Centre squares, used for opening-principle hints.
  const CENTER = new Set(["d4", "e4", "d5", "e5"].map(E.fromAlgebraic));

  function isDeveloping(m) {
    // a minor piece leaving the back rank for the first time
    const [r] = rc(m.from);
    const backRank = m.piece[0] === WHITE ? 7 : 0;
    return (m.piece[1] === "N" || m.piece[1] === "B") && r === backRank;
  }

  /* Build an English explanation.  `before` is the position with the
   * player to move; `played` the move they made; `bestEntry` the engine's
   * top choice; `cpLoss` the eval drop. */
  function explain(before, played, bestEntry, cpLoss, cls) {
    const g = before.clone();
    const mover = g.turn;
    const playedSAN = g.toSAN(played);
    const bestSAN = bestEntry.san;
    const parts = [];

    // Position AFTER the played move (enemy to move).
    const after = before.clone();
    after.makeMove(played);

    // 1) Did the move hang material?  (enemy can win material next)
    const hang = bestEnemyCapture(after);

    // 2) Was the played move itself a bad capture / did it miss a free one?
    const bestMove = bestEntry.move;
    const bestIsCapture = bestMove.captured || bestMove.flag === "enpassant";

    // 3) Is it check / mate related?
    after.turn = mover; // peek: did we give checkmate chances away? (handled by eval)
    after.turn = opposite(mover);

    if (cls.key === "best" || cls.key === "great") {
      if (played.captured) parts.push(`You win material by capturing on ${algebraic(played.to)}.`);
      else if (played.flag === "castle") parts.push(`Castling tucks your king into safety and connects your rooks — a key opening goal.`);
      else if (isDeveloping(played)) parts.push(`Good development: you bring a ${PIECE_NAME[played.piece[1]]} into the game toward the centre.`);
      else if (played.piece[1] === "P" && (CENTER.has(played.to) || before.fullmove <= 4))
        parts.push(`Good central pawn play: you fight for the centre and open lines for your pieces.`);
      else parts.push(`This keeps the position healthy and matches the engine's top choice.`);
      return { playedSAN, bestSAN, lines: parts };
    }

    // Something went wrong — lead with the most concrete reason.
    if (hang && hang.net >= 100) {
      const victimSq = algebraic(hang.move.to);
      const victim = after.board[hang.move.to];
      const victimName = victim ? PIECE_NAME[victim[1]] : "piece";
      parts.push(
        `This hangs material: your ${victimName} on ${victimSq} is now undefended, ` +
        `and the opponent wins it with ${hang.san} (about ${(hang.net / 100).toFixed(1)} points).`
      );
    } else if (played.captured && see(before, played.to, mover) < 0) {
      parts.push(
        `The capture ${playedSAN} loses material — after the trades on ${algebraic(played.to)} ` +
        `you come out behind. Count the attackers and defenders before capturing.`
      );
    } else if (bestIsCapture && !played.captured) {
      parts.push(
        `You missed a stronger capture: ${bestSAN} wins or regains material right away.`
      );
    } else {
      parts.push(
        `A better continuation was ${bestSAN}. Your move loses about ` +
        `${(cpLoss / 100).toFixed(1)} points of evaluation compared with it.`
      );
    }

    // Add a principle-level hint in the opening.
    if (before.fullmove <= 10) {
      if (played.piece[1] === "Q" && before.fullmove <= 4)
        parts.push(`Tip: avoid bringing the queen out too early — it gets chased around and you lose time.`);
      else if (isDeveloping(bestMove) && !isDeveloping(played))
        parts.push(`Opening principle: develop your knights and bishops toward the centre and castle early. ${bestSAN} does that.`);
      else if (CENTER.has(bestMove.to) && !CENTER.has(played.to))
        parts.push(`Opening principle: fight for the centre. ${bestSAN} stakes a claim in the middle of the board.`);
    }

    return { playedSAN, bestSAN, lines: parts };
  }

  /* Full review of one human move.
   *   before: Game with the human to move (BEFORE they moved)
   *   played: the move object they chose
   *   depth:  search depth for analysis
   */
  function reviewMove(before, played, depth) {
    const ranked = analyse(before, depth);
    const best = ranked[0];
    // find the played move's score
    const playedKey = (m) => m.from + "-" + m.to + "-" + (m.promotion || "");
    const pk = playedKey(played);
    const entry = ranked.find((r) => playedKey(r.move) === pk) || { score: best.score };
    const cpLoss = Math.max(0, best.score - entry.score);
    const wasBest = best.score - entry.score < 15;
    const cls = classify(cpLoss, wasBest);
    const text = explain(before, played, best, cpLoss, cls);
    return {
      classification: cls,
      cpLoss,
      playedSAN: text.playedSAN,
      bestSAN: best.san,
      lines: text.lines,
      evalAfter: -entry.score, // from the opponent's side; informational
    };
  }

  const api = {
    evaluate, analyse, chooseMove, reviewMove, see, bestEnemyCapture,
    classify, VALUE, PIECE_NAME,
  };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.ChessCoach = api;
})(typeof window !== "undefined" ? window : globalThis);
