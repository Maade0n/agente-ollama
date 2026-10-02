/* =====================================================================
 * engine.js  —  A small but correct chess engine (legal move generation).
 *
 * Board representation: a flat array of 64 squares.
 *   index 0  = a8  (top-left),  index 7  = h8
 *   index 56 = a1  (bottom-left), index 63 = h1
 *   row 0 is rank 8, row 7 is rank 1.  col 0 is file 'a'.
 *
 * A piece is a 2-char string: color + type, e.g. "wP", "bK".
 * An empty square is null.
 *
 * This file has no UI and no dependencies, so it can be unit-tested with
 * Node (perft) and reused in the browser.  Everything the coach needs
 * (legal moves, check/checkmate/stalemate, make/undo) lives here.
 * ===================================================================== */

(function (root) {
  "use strict";

  const WHITE = "w";
  const BLACK = "b";

  function opposite(color) {
    return color === WHITE ? BLACK : WHITE;
  }

  // ---- square helpers ------------------------------------------------
  function rc(index) {
    return [index >> 3, index & 7]; // [row, col]
  }
  function idx(row, col) {
    return row * 8 + col;
  }
  function onBoard(row, col) {
    return row >= 0 && row < 8 && col >= 0 && col < 8;
  }
  function algebraic(index) {
    const [r, c] = rc(index);
    return "abcdefgh"[c] + (8 - r);
  }
  function fromAlgebraic(sq) {
    const col = "abcdefgh".indexOf(sq[0]);
    const row = 8 - parseInt(sq[1], 10);
    return idx(row, col);
  }

  // Standard starting position as a board array.
  function startBoard() {
    const back = ["R", "N", "B", "Q", "K", "B", "N", "R"];
    const b = new Array(64).fill(null);
    for (let c = 0; c < 8; c++) {
      b[idx(0, c)] = "b" + back[c];
      b[idx(1, c)] = "bP";
      b[idx(6, c)] = "wP";
      b[idx(7, c)] = "w" + back[c];
    }
    return b;
  }

  // ---- the Game object ----------------------------------------------
  class Game {
    constructor() {
      this.reset();
    }

    reset() {
      this.board = startBoard();
      this.turn = WHITE;
      // castling rights: {wK, wQ, bK, bQ}
      this.castling = { wK: true, wQ: true, bK: true, bQ: true };
      this.enPassant = null; // index of the square a pawn can capture onto
      this.halfmove = 0; // for the 50-move rule
      this.fullmove = 1;
      this.history = []; // stack of undo records
    }

    clone() {
      const g = new Game();
      g.board = this.board.slice();
      g.turn = this.turn;
      g.castling = Object.assign({}, this.castling);
      g.enPassant = this.enPassant;
      g.halfmove = this.halfmove;
      g.fullmove = this.fullmove;
      g.history = []; // clones are for analysis; no shared history
      return g;
    }

    pieceAt(index) {
      return this.board[index];
    }

    // Find the king of a given color.
    kingIndex(color) {
      const k = color + "K";
      for (let i = 0; i < 64; i++) if (this.board[i] === k) return i;
      return -1;
    }

    // Is `color`'s king currently attacked?
    inCheck(color) {
      const k = this.kingIndex(color);
      if (k < 0) return false;
      return this.isAttacked(k, opposite(color));
    }

    // Is square `index` attacked by any piece of `byColor`?
    isAttacked(index, byColor) {
      const [r, c] = rc(index);

      // Pawn attacks: a byColor pawn attacks diagonally "forward".
      const dir = byColor === WHITE ? -1 : 1; // white pawns move up (row-1)
      for (const dc of [-1, 1]) {
        const rr = r + dir, cc = c + dc;
        if (onBoard(rr, cc) && this.board[idx(rr, cc)] === byColor + "P")
          return true;
      }

      // Knight attacks.
      const knight = [
        [-2, -1], [-2, 1], [-1, -2], [-1, 2],
        [1, -2], [1, 2], [2, -1], [2, 1],
      ];
      for (const [dr, dc] of knight) {
        const rr = r + dr, cc = c + dc;
        if (onBoard(rr, cc) && this.board[idx(rr, cc)] === byColor + "N")
          return true;
      }

      // King attacks (adjacent squares).
      for (let dr = -1; dr <= 1; dr++) {
        for (let dc = -1; dc <= 1; dc++) {
          if (!dr && !dc) continue;
          const rr = r + dr, cc = c + dc;
          if (onBoard(rr, cc) && this.board[idx(rr, cc)] === byColor + "K")
            return true;
        }
      }

      // Sliding pieces: rook/queen on orthogonals, bishop/queen on diagonals.
      const ortho = [[-1, 0], [1, 0], [0, -1], [0, 1]];
      const diag = [[-1, -1], [-1, 1], [1, -1], [1, 1]];
      const scan = (dirs, types) => {
        for (const [dr, dc] of dirs) {
          let rr = r + dr, cc = c + dc;
          while (onBoard(rr, cc)) {
            const p = this.board[idx(rr, cc)];
            if (p) {
              if (p[0] === byColor && types.indexOf(p[1]) >= 0) return true;
              break;
            }
            rr += dr; cc += dc;
          }
        }
        return false;
      };
      if (scan(ortho, "RQ")) return true;
      if (scan(diag, "BQ")) return true;

      return false;
    }

    // Pseudo-legal moves (may leave own king in check); legality filtered
    // in legalMoves().  Each move: {from, to, piece, captured, promotion,
    //   flag}  where flag ∈ {"", "double", "enpassant", "castle"}.
    pseudoMoves(color) {
      const moves = [];
      for (let i = 0; i < 64; i++) {
        const p = this.board[i];
        if (!p || p[0] !== color) continue;
        const type = p[1];
        const [r, c] = rc(i);

        if (type === "P") {
          const dir = color === WHITE ? -1 : 1;
          const startRow = color === WHITE ? 6 : 1;
          const promoRow = color === WHITE ? 0 : 7;
          const one = idx(r + dir, c);
          if (onBoard(r + dir, c) && !this.board[one]) {
            this._pawnPush(moves, i, one, r + dir === promoRow, color);
            // double push
            if (r === startRow) {
              const two = idx(r + 2 * dir, c);
              if (!this.board[two])
                moves.push({ from: i, to: two, piece: p, captured: null,
                  promotion: null, flag: "double" });
            }
          }
          // captures
          for (const dc of [-1, 1]) {
            const rr = r + dir, cc = c + dc;
            if (!onBoard(rr, cc)) continue;
            const t = idx(rr, cc);
            const target = this.board[t];
            if (target && target[0] !== color) {
              this._pawnPush(moves, i, t, rr === promoRow, color, target);
            } else if (t === this.enPassant) {
              moves.push({ from: i, to: t, piece: p,
                captured: opposite(color) + "P", promotion: null,
                flag: "enpassant" });
            }
          }
        } else if (type === "N") {
          const steps = [
            [-2, -1], [-2, 1], [-1, -2], [-1, 2],
            [1, -2], [1, 2], [2, -1], [2, 1],
          ];
          this._stepMoves(moves, i, r, c, steps, color, p);
        } else if (type === "K") {
          const steps = [
            [-1, -1], [-1, 0], [-1, 1], [0, -1],
            [0, 1], [1, -1], [1, 0], [1, 1],
          ];
          this._stepMoves(moves, i, r, c, steps, color, p);
          this._castleMoves(moves, i, color, p);
        } else {
          const dirs =
            type === "R" ? [[-1, 0], [1, 0], [0, -1], [0, 1]]
            : type === "B" ? [[-1, -1], [-1, 1], [1, -1], [1, 1]]
            : [[-1, 0], [1, 0], [0, -1], [0, 1],
               [-1, -1], [-1, 1], [1, -1], [1, 1]]; // queen
          this._slideMoves(moves, i, r, c, dirs, color, p);
        }
      }
      return moves;
    }

    _pawnPush(moves, from, to, promo, color, captured = null) {
      const piece = color + "P";
      if (promo) {
        for (const pr of ["Q", "R", "B", "N"])
          moves.push({ from, to, piece, captured, promotion: color + pr,
            flag: "" });
      } else {
        moves.push({ from, to, piece, captured, promotion: null, flag: "" });
      }
    }

    _stepMoves(moves, from, r, c, steps, color, piece) {
      for (const [dr, dc] of steps) {
        const rr = r + dr, cc = c + dc;
        if (!onBoard(rr, cc)) continue;
        const to = idx(rr, cc);
        const t = this.board[to];
        if (!t || t[0] !== color)
          moves.push({ from, to, piece, captured: t || null,
            promotion: null, flag: "" });
      }
    }

    _slideMoves(moves, from, r, c, dirs, color, piece) {
      for (const [dr, dc] of dirs) {
        let rr = r + dr, cc = c + dc;
        while (onBoard(rr, cc)) {
          const to = idx(rr, cc);
          const t = this.board[to];
          if (!t) {
            moves.push({ from, to, piece, captured: null, promotion: null,
              flag: "" });
          } else {
            if (t[0] !== color)
              moves.push({ from, to, piece, captured: t, promotion: null,
                flag: "" });
            break;
          }
          rr += dr; cc += dc;
        }
      }
    }

    _castleMoves(moves, from, color, piece) {
      const row = color === WHITE ? 7 : 0;
      if (from !== idx(row, 4)) return; // king not on its start square
      if (this.inCheck(color)) return; // cannot castle out of check
      const enemy = opposite(color);
      // kingside
      if ((color === WHITE ? this.castling.wK : this.castling.bK)) {
        if (!this.board[idx(row, 5)] && !this.board[idx(row, 6)] &&
            this.board[idx(row, 7)] === color + "R" &&
            !this.isAttacked(idx(row, 5), enemy) &&
            !this.isAttacked(idx(row, 6), enemy)) {
          moves.push({ from, to: idx(row, 6), piece, captured: null,
            promotion: null, flag: "castle" });
        }
      }
      // queenside
      if ((color === WHITE ? this.castling.wQ : this.castling.bQ)) {
        if (!this.board[idx(row, 3)] && !this.board[idx(row, 2)] &&
            !this.board[idx(row, 1)] &&
            this.board[idx(row, 0)] === color + "R" &&
            !this.isAttacked(idx(row, 3), enemy) &&
            !this.isAttacked(idx(row, 2), enemy)) {
          moves.push({ from, to: idx(row, 2), piece, captured: null,
            promotion: null, flag: "castle" });
        }
      }
    }

    // Apply a move, pushing an undo record.  No legality check here.
    makeMove(m) {
      const undo = {
        move: m,
        castling: Object.assign({}, this.castling),
        enPassant: this.enPassant,
        halfmove: this.halfmove,
        fullmove: this.fullmove,
        turn: this.turn,
        capturedSquare: null,
        capturedPiece: null,
        rookMove: null,
      };

      const color = this.turn;
      const [, fromCol] = rc(m.from);
      const [toRow, toCol] = rc(m.to);

      // reset en-passant; recompute below for double pushes
      this.enPassant = null;

      // Move the piece.
      this.board[m.from] = null;
      if (m.flag === "enpassant") {
        // captured pawn sits on the mover's own row, target column
        const dir = color === WHITE ? 1 : -1; // captured pawn is "behind"
        const capIdx = idx(toRow + dir, toCol);
        undo.capturedSquare = capIdx;
        undo.capturedPiece = this.board[capIdx];
        this.board[capIdx] = null;
        this.board[m.to] = m.piece;
      } else {
        if (m.captured) {
          undo.capturedSquare = m.to;
          undo.capturedPiece = this.board[m.to];
        }
        this.board[m.to] = m.promotion ? m.promotion : m.piece;
      }

      // Castling: move the rook too.
      if (m.flag === "castle") {
        const row = color === WHITE ? 7 : 0;
        if (toCol === 6) {
          undo.rookMove = { from: idx(row, 7), to: idx(row, 5) };
          this.board[idx(row, 5)] = this.board[idx(row, 7)];
          this.board[idx(row, 7)] = null;
        } else {
          undo.rookMove = { from: idx(row, 0), to: idx(row, 3) };
          this.board[idx(row, 3)] = this.board[idx(row, 0)];
          this.board[idx(row, 0)] = null;
        }
      }

      // Double push sets the en-passant target square.
      if (m.flag === "double") {
        const dir = color === WHITE ? -1 : 1;
        this.enPassant = idx(rc(m.from)[0] + dir, fromCol);
      }

      // Update castling rights.
      if (m.piece[1] === "K") {
        if (color === WHITE) { this.castling.wK = false; this.castling.wQ = false; }
        else { this.castling.bK = false; this.castling.bQ = false; }
      }
      // rook moved from a corner, or a piece captured a rook on a corner
      const touch = (sq) => {
        if (sq === idx(7, 0)) this.castling.wQ = false;
        if (sq === idx(7, 7)) this.castling.wK = false;
        if (sq === idx(0, 0)) this.castling.bQ = false;
        if (sq === idx(0, 7)) this.castling.bK = false;
      };
      touch(m.from);
      touch(m.to);

      // Halfmove clock (50-move rule).
      if (m.piece[1] === "P" || m.captured) this.halfmove = 0;
      else this.halfmove++;

      if (color === BLACK) this.fullmove++;
      this.turn = opposite(color);
      this.history.push(undo);
      return undo;
    }

    undoMove() {
      const undo = this.history.pop();
      if (!undo) return;
      const m = undo.move;
      this.turn = undo.turn;
      this.castling = undo.castling;
      this.enPassant = undo.enPassant;
      this.halfmove = undo.halfmove;
      this.fullmove = undo.fullmove;

      // Put the mover back (un-promote if needed).
      this.board[m.from] = m.piece;
      this.board[m.to] = null;

      if (undo.capturedSquare !== null)
        this.board[undo.capturedSquare] = undo.capturedPiece;

      if (undo.rookMove) {
        this.board[undo.rookMove.from] = this.board[undo.rookMove.to];
        this.board[undo.rookMove.to] = null;
      }
    }

    // Fully legal moves for the side to move (or a given color).
    legalMoves(color = this.turn) {
      const result = [];
      const pseudo = this.pseudoMoves(color);
      for (const m of pseudo) {
        this.makeMove(m);
        if (!this.inCheck(color)) result.push(m);
        this.undoMove();
      }
      return result;
    }

    isCheckmate() {
      return this.inCheck(this.turn) && this.legalMoves().length === 0;
    }
    isStalemate() {
      return !this.inCheck(this.turn) && this.legalMoves().length === 0;
    }
    isDraw() {
      return this.isStalemate() || this.halfmove >= 100 ||
        this.insufficientMaterial();
    }
    insufficientMaterial() {
      const pieces = this.board.filter(Boolean).map((p) => p[1]).sort().join("");
      // K vs K, K+N vs K, K+B vs K
      return pieces === "KK" || pieces === "KKN" || pieces === "BKK";
    }

    // Convert a legal move to Standard Algebraic Notation (SAN).
    toSAN(m) {
      if (m.flag === "castle")
        return rc(m.to)[1] === 6 ? "O-O" : "O-O-O";

      const type = m.piece[1];
      let san = "";
      if (type === "P") {
        if (m.captured || m.flag === "enpassant")
          san += "abcdefgh"[rc(m.from)[1]] + "x";
        san += algebraic(m.to);
        if (m.promotion) san += "=" + m.promotion[1];
      } else {
        san += type;
        // disambiguation
        const others = this.legalMoves(m.piece[0]).filter(
          (o) => o.piece === m.piece && o.to === m.to && o.from !== m.from
        );
        if (others.length) {
          const [fr, fc] = rc(m.from);
          const sameFile = others.some((o) => rc(o.from)[1] === fc);
          const sameRank = others.some((o) => rc(o.from)[0] === fr);
          if (!sameFile) san += "abcdefgh"[fc];
          else if (!sameRank) san += String(8 - fr);
          else san += algebraic(m.from);
        }
        if (m.captured) san += "x";
        san += algebraic(m.to);
      }

      // check / checkmate suffix
      this.makeMove(m);
      if (this.isCheckmate()) san += "#";
      else if (this.inCheck(this.turn)) san += "+";
      this.undoMove();
      return san;
    }
  }

  const api = {
    Game, WHITE, BLACK, opposite,
    idx, rc, algebraic, fromAlgebraic, onBoard,
  };

  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.ChessEngine = api;
})(typeof window !== "undefined" ? window : globalThis);
