/* =====================================================================
 * app.js  —  the browser glue: draws the board, handles clicks, asks the
 * coach to review each of YOUR moves (in English), then lets the coach
 * (the engine) reply.  Depends on engine.js + coach.js.
 * ===================================================================== */

(function () {
  "use strict";

  const E = window.ChessEngine;
  const C = window.ChessCoach;
  const { idx, rc, algebraic, WHITE, BLACK } = E;

  const GLYPH = {
    wK: "♚", wQ: "♛", wR: "♜", wB: "♝", wN: "♞", wP: "♟",
    bK: "♚", bQ: "♛", bR: "♜", bB: "♝", bN: "♞", bP: "♟",
  };

  // ---- state ----
  let game = new E.Game();
  let humanColor = WHITE;
  let depth = 3;
  let selected = null;       // selected source square index
  let legalForSel = [];      // legal moves from the selected square
  let lastMove = null;       // {from,to} for highlighting
  let busy = false;          // true while the coach is "thinking"

  const boardEl = document.getElementById("board");
  const statusEl = document.getElementById("status");
  const coachBody = document.getElementById("coach-body");
  const movesBody = document.querySelector("#moves tbody");

  // ---- board drawing ----
  function draw() {
    boardEl.innerHTML = "";
    const flip = humanColor === BLACK;
    for (let visRow = 0; visRow < 8; visRow++) {
      for (let visCol = 0; visCol < 8; visCol++) {
        const row = flip ? 7 - visRow : visRow;
        const col = flip ? 7 - visCol : visCol;
        const i = idx(row, col);
        const sq = document.createElement("div");
        sq.className = "sq " + ((row + col) % 2 === 0 ? "light" : "dark");
        sq.dataset.i = i;

        if (lastMove && (lastMove.from === i || lastMove.to === i))
          sq.classList.add("last");
        if (selected === i) sq.classList.add("sel");

        const p = game.board[i];
        if (p) {
          const span = document.createElement("span");
          span.className = "piece " + p[0];
          span.textContent = GLYPH[p];
          sq.appendChild(span);
        }

        // move hints for the selected piece
        const mv = legalForSel.find((m) => m.to === i);
        if (mv) {
          const dot = document.createElement("span");
          dot.className = "hint" + (mv.captured || mv.flag === "enpassant" ? " capture" : "");
          sq.appendChild(dot);
        }

        // coordinate labels on the edges
        if (visCol === 0) {
          const r = document.createElement("span");
          r.className = "coord rank"; r.textContent = 8 - row;
          sq.appendChild(r);
        }
        if (visRow === 7) {
          const f = document.createElement("span");
          f.className = "coord file"; f.textContent = "abcdefgh"[col];
          sq.appendChild(f);
        }

        sq.addEventListener("click", () => onSquare(i));
        boardEl.appendChild(sq);
      }
    }
  }

  // ---- clicking ----
  function onSquare(i) {
    if (busy || game.turn !== humanColor) return;

    // clicking a legal destination of the selected piece
    if (selected !== null) {
      const mv = legalForSel.filter((m) => m.to === i);
      if (mv.length) {
        if (mv.length > 1 && mv[0].promotion) askPromotion(mv);
        else playHuman(mv[0]);
        return;
      }
    }

    // otherwise (re)select a friendly piece
    const p = game.board[i];
    if (p && p[0] === humanColor) {
      selected = i;
      legalForSel = game.legalMoves().filter((m) => m.from === i);
    } else {
      selected = null; legalForSel = [];
    }
    draw();
  }

  function askPromotion(moves) {
    const box = document.getElementById("promo");
    const choices = document.getElementById("promo-choices");
    choices.innerHTML = "";
    for (const m of moves) {
      const b = document.createElement("button");
      b.className = "piece " + humanColor;
      b.textContent = GLYPH[m.promotion];
      b.style.color = humanColor === WHITE ? "#fff" : "#222";
      b.onclick = () => { box.style.display = "none"; playHuman(m); };
      choices.appendChild(b);
    }
    box.style.display = "flex";
  }

  // ---- the move + coaching flow ----
  function playHuman(move) {
    const before = game.clone();            // position with YOU to move
    const san = game.toSAN(move);

    busy = true;
    showThinking();

    // Review is a little heavy at high levels — defer so the UI can paint.
    setTimeout(() => {
      const review = C.reviewMove(before, move, Math.min(depth, 3));
      game.makeMove(move);
      lastMove = { from: move.from, to: move.to };
      selected = null; legalForSel = [];
      addMoveRow(san);
      renderCoach(review);
      draw();

      if (finished()) { busy = false; return; }
      setTimeout(engineReply, 350);
    }, 20);
  }

  function engineReply() {
    const think = C.chooseMove(game, depth);
    if (!think) { busy = false; finished(); return; }
    const san = game.toSAN(think);
    game.makeMove(think);
    lastMove = { from: think.from, to: think.to };
    addMoveRow(san);
    draw();
    busy = false;
    if (!finished()) setStatus(`<b>Your move.</b> ${describeTurn()}`);
  }

  // ---- rendering the coach ----
  function showThinking() {
    coachBody.innerHTML = `<p class="think">Let me look at that move…</p>`;
  }

  const FACES = {
    best: "Excellent — that's exactly what I would play.",
    great: "Very nice. Almost perfect.",
    good: "A reasonable move. Let's keep going.",
    inaccuracy: "Not the most precise. Let me show you a better idea.",
    mistake: "Careful — that move has a problem.",
    blunder: "Stop! That move gives away too much. Let's learn from it.",
  };

  function renderCoach(r) {
    const k = r.classification.key;
    const paras = r.lines.map((t) => `<p>${escapeHtml(t)}</p>`).join("");
    const bestLine = (k === "best" || k === "great")
      ? ""
      : `<p class="move">Best move was <span class="best">${escapeHtml(r.bestSAN)}</span>.</p>`;
    coachBody.innerHTML = `
      <div class="verdict">
        <span class="badge k-${k}">${r.classification.icon}</span>
        <span class="k-${k}" style="font-weight:700">${r.classification.label}</span>
        <span class="move">— you played ${escapeHtml(r.playedSAN)}</span>
      </div>
      <div class="explain">${paras}${bestLine}</div>
      <div class="coach-face">${FACES[k] || ""}</div>
    `;
  }

  // ---- move list ----
  let plyCount = 0;
  function addMoveRow(san) {
    const isWhite = plyCount % 2 === 0;
    if (isWhite) {
      const tr = document.createElement("tr");
      tr.innerHTML = `<td class="n">${Math.floor(plyCount / 2) + 1}.</td>
        <td class="m">${escapeHtml(san)}</td><td class="m"></td>`;
      movesBody.appendChild(tr);
    } else {
      const last = movesBody.lastElementChild;
      if (last) last.children[2].textContent = san;
    }
    plyCount++;
    const box = document.getElementById("moves");
    box.scrollTop = box.scrollHeight;
  }

  // ---- status / endgame ----
  function describeTurn() {
    if (game.inCheck(game.turn)) return "You are in check — you must get out of it.";
    return "";
  }

  function finished() {
    if (game.isCheckmate()) {
      const winner = game.turn === humanColor ? "The coach" : "You";
      const youWon = game.turn !== humanColor;
      setStatus(`<b>Checkmate.</b> ${winner} won.`);
      coachBody.innerHTML += `<div class="coach-face">${
        youWon ? "Congratulations — a clean checkmate! 🏆"
               : "Checkmate. Review the moves marked ?? and ? to see where it slipped away."
      }</div>`;
      return true;
    }
    if (game.isStalemate()) { setStatus("<b>Stalemate</b> — it's a draw. No legal moves, but no check."); return true; }
    if (game.isDraw()) { setStatus("<b>Draw</b> (insufficient material or the 50-move rule)."); return true; }
    return false;
  }

  function setStatus(html) { statusEl.innerHTML = html; }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  }

  // ---- controls ----
  function newGame() {
    game = new E.Game();
    selected = null; legalForSel = []; lastMove = null; busy = false; plyCount = 0;
    movesBody.innerHTML = "";
    coachBody.innerHTML = `<p class="think">New game. ${
      humanColor === WHITE ? "You are White — make the first move!"
                           : "You are Black. I'll open…"
    }</p>`;
    draw();
    if (humanColor !== WHITE) { busy = true; setTimeout(engineReply, 400); }
    else setStatus("<b>Your move.</b> White to play.");
  }

  function takeBack() {
    if (busy) return;
    // undo back to the human's previous turn (two plies: engine + you)
    if (game.history.length === 0) return;
    game.undoMove();
    plyCount = Math.max(0, plyCount - 1);
    if (game.history.length && game.turn !== humanColor) {
      game.undoMove(); plyCount = Math.max(0, plyCount - 1);
    }
    rebuildMoveList();
    selected = null; legalForSel = [];
    lastMove = game.history.length
      ? { from: game.history[game.history.length - 1].move.from,
          to: game.history[game.history.length - 1].move.to }
      : null;
    coachBody.innerHTML = `<p class="think">Took the move back. Try a different idea.</p>`;
    draw();
    setStatus("<b>Your move.</b>");
  }

  function rebuildMoveList() {
    // Replay history to regenerate SAN cleanly.
    const moves = game.history.map((h) => h.move);
    const tmp = new E.Game();
    movesBody.innerHTML = ""; plyCount = 0;
    for (const m of moves) {
      const san = tmp.toSAN(m);
      tmp.makeMove(m);
      addMoveRow(san);
    }
  }

  document.getElementById("newgame").onclick = newGame;
  document.getElementById("takeback").onclick = takeBack;
  document.getElementById("side").onchange = (e) => {
    humanColor = e.target.value === "b" ? BLACK : WHITE;
    newGame();
  };
  document.getElementById("level").onchange = (e) => { depth = parseInt(e.target.value, 10); };

  // ---- go ----
  draw();
  setStatus("<b>Your move.</b> White to play. Good luck!");
})();
