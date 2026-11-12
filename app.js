(() => {
  "use strict";

  const $ = id => document.getElementById(id);

  const API_SERVERS = [
    "https://de1.api.radio-browser.info",
    "https://at1.api.radio-browser.info",
    "https://nl1.api.radio-browser.info"
  ];

  const REGION_CODES = {
    Africa: "DZ AO BJ BW BF BI CV CM CF TD KM CG CD CI DJ EG GQ ER SZ ET GA GM GH GN GW KE LS LR LY MG MW ML MR MU MA MZ NA NE NG RW ST SN SC SL SO ZA SS SD TZ TG UG ZM ZW".split(" "),
    Europe: "AL AD AT BY BE BA BG HR CY CZ DK EE FI FR DE GR HU IS IE IT XK LV LI LT LU MT MD MC ME NL MK NO PL PT RO RU SM RS SK SI ES SE CH UA GB VA".split(" "),
    Asia: "AF AM AZ BH BD BT BN KH CN GE IN ID IR IQ IL JP JO KZ KW KG LA LB MY MV MN MM NP KP OM PK PS PH QA SA SG KR LK SY TW TJ TH TL TR TM AE UZ VN YE".split(" "),
    "North America": "AG BS BB BZ CA CR CU DM DO SV GD GT HT HN JM MX NI PA KN LC VC TT US".split(" "),
    "South America": "AR BO BR CL CO EC GY PY PE SR UY VE".split(" "),
    Oceania: "AU FJ KI MH FM NR NZ PW PG WS SB TO TV VU".split(" ")
  };

  const state = {
    server: API_SERVERS[0],
    stations: [],
    view: "popular",
    offset: 0,
    limit: 48,
    loading: false,
    favorites: loadFavorites(),
    current: null,
    deferredInstall: null
  };

  const audio = $("audioPlayer");
  let toastTimer;

  // FAVORIS

  function loadFavorites() {
    try {
      return JSON.parse(localStorage.getItem("rmas_favorites") || "[]");
    } catch {
      return [];
    }
  }

  function saveFavorites() {
    localStorage.setItem(
      "rmas_favorites",
      JSON.stringify(state.favorites)
    );

    $("favoriteCount").textContent = state.favorites.length;
  }

  // NOTIFICATIONS

  function notify(message) {
    const el = $("toast");

    el.textContent = message;
    el.classList.add("show");

    clearTimeout(toastTimer);

    toastTimer = setTimeout(() => {
      el.classList.remove("show");
    }, 2800);
  }

  // PROTECTION DES TEXTES AFFICHÉS

  function safeText(value) {
    return String(value || "").replace(/[&<>"']/g, c => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;"
    })[c]);
  }

  // CONNEXION AU CATALOGUE RADIO

  async function api(path) {
    let lastError;

    const servers = [
      state.server,
      ...API_SERVERS.filter(s => s !== state.server)
    ];

    for (const server of servers) {
      try {
        const response = await fetch(server + path, {
          headers: {
            "Accept": "application/json"
          },
          cache: "no-store"
        });

        if (!response.ok) {
          throw new Error("Service radio indisponible.");
        }

        state.server = server;

        return await response.json();

      } catch (error) {
        lastError = error;
      }
    }

    throw lastError || new Error(
      "Impossible de joindre le catalogue radio."
    );
  }

  function qs(params) {
    return new URLSearchParams(params).toString();
  }

  // INITIALISATION

  async function init() {
    $("year").textContent = new Date().getFullYear();

    saveFavorites();

    $("volumeSlider").addEventListener("input", event => {
      audio.volume = Number(event.target.value);
    });

    $("playPauseBtn").addEventListener(
      "click",
      togglePlayback
    );

    $("searchInput").addEventListener(
      "input",
      debounce(loadStations, 400)
    );

    [
      "zoneSelect",
      "countrySelect",
      "genreSelect"
    ].forEach(id => {
      $(id).addEventListener("change", loadStations);
    });

    $("resetBtn").addEventListener("click", () => {
      $("searchInput").value = "";
      $("zoneSelect").value = "all";
      $("countrySelect").value = "";
      $("genreSelect").value = "";

      loadStations();
    });

    $("refreshBtn").addEventListener(
      "click",
      loadStations
    );

    $("loadMoreBtn").addEventListener("click", () => {
      state.offset += state.limit;
      renderStations(true);
    });

    document.querySelectorAll(".tab").forEach(tab => {
      tab.addEventListener("click", () => {
        document.querySelectorAll(".tab").forEach(t => {
          t.classList.toggle("active", t === tab);
        });

        state.view = tab.dataset.view;
        state.offset = 0;

        if (state.view === "favorites") {
          loadFavoriteStations();
        } else {
          loadStations();
        }
      });
    });

    audio.addEventListener("playing", () => {
      setPlayerState(true, "Lecture en direct");
    });

    audio.addEventListener("pause", () => {
      setPlayerState(false, "Lecture en pause");
    });

    audio.addEventListener("waiting", () => {
      $("playerStatus").textContent = "Connexion au flux...";
    });

    audio.addEventListener("error", () => {
      setPlayerState(false, "Flux indisponible");

      notify(
        "Cette station ne répond pas. Essayez une autre radio."
      );
    });

    audio.volume = 0.8;

    await Promise.allSettled([
      loadCountries(),
      loadGenres()
    ]);

    await loadStations();

    if ("serviceWorker" in navigator) {
      window.addEventListener("load", () => {
        navigator.serviceWorker
          .register("./sw.js")
          .catch(error => console.log("Service Worker :", error));
      });
    }
  }

  function debounce(fn, wait) {
    let timer;

    return (...args) => {
      clearTimeout(timer);
      timer = setTimeout(() => fn(...args), wait);
    };
  }

  // LISTE DES PAYS

  async function loadCountries() {
    try {
      const countries = await api(
        "/json/countries?order=name&hidebroken=true"
      );

      $("countryCount").textContent =
        countries.length.toLocaleString("fr-FR");

      const select = $("countrySelect");

      countries.sort((a, b) =>
        a.name.localeCompare(b.name)
      );

      countries.forEach(country => {
        const option = document.createElement("option");

        option.value = country.name;

        option.textContent =
          country.name +
          " (" +
          Number(country.stationcount || 0)
            .toLocaleString("fr-FR") +
          ")";

        select.appendChild(option);
      });

    } catch (error) {
      $("countryCount").textContent = "—";
    }
  }

  // GENRES MUSICAUX

  async function loadGenres() {
    try {
      const genres = await api(
        "/json/tags?order=stationcount&reverse=true&hidebroken=true&limit=80"
      );

      const select = $("genreSelect");

      genres
        .filter(genre => genre.name)
        .forEach(genre => {
          const option = document.createElement("option");

          option.value = genre.name;

          option.textContent =
            genre.name +
            " (" +
            Number(genre.stationcount || 0) +
            ")";

          select.appendChild(option);
        });

    } catch (error) {
      console.log("Genres non disponibles.");
    }
  }

  // RECHERCHE DES RADIOS

  async function loadStations() {
    if (state.loading) return;

    state.loading = true;
    state.offset = 0;
    state.stations = [];

    $("stationGrid").innerHTML =
      '<div class="loading-card"><span class="loader"></span> Recherche des stations...</div>';

    $("loadMoreBtn").hidden = true;

    try {
      const params = {
        limit: "120",
        hidebroken: "true",
        order: "clickcount",
        reverse: "true"
      };

      const term = $("searchInput").value.trim();
      const country = $("countrySelect").value;
      const genre = $("genreSelect").value;
      const zone = $("zoneSelect").value;

      if (term) params.name = term;
      if (country) params.country = country;
      if (genre) params.tag = genre;

      let path;

      if (
        state.view === "recent" &&
        !term &&
        !country &&
        !genre &&
        zone === "all"
      ) {
        path =
          "/json/stations/lastchange?" +
          qs({
            limit: "120",
            hidebroken: "true"
          });

      } else if (
        state.view === "popular" &&
        !term &&
        !country &&
        !genre &&
        zone === "all"
      ) {
        path =
          "/json/stations/topclick/120?hidebroken=true";

      } else {
        path =
          "/json/stations/search?" +
          qs(params);
      }

      let data = await api(path);

      // FILTRAGE PAR CONTINENT

      if (zone !== "all") {
        const codes = REGION_CODES[zone] || [];

        data = data.filter(station =>
          codes.includes(
            (station.countrycode || "").toUpperCase()
          )
        );
      }

      state.stations = data;
      state.loading = false;

      renderStations(false);

      $("stationCount").textContent =
        data.length.toLocaleString("fr-FR") + "+";

    } catch (error) {
      state.loading = false;

      $("stationGrid").innerHTML = `
        <div class="empty-state">
          Impossible de charger les radios pour le moment.
          <br><br>
          <button class="secondary-button" id="retryBtn">
            Réessayer
          </button>
        </div>
      `;

      $("retryBtn").addEventListener(
        "click",
        loadStations
      );

      $("resultsLabel").textContent =
        "Connexion au catalogue impossible";
    }
  }

  // RADIOS FAVORITES

  async function loadFavoriteStations() {
    if (!state.favorites.length) {
      state.stations = [];
      renderStations(false);
      return;
    }

    $("stationGrid").innerHTML =
      '<div class="loading-card"><span class="loader"></span> Chargement des favoris...</div>';

    try {
      const data = await api(
        "/json/stations/byuuid?uuids=" +
        encodeURIComponent(state.favorites.join(","))
      );

      state.stations = data || [];

      renderStations(false);

    } catch (error) {
      $("stationGrid").innerHTML =
        '<div class="empty-state">Impossible de charger les favoris.</div>';
    }
  }

  // AFFICHAGE DES STATIONS

  function renderStations(append) {
    let list = state.stations;

    if (state.view === "favorites") {
      list = list.filter(station =>
        state.favorites.includes(station.stationuuid)
      );
    }

    const start = state.offset;

    const slice = list.slice(
      start,
      start + state.limit
    );

    if (!append) {
      $("stationGrid").innerHTML = "";
    }

    if (!slice.length && !append) {
      const message =
        state.view === "favorites"
          ? "Vous n'avez pas encore ajouté de favoris. Cliquez sur ♡ sur une radio."
          : "Aucune station trouvée. Essayez un autre pays ou un autre mot-clé.";

      $("stationGrid").innerHTML =
        '<div class="empty-state">' +
        safeText(message) +
        '</div>';

    } else {
      const html = slice.map(stationCard).join("");

      $("stationGrid").insertAdjacentHTML(
        "beforeend",
        html
      );
    }

    $("resultsLabel").textContent =
      list.length + " station(s) dans ce résultat";

    $("pageLabel").textContent =
      slice.length
        ? Math.min(start + slice.length, list.length) +
          " / " +
          list.length
        : "";

    $("loadMoreBtn").hidden =
      !(start + state.limit < list.length);

    $("stationGrid")
      .querySelectorAll("[data-play]")
      .forEach(button => {
        button.addEventListener("click", () => {
          const station = list.find(
            s => s.stationuuid === button.dataset.play
          );

          playStation(station);
        });
      });

    $("stationGrid")
      .querySelectorAll("[data-fav]")
      .forEach(button => {
        button.addEventListener("click", () => {
          toggleFavorite(button.dataset.fav);
        });
      });
  }

  // CARTE D'UNE RADIO

  function stationCard(station) {
    const id = station.stationuuid;

    const isFavorite =
      state.favorites.includes(id);

    const favicon =
      station.favicon &&
      /^https?:\/\//i.test(station.favicon);

    const initial =
      (station.name || "R").trim().charAt(0).toUpperCase();

    return `
      <article class="station-card">

        <div class="station-logo">
          ${
            favicon
              ? `<img src="${safeText(station.favicon)}"
                   alt=""
                   loading="lazy"
                   onerror="this.remove()">`
              : safeText(initial)
          }
        </div>

        <div class="station-info">

          <strong title="${safeText(station.name)}">
            ${safeText(station.name || "Radio sans nom")}
          </strong>

          <span>
            ${safeText(station.country || "Pays inconnu")}
            ·
            ${safeText(
              (station.tags || "Radio")
                .split(",")
                .slice(0, 2)
                .join(", ")
            )}
          </span>

        </div>

        <div class="station-actions">

          <button
            class="favorite-btn ${isFavorite ? "is-favorite" : ""}"
            data-fav="${safeText(id)}"
            aria-label="Ajouter aux favoris"
          >
            ${isFavorite ? "♥" : "♡"}
          </button>

          <button
            class="mini-play"
            data-play="${safeText(id)}"
            aria-label="Écouter"
          >
            ▶
          </button>

        </div>

      </article>
    `;
  }

  // LECTURE D'UNE RADIO

  async function playStation(station) {
    if (!station) return;

    const stream =
      station.url_resolved || station.url;

    if (!stream) {
      notify("Aucun flux disponible pour cette station.");
      return;
    }

    state.current = station;

    $("playerName").textContent =
      station.name || "Radio sans nom";

    $("playerCountry").textContent =
      [
        station.country,
        station.language
      ].filter(Boolean).join(" · ") ||
      "Radio internationale";

    $("playerCover").textContent =
      (station.name || "♫").charAt(0).toUpperCase();

    $("playPauseBtn").disabled = false;

    $("playerStatus").textContent =
      "Connexion au flux...";

    audio.pause();

    audio.src = stream;
    audio.load();

    try {
      await audio.play();

      countClick(station.stationuuid);

    } catch (error) {
      setPlayerState(false, "Lecture bloquée");

      notify(
        "Appuyez sur lecture pour démarrer, ou essayez une autre station."
      );
    }
  }

  // COMPTABILISATION DES ÉCOUTES

  function countClick(uuid) {
    if (!uuid) return;

    fetch(
      state.server + "/json/url/" +
      encodeURIComponent(uuid),
      {
        method: "POST",
        mode: "cors"
      }
    ).catch(() => {});
  }

  // PAUSE ET REPRISE

  async function togglePlayback() {
    if (!state.current) {
      notify("Choisissez d'abord une station.");
      return;
    }

    if (audio.paused) {
      try {
        await audio.play();
      } catch (error) {
        notify("La lecture n'a pas pu démarrer.");
      }
    } else {
      audio.pause();
    }
  }

  function setPlayerState(playing, label) {
    $("playPauseBtn").textContent =
      playing ? "Ⅱ" : "▶";

    $("playerStatus").textContent = label;

    $("equalizer").classList.toggle(
      "active",
      playing
    );
  }

  // AJOUT ET SUPPRESSION DES FAVORIS

  function toggleFavorite(uuid) {
    if (state.favorites.includes(uuid)) {
      state.favorites =
        state.favorites.filter(id => id !== uuid);
    } else {
      state.favorites.push(uuid);
    }

    saveFavorites();

    if (state.view === "favorites") {
      loadFavoriteStations();
    } else {
      renderStations(false);
    }
  }

  // INSTALLATION DE L'APPLICATION

  $("installBtn").addEventListener(
    "click",
    async () => {
      if (!state.deferredInstall) return;

      state.deferredInstall.prompt();

      await state.deferredInstall.userChoice;

      state.deferredInstall = null;

      $("installBtn").hidden = true;
    }
  );

  window.addEventListener(
    "beforeinstallprompt",
    event => {
      event.preventDefault();

      state.deferredInstall = event;

      $("installBtn").hidden = false;
    }
  );

  window.addEventListener(
    "appinstalled",
    () => {
      notify("RADIO MONDE AS est installée !");
    }
  );

  // LANCEMENT

  init();

})();
