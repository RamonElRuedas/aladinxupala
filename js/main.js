// UI wiring: screen navigation + connecting DOM events to Game/Multiplayer.
(function () {
  "use strict";

  const screens = {};
  document.querySelectorAll(".screen").forEach((el) => {
    screens[el.id] = el;
  });

  function showScreen(id) {
    Object.values(screens).forEach((el) => el.classList.remove("active"));
    screens[id].classList.add("active");
  }

  const els = {
    playerName: document.getElementById("player-name"),
    apiKey: document.getElementById("maps-api-key"),
    btnHost: document.getElementById("btn-host"),
    btnJoin: document.getElementById("btn-join"),
    joinCode: document.getElementById("join-code"),
    homeError: document.getElementById("home-error"),

    roundCount: document.getElementById("round-count"),
    roundTime: document.getElementById("round-time"),
    btnAreaBack: document.getElementById("btn-area-back"),
    btnAreaContinue: document.getElementById("btn-area-continue"),
    areaError: document.getElementById("area-error"),

    roomCodeDisplay: document.getElementById("room-code-display"),
    playerList: document.getElementById("player-list"),
    btnLobbyLeave: document.getElementById("btn-lobby-leave"),
    btnLobbyStart: document.getElementById("btn-lobby-start"),
    lobbyStatus: document.getElementById("lobby-status"),

    hudRound: document.getElementById("hud-round"),
    hudTotalRounds: document.getElementById("hud-total-rounds"),
    hudTimer: document.getElementById("hud-timer"),
    hudScore: document.getElementById("hud-score"),
    btnSubmitGuess: document.getElementById("btn-submit-guess"),

    resultList: document.getElementById("result-list"),
    btnNextRound: document.getElementById("btn-next-round"),

    finalList: document.getElementById("final-list"),
    btnPlayAgain: document.getElementById("btn-play-again"),
  };

  // Restore saved preferences.
  els.playerName.value = localStorage.getItem("geoduel_name") || "";
  els.apiKey.value = localStorage.getItem("geoduel_apikey") || "";

  let multiplayer = null;
  let game = null;
  let areaMap = null;
  let guessMap = null;
  let resultMap = null;
  let countdownInterval = null;
  let pendingGuess = null;

  function requirePlayerName() {
    const name = els.playerName.value.trim();
    if (!name) {
      els.homeError.textContent = "Please enter your name.";
      return null;
    }
    localStorage.setItem("geoduel_name", name);
    return name;
  }

  function requireApiKey() {
    const key = els.apiKey.value.trim();
    if (!key) {
      els.homeError.textContent = "Please enter a Google Maps API key.";
      return null;
    }
    localStorage.setItem("geoduel_apikey", key);
    return key;
  }

  // ---- Host flow ----

  els.btnHost.addEventListener("click", () => {
    els.homeError.textContent = "";
    const name = requirePlayerName();
    const apiKey = requireApiKey();
    if (!name || !apiKey) return;

    showScreen("screen-area");
    if (!areaMap) {
      areaMap = new AreaMap("area-map", (polygon) => {
        els.btnAreaContinue.disabled = !polygon || polygon.length < 3;
      });
    }
  });

  els.btnAreaBack.addEventListener("click", () => {
    showScreen("screen-home");
  });

  els.btnAreaContinue.addEventListener("click", async () => {
    els.areaError.textContent = "";
    const polygon = areaMap.getPolygon();
    if (!polygon || polygon.length < 3) {
      els.areaError.textContent = "Draw a polygon with at least 3 points first.";
      return;
    }

    const roomCode = Geometry.generateRoomCode();
    multiplayer = new Multiplayer();
    try {
      const id = await multiplayer.hostGame(roomCode);
      game = new Game(multiplayer, {
        isHost: true,
        playerName: els.playerName.value.trim(),
        roomCode,
      });
      game.setSelf(id);
      game.setArea(polygon);
      game.setRoundOptions(
        parseInt(els.roundCount.value, 10) || 5,
        parseInt(els.roundTime.value, 10) || 90
      );
      wireGameHandlers();

      els.roomCodeDisplay.textContent = roomCode;
      els.btnLobbyStart.style.display = "inline-block";
      els.lobbyStatus.textContent = "Waiting for players to join...";
      renderPlayerList(game.playerList());
      showScreen("screen-lobby");
    } catch (err) {
      els.areaError.textContent = "Could not start hosting: " + err.message;
    }
  });

  els.btnLobbyStart.addEventListener("click", async () => {
    game.startGame();
  });

  // ---- Join flow ----

  els.btnJoin.addEventListener("click", async () => {
    els.homeError.textContent = "";
    const name = requirePlayerName();
    const apiKey = requireApiKey();
    const code = els.joinCode.value.trim().toUpperCase();
    if (!name || !apiKey) return;
    if (!code) {
      els.homeError.textContent = "Please enter a room code.";
      return;
    }

    multiplayer = new Multiplayer();
    try {
      const id = await multiplayer.joinGame(code);
      game = new Game(multiplayer, { isHost: false, playerName: name, roomCode: code });
      game.setSelf(id);
      wireGameHandlers();
      game.announceJoin();

      els.roomCodeDisplay.textContent = code;
      els.btnLobbyStart.style.display = "none";
      els.lobbyStatus.textContent = "Waiting for the host to start the game...";
      renderPlayerList(game.playerList());
      showScreen("screen-lobby");
    } catch (err) {
      els.homeError.textContent = "Could not join room: " + (err.message || err);
    }
  });

  els.btnLobbyLeave.addEventListener("click", () => {
    if (multiplayer) multiplayer.destroy();
    showScreen("screen-home");
  });

  function renderPlayerList(players) {
    els.playerList.innerHTML = "";
    for (const p of players) {
      const li = document.createElement("li");
      li.textContent = p.name;
      const score = document.createElement("span");
      score.textContent = p.score + " pts";
      li.appendChild(score);
      els.playerList.appendChild(li);
    }
  }

  // ---- Game flow ----

  function wireGameHandlers() {
    game.on("onPlayersChanged", (players) => {
      renderPlayerList(players);
    });

    game.on("onRoundStart", async (msg) => {
      showScreen("screen-game");
      els.hudRound.textContent = msg.roundIndex + 1;
      els.hudTotalRounds.textContent = game.roundCount;
      els.btnSubmitGuess.disabled = true;
      pendingGuess = null;

      if (!guessMap) {
        guessMap = new GuessMap("guess-map", (loc) => {
          pendingGuess = loc;
          els.btnSubmitGuess.disabled = false;
        });
      } else {
        guessMap.reset();
        guessMap.invalidateSize();
      }

      startCountdown(msg.roundTimeSeconds);

      try {
        await StreetViewModule.showStreetView(
          "street-view",
          els.apiKey.value.trim(),
          { lat: msg.lat, lng: msg.lng },
          DEFAULT_RADIUS_SEARCH_M
        );
      } catch (err) {
        document.getElementById("street-view").textContent =
          "Could not load Street View: " + err.message;
      }
    });

    game.on("onRoundResult", (msg) => {
      clearInterval(countdownInterval);
      showScreen("screen-round-result");
      if (!resultMap) resultMap = new ResultMap("result-map");
      resultMap.invalidateSize();
      resultMap.render(msg.actual, msg.guesses);

      els.resultList.innerHTML = "";
      const sorted = [...msg.guesses].sort((a, b) => b.score - a.score);
      for (const g of sorted) {
        const li = document.createElement("li");
        const distanceText = g.distanceKm === null ? "no guess" : g.distanceKm.toFixed(1) + " km away";
        li.textContent = g.name + " — " + distanceText;
        const score = document.createElement("span");
        score.textContent = "+" + g.score + " (total " + g.totalScore + ")";
        li.appendChild(score);
        els.resultList.appendChild(li);
      }

      const self = msg.guesses.find((g) => g.id === game.selfId);
      if (self) els.hudScore.textContent = self.totalScore;

      els.btnNextRound.style.display = game.isHost ? "inline-block" : "none";
    });

    game.on("onGameEnd", (msg) => {
      showScreen("screen-final");
      els.finalList.innerHTML = "";
      const sorted = [...msg.players].sort((a, b) => b.score - a.score);
      for (const p of sorted) {
        const li = document.createElement("li");
        li.textContent = p.name;
        const score = document.createElement("span");
        score.textContent = p.score + " pts";
        li.appendChild(score);
        els.finalList.appendChild(li);
      }
    });

    game.on("onHostDisconnected", () => {
      els.lobbyStatus.textContent = "The host disconnected.";
      showScreen("screen-home");
    });
  }

  els.btnSubmitGuess.addEventListener("click", () => {
    if (!pendingGuess) return;
    game.submitGuess(pendingGuess);
    els.btnSubmitGuess.disabled = true;
  });

  els.btnNextRound.addEventListener("click", () => {
    game.nextRound();
  });

  els.btnPlayAgain.addEventListener("click", () => {
    if (multiplayer) multiplayer.destroy();
    showScreen("screen-home");
  });

  function startCountdown(seconds) {
    clearInterval(countdownInterval);
    let remaining = seconds;
    els.hudTimer.textContent = remaining;
    countdownInterval = setInterval(() => {
      remaining -= 1;
      els.hudTimer.textContent = Math.max(0, remaining);
      if (remaining <= 0) {
        clearInterval(countdownInterval);
      }
    }, 1000);
  }
})();
