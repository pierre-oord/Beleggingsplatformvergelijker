/* global window, document */
(() => {
  const { PROVIDERS, DEFAULTS, FILTER_COUNTRIES } = window.BerekenProviders;
  const { simulate } = window.BerekenEngine;

  const el = (id) => document.getElementById(id);
  const filterType = el("filterType");
  const filterLand = el("filterLand");
  const filterDuurzaamheid = el("filterDuurzaamheid");
  const tobInfo = el("tobInfo");
  const beginbedrag = el("beginbedrag");
  const maandbedrag = el("maandbedrag");
  const jaren = el("jaren");
  const transacties = el("transacties");
  const rendementPct = el("rendementPct");
  const onderliggendPct = el("onderliggendPct");
  const zonderOnderliggendeKosten = el("zonderOnderliggendeKosten");
  const zonderKosten = el("zonderKosten");
  const geavanceerd = el("geavanceerd");
  const advancedSettings = el("advancedSettings");
  const runBtn = el("runBtn");
  const downloadCsvBtn = el("downloadCsvBtn");
  const summaryEl = el("summary");
  const providersHint = el("providersHint");
  const providersHead = el("providersHead");
  const providersBody = el("providersBody");

  const modal = el("modal");
  const modalOverlay = el("modalOverlay");
  const modalCloseBtn = el("modalCloseBtn");
  const modalTitle = el("modalTitle");
  const headEl = el("resultHead");
  const bodyEl = el("resultBody");
  const footEl = el("resultFoot");
  const hideSaldoNaKolommen = el("hideSaldoNaKolommen");
  const costsChartCanvas = el("costsChart");

  let costsChartInstance = null;

  const fmtEUR = new Intl.NumberFormat("nl-NL", {
    style: "currency",
    currency: "EUR",
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  });
  const fmtEURInt = new Intl.NumberFormat("nl-NL", {
    style: "currency",
    currency: "EUR",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  });
  const fmtPct = new Intl.NumberFormat("nl-NL", { style: "percent", minimumFractionDigits: 2, maximumFractionDigits: 2 });
  /** Getal als string met komma als decimaalteken (voor popup-tabel en samenvatting). */
  function fmtNumKomma(n, digits = 6) {
    return Number(n ?? 0).toFixed(digits).replace(".", ",");
  }

  const DUURZAAMHEID_OPTIONS = [
    "Grijs SFDR Artikel 6",
    "Lichtgroen SFDR Artikel 8",
    "Donkergroen SFDR Artikel 9",
  ];

  function setDefaults() {
    beginbedrag.value = String(DEFAULTS.beginbedrag);
    maandbedrag.value = String(DEFAULTS.maandbedrag);
    jaren.value = String(DEFAULTS.years);
    transacties.value = String(DEFAULTS.transactionsPerMonth);
    rendementPct.value = String(DEFAULTS.annualReturnPct);
    onderliggendPct.value = String(DEFAULTS.underlyingAnnualPct);
    zonderOnderliggendeKosten.checked = DEFAULTS.zonderOnderliggendeKosten;
    zonderKosten.checked = DEFAULTS.zonderKosten;
  }

  function setSummaryMuted(text) {
    summaryEl.classList.add("muted");
    summaryEl.textContent = text;
  }

  function setProvidersHint(text) {
    if (!providersHint) return;
    providersHint.textContent = text;
  }

  function renderCostsChart(providers, resultsById) {
    if (!costsChartCanvas) return;
    if (providers.length === 0) {
      if (costsChartInstance) {
        costsChartInstance.destroy();
        costsChartInstance = null;
      }
      return;
    }
    const sorted = providers.slice().sort((a, b) => compareProviders(a, b, resultsById));
    const labels = sorted.map((p) => p.name);
    const data = sorted.map((p) => {
      const rec = resultsById.get(p.id);
      if (!rec || rec.error) return 0;
      const s = rec.res.summary;
      return (s.somOnderliggendeKosten || 0) + (s.somKosten || 0);
    });
    if (costsChartInstance) costsChartInstance.destroy();
    costsChartInstance = new Chart(costsChartCanvas, {
      type: "bar",
      data: {
        labels,
        datasets: [{
          label: "Totale kosten (€)",
          data,
          backgroundColor: "rgba(253, 104, 41, 0.5)",
          borderColor: "rgba(253, 104, 41, 0.8)",
          borderWidth: 1,
        }],
      },
      options: {
        indexAxis: "y",
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          datalabels: {
            anchor: "end",
            align: "end",
            offset: 4,
            color: "#323232",
            font: { size: 11 },
            formatter: (v) => "€ " + Math.round(v).toLocaleString("nl-NL"),
          },
        },
        scales: {
          x: {
            ticks: {
              color: "#5c6b7a",
              callback: (v) => "€ " + v.toLocaleString("nl-NL", { maximumFractionDigits: 0 }),
            },
            grid: { color: "rgba(0, 24, 40, 0.12)" },
          },
          y: {
            ticks: { color: "#323232", maxRotation: 0, autoSkip: true },
            grid: { display: false },
          },
        },
      },
    });
  }

  function updateTOBInfo() {
    if (!tobInfo) return;
    const isBE = (filterLand?.value || "") === "BE";
    tobInfo.style.display = isBE ? "" : "none";
  }

  function addOpt(select, value, label) {
    const opt = document.createElement("option");
    opt.value = value;
    opt.textContent = label;
    select.appendChild(opt);
  }

  function populateFilters() {
    if (filterType) {
      filterType.innerHTML = "";
      addOpt(filterType, "", "— (alle types)");
      const types = Array.from(new Set(PROVIDERS.map((p) => p.type).filter(Boolean))).sort();
      for (const t of types) addOpt(filterType, t, t);
      filterType.value = types.includes("fondsaanbieder") ? "fondsaanbieder" : "";
    }

    if (filterLand) {
      filterLand.innerHTML = "";
      addOpt(filterLand, "", "— (alle landen)");
      const landen =
        Array.isArray(FILTER_COUNTRIES) && FILTER_COUNTRIES.length > 0
          ? FILTER_COUNTRIES.slice().sort()
          : Array.from(
              new Set(PROVIDERS.flatMap((p) => (Array.isArray(p.countries) ? p.countries : [])))
            ).sort();
      for (const c of landen) addOpt(filterLand, c, c);
      filterLand.value = "";
    }

    if (filterDuurzaamheid) {
      filterDuurzaamheid.innerHTML = "";
      addOpt(filterDuurzaamheid, "", "— (alle duurzaamheid)");
      for (const d of DUURZAAMHEID_OPTIONS) addOpt(filterDuurzaamheid, d, d);
      filterDuurzaamheid.value = "";
    }
  }

  function matchesFilters(provider) {
    const t = filterType?.value || "";
    const land = filterLand?.value || "";
    const d = filterDuurzaamheid?.value || "";

    if (t && provider.type !== t) return false;
    if (land) {
      if (!(Array.isArray(provider.countries) && provider.countries.includes(land))) return false;
    } else if (Array.isArray(FILTER_COUNTRIES) && FILTER_COUNTRIES.length > 0) {
      const providerCountries = Array.isArray(provider.countries) ? provider.countries : [];
      const hasMatchingCountry = FILTER_COUNTRIES.some((c) => providerCountries.includes(c));
      if (!hasMatchingCountry) return false;
    }
    if (d && provider.duurzaamheid !== d) return false;
    return true;
  }

  function moneyCell(value) {
    const td = document.createElement("td");
    td.className = "num";
    td.textContent = fmtNumKomma(value, 2);
    return td;
  }

  function numCell(value, digits = 6) {
    const td = document.createElement("td");
    td.className = "num";
    td.textContent = fmtNumKomma(value, digits);
    return td;
  }

  function textCell(value) {
    const td = document.createElement("td");
    td.textContent = String(value ?? "");
    return td;
  }

  function htmlCell(html) {
    const td = document.createElement("td");
    td.innerHTML = String(html ?? "");
    return td;
  }

  const YES_NO_COLS = ["service_recurring_investing", "service_fractional_investing", "fbi", "gratisInleggenOpnemen"];

  function renderSummary(res) {
    const s = res.summary;
    const irrA = s.irrAnnual == null ? "n.v.t." : fmtPct.format(s.irrAnnual);

    const txPill = s.providerType === "broker" ? `<span class="pill">${s.nTransactions} tx/maand</span>` : `<span class="pill">geen tx-splitsing</span>`;
    const transactiesPerStortingOpname =
      s.providerType === "broker" && typeof s.nTransactions === "number"
        ? s.nTransactions
        : "—";
    const laatstBijgewerkt = s.lastUpdated || "Onbekend";
    const minimumInlegTekst = (typeof s.minimumInleg === "number") ? fmtEUR.format(s.minimumInleg) : "—";
    const duurzaamheidTekst = s.duurzaamheid || "—";
    const aandelenpercentageTekst = (typeof s.aandelenpercentage === "number") ? `${s.aandelenpercentage}%` : "—";
    const minInlegNietBehaald =
      typeof s.minimumInleg === "number" && typeof s.firstMonthInleg === "number" && s.firstMonthInleg < s.minimumInleg;
    const minInlegPill = minInlegNietBehaald ? `<span class="pill pill-danger">Niet behaald</span>` : "";

    summaryEl.classList.remove("muted");
    summaryEl.innerHTML = `
      <div><span class="k">Aanbieder</span>: <span class="v">${s.providerName}</span></div>
      <div><span class="k">Type</span>: <span class="v">${s.providerType}</span></div>
      <div><span class="k">Laatst bijgewerkt</span>: <span class="v">${laatstBijgewerkt}</span></div>
      <div><span class="k">Minimum inleg</span>: <span class="v">${minimumInlegTekst}</span> ${minInlegPill}</div>
      <div><span class="k">Duurzaamheid</span>: <span class="v">${duurzaamheidTekst}</span></div>
      <div><span class="k">Aandelenpercentage</span>: <span class="v">${aandelenpercentageTekst}</span></div>
      <div><span class="k">Periode</span>: <span class="v">${s.months} maanden</span> ${txPill}</div>
      <div><span class="k">Transacties per storting/opname</span>: <span class="v">${transactiesPerStortingOpname}</span></div>
      <div><span class="k">Rendement p.j.</span>: <span class="v">${fmtNumKomma(s.annualReturnPct, 6)}%</span></div>
      <div><span class="k">Onderliggende kosten p.j.</span>: <span class="v">${fmtNumKomma(s.underlyingAnnualPct, 6)}%</span></div>
      <hr class="hr" />
      <div><span class="k">Totale inleg</span>: <span class="v">${fmtEUR.format(s.totalInleg)}</span></div>
      <div><span class="k">Eindsaldo</span>: <span class="v">${fmtEUR.format(s.eindOpnameNetto)}</span></div>
      <div><span class="k">Netto resultaat</span>: <span class="v">${fmtEUR.format(s.nettoResultaat)}</span></div>
      <hr class="hr" />
      <div><span class="k">Som onderliggende kosten</span>: <span class="v">${fmtEUR.format(s.somOnderliggendeKosten)}</span></div>
      <div><span class="k">Som aanbieder kosten</span>: <span class="v">${fmtEUR.format(s.somKosten)}</span></div>
      <div><span class="k">Totale kosten</span>: <span class="v">${fmtEUR.format(s.somOnderliggendeKosten + s.somKosten)}</span></div>
      <hr class="hr" />
      <div><span class="k">IRR (jaarlijks)</span>: <span class="v">${irrA}</span></div>
    `;
  }

  const PROVIDERS_COLS_BASE = [
    { key: "providerName", label: "Aanbieder" },
    { key: "website", label: "Website" },
    { key: "irrAnnual", label: "IRR (jaarlijks)" },
    { key: "totalCosts", label: "Totale kosten" },
    { key: "tobCosts", label: "TOB-belasting" },
    { key: "eindOpnameNetto", label: "Eindsaldo" },
    { key: "providerType", label: "Type" },
    { key: "duurzaamheid", label: "Duurzaamheid" },
    { key: "gratisInleggenOpnemen", label: "Gratis inleggen/opnemen" },
    { key: "tax_BE_TOB_service", label: "Tax service TOB" },
    { key: "tax_BE_roerende_voorheffing_service", label: "Tax service RV" },
    { key: "tax_BE_effectentaks_service", label: "Tax service effectentax" },
    { key: "tax_BE_reynderstaks_service", label: "Tax service Reynders" },
    { key: "service_recurring_investing", label: "Periodiek inleggen" },
    { key: "service_fractional_investing", label: "Fractioneel beleggen" },
    { key: "minInlegStatus", label: "Min. inleg" },
    { key: "aandelenpercentage", label: "Aandelenpercentage" },
    { key: "fbi", label: "FBI" },
    { key: "lastUpdated", label: "Laatst bijgewerkt" },
  ];

  let sortKey = "totalCosts";
  let sortDir = "asc";

  /** Kolommen zichtbaar in de tabel; tax_BE* alleen wanneer land "BE" is gekozen. */
  function getVisibleProviderCols() {
    const isBE = (filterLand?.value || "") === "BE";
    const cols = isBE ? PROVIDERS_COLS_BASE : PROVIDERS_COLS_BASE.filter((c) => !c.key.startsWith("tax_BE"));
        if (!cols.some((c) => c.key === sortKey)) sortKey = "totalCosts";
    return cols;
  }

  /** Kolommen voor CSV-export; bevat Bank na Type (niet in UI). */
  function getCsvProviderCols() {
    const cols = getVisibleProviderCols();
    const typeIdx = cols.findIndex((c) => c.key === "providerType");
    const bankCol = { key: "is_bank", label: "Bank" };
    if (typeIdx >= 0) {
      return [...cols.slice(0, typeIdx + 1), bankCol, ...cols.slice(typeIdx + 1)];
    }
    return [...cols, bankCol];
  }

  function getSortValue(colKey, provider, rec) {
    if (!rec || rec.error) {
      switch (colKey) {
        case "providerName":
          return provider.name || "";
        case "website":
          return provider.website || "";
        case "minInlegStatus":
          return null;
        case "providerType":
          return provider.type || "";
        case "is_bank":
          return provider.is_bank === true ? "Ja" : "Nee";
        case "duurzaamheid":
          return provider.duurzaamheid || "";
        case "gratisInleggenOpnemen":
          return !provider.transactions?.deposit && !provider.transactions?.withdraw ? 1 : 0;
        case "tax_BE_TOB_service":
          return provider.tax_BE_TOB_service || "";
        case "tax_BE_roerende_voorheffing_service":
          return provider.tax_BE_roerende_voorheffing_service || "";
        case "tax_BE_effectentaks_service":
          return provider.tax_BE_effectentaks_service || "";
        case "tax_BE_reynderstaks_service":
          return provider.tax_BE_reynderstaks_service || "";
        case "service_recurring_investing":
          return provider.service_recurring_investing === true
            ? 1
            : provider.service_recurring_investing === false
            ? 0
            : -1;
        case "service_fractional_investing":
          return provider.service_fractional_investing === true
            ? 1
            : provider.service_fractional_investing === false
            ? 0
            : -1;
        case "aandelenpercentage":
          return typeof provider.aandelenpercentage === "number" ? provider.aandelenpercentage : null;
        case "fbi":
          return provider.fbi === true ? 1 : provider.fbi === false ? 0 : -1;
        case "lastUpdated":
          return provider.lastUpdated || "";
        case "irrAnnual":
        case "totalCosts":
        case "tobCosts":
        case "eindOpnameNetto":
        default:
          return null;
      }
    }

    const s = rec.res.summary;
    switch (colKey) {
      case "providerName":
        return s.providerName || "";
      case "website":
        return provider.website || "";
      case "minInlegStatus":
        if (s.minimumInleg == null || typeof s.firstMonthInleg !== "number") return null;
        return s.firstMonthInleg >= s.minimumInleg;
      case "irrAnnual":
        return typeof s.irrAnnual === "number" ? s.irrAnnual : null;
      case "totalCosts":
        return (s.somOnderliggendeKosten || 0) + (s.somKosten || 0);
      case "tobCosts":
        return s.somTOB || 0;
      case "eindOpnameNetto":
        return s.eindOpnameNetto;
      case "providerType":
        return s.providerType || "";
      case "duurzaamheid":
        return s.duurzaamheid || "";
      case "gratisInleggenOpnemen":
        return !provider.transactions?.deposit && !provider.transactions?.withdraw ? 1 : 0;
      case "tax_BE_TOB_service":
        return provider.tax_BE_TOB_service || "";
      case "tax_BE_roerende_voorheffing_service":
        return provider.tax_BE_roerende_voorheffing_service || "";
      case "tax_BE_effectentaks_service":
        return provider.tax_BE_effectentaks_service || "";
      case "tax_BE_reynderstaks_service":
        return provider.tax_BE_reynderstaks_service || "";
      case "service_recurring_investing":
        return provider.service_recurring_investing === true
          ? 1
          : provider.service_recurring_investing === false
          ? 0
          : -1;
      case "service_fractional_investing":
        return provider.service_fractional_investing === true
          ? 1
          : provider.service_fractional_investing === false
          ? 0
          : -1;
      case "aandelenpercentage":
        return typeof s.aandelenpercentage === "number" ? s.aandelenpercentage : null;
      case "fbi":
        return s.fbi === true ? 1 : s.fbi === false ? 0 : -1;
      case "lastUpdated":
        return s.lastUpdated || "";
      default:
        return null;
    }
  }

  function compareProviders(a, b, resultsById) {
    const recA = resultsById.get(a.id);
    const recB = resultsById.get(b.id);

    const va = getSortValue(sortKey, a, recA);
    const vb = getSortValue(sortKey, b, recB);

    if (va == null && vb == null) return 0;
    if (va == null) return 1;
    if (vb == null) return -1;

    const dir = sortDir === "asc" ? 1 : -1;

    if (typeof va === "number" && typeof vb === "number") {
      if (va < vb) return -1 * dir;
      if (va > vb) return 1 * dir;
      return 0;
    }

    const sa = String(va);
    const sb = String(vb);
    const cmp = sa.localeCompare(sb, "nl", { sensitivity: "base" });
    if (cmp < 0) return -1 * dir;
    if (cmp > 0) return 1 * dir;
    return 0;
  }

  function ensureProvidersHeader() {
    if (!providersHead) return;
    providersHead.innerHTML = "";
    const tr = document.createElement("tr");
    for (const c of getVisibleProviderCols()) {
      const th = document.createElement("th");
      let label = c.label;
      if (c.key === sortKey) {
        label += sortDir === "asc" ? " ↑" : " ↓";
      }
      th.textContent = label;
      th.dataset.sortKey = c.key;
      th.classList.add("sortable");
      th.addEventListener("click", () => {
        if (sortKey === c.key) {
          sortDir = sortDir === "asc" ? "desc" : "asc";
        } else {
          sortKey = c.key;
          sortDir = (c.key === "irrAnnual" || c.key === "eindOpnameNetto") ? "desc" : "asc";
        }
        ensureProvidersHeader();
        const filteredProviders = PROVIDERS.filter(matchesFilters);
        renderProvidersTable(filteredProviders, lastResultsById);
        renderCostsChart(filteredProviders, lastResultsById);
      });
      tr.appendChild(th);
    }
    providersHead.appendChild(tr);
  }

  function renderProvidersTable(providers, resultsById) {
    if (!providersBody) return;
    providersBody.innerHTML = "";

    if (providers.length === 0) {
      setProvidersHint("Geen aanbieders gevonden met de huidige filters.");
      return;
    }

    let okCount = 0;
    const cols = getVisibleProviderCols();
    const sortedProviders = providers.slice().sort((a, b) => compareProviders(a, b, resultsById));

    for (const p of sortedProviders) {
      const rec = resultsById.get(p.id);
      const tr = document.createElement("tr");
      tr.className = "clickable";
      tr.dataset.providerId = p.id;

      cols.forEach((c, idx) => {
        const display = getProviderRowDisplay(c.key, p, rec);
        const td = (c.key === "website" || YES_NO_COLS.includes(c.key) || c.key === "tax_BE_TOB_service" || c.key === "tax_BE_roerende_voorheffing_service" || c.key === "tax_BE_effectentaks_service" || c.key === "tax_BE_reynderstaks_service") ? htmlCell(display) : textCell(display);
        if (["irrAnnual", "totalCosts", "tobCosts", "eindOpnameNetto"].includes(c.key)) td.className = "num";
        tr.appendChild(td);
      });
      if (rec && !rec.error) okCount++;
      providersBody.appendChild(tr);
    }

    setProvidersHint(`Resultaten: ${okCount}/${providers.length} aanbieders (klik voor details).`);
  }

  const TABLE_COLS = [
    { key: "maand", label: "Maand", kind: "text", hideSaldoNa: false },
    { key: "saldoVorigeMaand", label: "Saldo vorige maand", kind: "money", hideSaldoNa: false },
    { key: "initInleg", label: "Init. inleg (Δ)", kind: "money", hideSaldoNa: false },
    { key: "saldoNaS0", label: "Saldo na init. inleg", kind: "money", hideSaldoNa: true },
    { key: "storting", label: "Storting (Δ)", kind: "money", hideSaldoNa: false },
    { key: "saldoNaS1", label: "Saldo na storting", kind: "money", hideSaldoNa: true },
    { key: "belastingTOB", label: "Belasting TOB (Δ)", kind: "money", hideSaldoNa: false },
    { key: "saldoNaTOB", label: "Saldo na Belasting TOB", kind: "money", hideSaldoNa: true },
    { key: "rendement", label: "Rendement (Δ)", kind: "money", hideSaldoNa: false },
    { key: "saldoNaS2", label: "Saldo na rendement", kind: "money", hideSaldoNa: true },
    { key: "onderliggendeKosten", label: "Onderliggende kosten (Δ)", kind: "money", hideSaldoNa: false },
    { key: "saldoNaS3", label: "Saldo na onderliggende kosten", kind: "money", hideSaldoNa: true },
    { key: "kostenBedrag", label: "Aanbieder kosten (Δ)", kind: "money", hideSaldoNa: false },
    { key: "saldoNaS4", label: "Saldo na aanbieder kosten", kind: "money", hideSaldoNa: true },
    { key: "txStortingBedrag", label: "Tx kosten storting (Δ)", kind: "money", hideSaldoNa: false },
    { key: "saldoNaS5", label: "Saldo na tx storting", kind: "money", hideSaldoNa: true },
    { key: "txOpnameBedrag", label: "Tx kosten opname (Δ)", kind: "money", hideSaldoNa: false },
    { key: "saldoNaS6", label: "Saldo na tx opname", kind: "money", hideSaldoNa: true },
    { key: "belastingTOBOpname", label: "Belasting TOB opname (Δ)", kind: "money", hideSaldoNa: false },
    { key: "saldoNaTOBOpname", label: "Saldo na Belasting TOB opname", kind: "money", hideSaldoNa: true },
    { key: "opnameDelta", label: "Opname (netto, Δ)", kind: "money", hideSaldoNa: false },
    { key: "saldoNaOpname", label: "Saldo na opname", kind: "money", hideSaldoNa: false },
  ];

  function renderTable(res) {
    const hideSaldoNa = hideSaldoNaKolommen && hideSaldoNaKolommen.checked;
    const cols = hideSaldoNa ? TABLE_COLS.filter((c) => !c.hideSaldoNa) : TABLE_COLS;

    headEl.innerHTML = "";
    bodyEl.innerHTML = "";
    footEl.innerHTML = "";

    const trH = document.createElement("tr");
    for (const c of cols) {
      const th = document.createElement("th");
      th.textContent = c.label;
      trH.appendChild(th);
    }
    headEl.appendChild(trH);

    for (const r of res.rows) {
      const tr = document.createElement("tr");
      for (const c of cols) {
        const v = r[c.key];
        if (c.kind === "money") tr.appendChild(moneyCell(v));
        else tr.appendChild(textCell(v));
      }
      bodyEl.appendChild(tr);
    }

    const totals = res.totals;
    const last = res.rows[res.rows.length - 1];
    const trF = document.createElement("tr");
    trF.appendChild(textCell("Totaal"));
    for (const c of cols) {
      if (c.key === "maand" || c.key === "saldoVorigeMaand") trF.appendChild(textCell(""));
      else if (c.key === "saldoNaS0" || c.key === "saldoNaS1" || c.key === "saldoNaS2" || c.key === "saldoNaS3" || c.key === "saldoNaS4" || c.key === "saldoNaS5" || c.key === "saldoNaS6") trF.appendChild(textCell(""));
      else if (c.key === "initInleg") trF.appendChild(moneyCell(totals.initInleg));
      else if (c.key === "storting") trF.appendChild(moneyCell(totals.storting));
      else if (c.key === "rendement") trF.appendChild(moneyCell(totals.rendement));
      else if (c.key === "onderliggendeKosten") trF.appendChild(moneyCell(totals.onderliggendeKosten));
      else if (c.key === "kostenBedrag") trF.appendChild(moneyCell(totals.kosten));
      else if (c.key === "txStortingBedrag") trF.appendChild(moneyCell(totals.txStorting));
      else if (c.key === "txOpnameBedrag") trF.appendChild(moneyCell(totals.txOpname));
      else if (c.key === "belastingTOB" || c.key === "belastingTOBOpname") trF.appendChild(moneyCell(totals.taxTOB));
      else if (c.key === "opnameDelta") trF.appendChild(moneyCell(last?.opnameDelta || 0));
      else if (c.key === "saldoNaOpname") trF.appendChild(moneyCell(last?.saldoNaOpname || 0));
    }
    footEl.appendChild(trF);
  }

  function getProviderRowDisplay(colKey, provider, rec) {
    if (!rec || rec.error) {
      switch (colKey) {
        case "providerName": return provider.name || "";
        case "website":
          return provider.website
            ? `<a class="link-website" href="${provider.website}" target="_blank" rel="noopener noreferrer">Website</a>`
            : "—";
        case "minInlegStatus": return "—";
        case "irrAnnual": case "totalCosts": case "tobCosts": case "eindOpnameNetto": return "—";
        case "providerType": return provider.type || "—";
        case "duurzaamheid": return provider.duurzaamheid || "—";
        case "gratisInleggenOpnemen":
          return !provider.transactions?.deposit && !provider.transactions?.withdraw
            ? '<span class="pill pill-ja">Ja</span>'
            : '<span class="pill pill-nee">Nee</span>';
        case "tax_BE_TOB_service": {
          const raw = provider.tax_BE_TOB_service;
          if (raw == null || raw === "") return "—";
          const v = String(raw).trim().toLowerCase();
          if (v === "n.v.t." || v === "ja") return `<span class="pill pill-ja">${raw}</span>`;
          if (v === "nee") return `<span class="pill pill-nee">${raw}</span>`;
          return "—";
        }
        case "tax_BE_roerende_voorheffing_service": {
          const raw = provider.tax_BE_roerende_voorheffing_service;
          if (raw == null || raw === "") return "—";
          const v = String(raw).trim().toLowerCase();
          if (v === "n.v.t." || v === "ja") return `<span class="pill pill-ja">${raw}</span>`;
          if (v === "nee") return `<span class="pill pill-nee">${raw}</span>`;
          return "—";
        }
        case "tax_BE_effectentaks_service": {
          const raw = provider.tax_BE_effectentaks_service;
          if (raw == null || raw === "") return "—";
          const v = String(raw).trim().toLowerCase();
          if (v === "n.v.t." || v === "ja") return `<span class="pill pill-ja">${raw}</span>`;
          if (v === "nee") return `<span class="pill pill-nee">${raw}</span>`;
          return "—";
        }
        case "tax_BE_reynderstaks_service": {
          const raw = provider.tax_BE_reynderstaks_service;
          if (raw == null || raw === "") return "—";
          const v = String(raw).trim().toLowerCase();
          if (v === "n.v.t." || v === "ja") return `<span class="pill pill-ja">${raw}</span>`;
          if (v === "nee") return `<span class="pill pill-nee">${raw}</span>`;
          return "—";
        }
        case "service_recurring_investing":
          return provider.service_recurring_investing === true
            ? '<span class="pill pill-ja">Ja</span>'
            : provider.service_recurring_investing === false
            ? '<span class="pill pill-nee">Nee</span>'
            : "—";
        case "service_fractional_investing":
          return provider.service_fractional_investing === true
            ? '<span class="pill pill-ja">Ja</span>'
            : provider.service_fractional_investing === false
            ? '<span class="pill pill-nee">Nee</span>'
            : "—";
        case "aandelenpercentage": return (typeof provider.aandelenpercentage === "number") ? `${provider.aandelenpercentage}%` : "—";
        case "fbi":
          return provider.fbi === true
            ? '<span class="pill pill-ja">Ja</span>'
            : provider.fbi === false
            ? '<span class="pill pill-nee">Nee</span>'
            : "—";
        case "lastUpdated": return provider.lastUpdated || "Onbekend";
        default: return "";
      }
    }
    const s = rec.res.summary;
    switch (colKey) {
      case "providerName": return s.providerName || "";
      case "website":
        return provider.website
          ? `<a class="link-website" href="${provider.website}" target="_blank" rel="noopener noreferrer">Website</a>`
          : "—";
      case "minInlegStatus":
        if (s.minimumInleg == null) return "—";
        if (typeof s.firstMonthInleg !== "number") return "—";
        return s.firstMonthInleg >= s.minimumInleg ? "Behaald" : "Niet behaald";
      case "irrAnnual": return s.irrAnnual == null ? "n.v.t." : fmtPct.format(s.irrAnnual);
      case "totalCosts": return fmtEURInt.format((s.somOnderliggendeKosten || 0) + (s.somKosten || 0));
      case "tobCosts": return fmtEURInt.format(s.somTOB || 0);
      case "eindOpnameNetto": return fmtEURInt.format(s.eindOpnameNetto ?? 0);
      case "providerType": return s.providerType || "—";
      case "is_bank": return provider.is_bank === true ? "Ja" : "Nee";
      case "duurzaamheid": return s.duurzaamheid || "—";
      case "gratisInleggenOpnemen":
        return !provider.transactions?.deposit && !provider.transactions?.withdraw
          ? '<span class="pill pill-ja">Ja</span>'
          : '<span class="pill pill-nee">Nee</span>';
      case "tax_BE_TOB_service": {
        const raw = provider.tax_BE_TOB_service;
        if (raw == null || raw === "") return "—";
        const v = String(raw).trim().toLowerCase();
        if (v === "n.v.t." || v === "ja") return `<span class="pill pill-ja">${raw}</span>`;
        if (v === "nee") return `<span class="pill pill-nee">${raw}</span>`;
        return "—";
      }
      case "tax_BE_roerende_voorheffing_service": {
        const raw = provider.tax_BE_roerende_voorheffing_service;
        if (raw == null || raw === "") return "—";
        const v = String(raw).trim().toLowerCase();
        if (v === "n.v.t." || v === "ja") return `<span class="pill pill-ja">${raw}</span>`;
        if (v === "nee") return `<span class="pill pill-nee">${raw}</span>`;
        return "—";
      }
      case "tax_BE_effectentaks_service": {
        const raw = provider.tax_BE_effectentaks_service;
        if (raw == null || raw === "") return "—";
        const v = String(raw).trim().toLowerCase();
        if (v === "n.v.t." || v === "ja") return `<span class="pill pill-ja">${raw}</span>`;
        if (v === "nee") return `<span class="pill pill-nee">${raw}</span>`;
        return "—";
      }
      case "tax_BE_reynderstaks_service": {
        const raw = provider.tax_BE_reynderstaks_service;
        if (raw == null || raw === "") return "—";
        const v = String(raw).trim().toLowerCase();
        if (v === "n.v.t." || v === "ja") return `<span class="pill pill-ja">${raw}</span>`;
        if (v === "nee") return `<span class="pill pill-nee">${raw}</span>`;
        return "—";
      }
      case "service_recurring_investing":
        return provider.service_recurring_investing === true
          ? '<span class="pill pill-ja">Ja</span>'
          : provider.service_recurring_investing === false
          ? '<span class="pill pill-nee">Nee</span>'
          : "—";
      case "service_fractional_investing":
        return provider.service_fractional_investing === true
          ? '<span class="pill pill-ja">Ja</span>'
          : provider.service_fractional_investing === false
          ? '<span class="pill pill-nee">Nee</span>'
          : "—";
      case "aandelenpercentage": return (typeof s.aandelenpercentage === "number") ? `${s.aandelenpercentage}%` : "—";
      case "fbi":
        return s.fbi === true
          ? '<span class="pill pill-ja">Ja</span>'
          : s.fbi === false
          ? '<span class="pill pill-nee">Nee</span>'
          : "—";
      case "lastUpdated": return s.lastUpdated || "Onbekend";
      default: return "";
    }
  }

  function toCsvProvidersList(providers, resultsById) {
    const esc = (str) => {
      const s = String(str ?? "");
      if (/[",\n]/.test(s)) return `"${s.replace(/"/g, "\"\"")}"`;
      return s;
    };
    const stripHtml = (s) => String(s ?? "").replace(/<[^>]+>/g, "").trim();
    const cols = getCsvProviderCols();
    const headers = cols.map((c) => c.label);
    const lines = [headers.map(esc).join(",")];
    for (const p of providers) {
      const rec = resultsById.get(p.id);
      const row = cols.map((c) => {
        let val = getProviderRowDisplay(c.key, p, rec);
        if (c.key === "website") val = p.website || "";
        else if (YES_NO_COLS.includes(c.key) || c.key === "tax_BE_TOB_service" || c.key === "tax_BE_roerende_voorheffing_service" || c.key === "tax_BE_effectentaks_service" || c.key === "tax_BE_reynderstaks_service") val = stripHtml(val);
        return esc(val);
      });
      lines.push(row.join(","));
    }
    return lines.join("\n");
  }

  function toCsv(res) {
    const cols = TABLE_COLS.map((c) => [c.key, c.label]);

    const esc = (s) => {
      const str = String(s ?? "");
      if (/[",\n]/.test(str)) return `"${str.replace(/"/g, "\"\"")}"`;
      return str;
    };

    const lines = [];
    lines.push(cols.map((c) => esc(c[1])).join(","));
    for (const r of res.rows) {
      lines.push(
        cols
          .map((c) => {
            const v = r[c[0]];
            if (typeof v === "number") return String(Math.round((v + Number.EPSILON) * 100) / 100);
            return esc(v);
          })
          .join(",")
      );
    }
    return lines.join("\n");
  }

  function downloadText(filename, text) {
    const blob = new Blob([text], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  let lastResult = null; // selected provider result (for CSV + modal refresh)
  let lastResultsById = new Map(); // providerId -> {provider, res} or {provider, error}

  function openModal() {
    if (!modal) return;
    modal.classList.remove("hidden");
    modal.setAttribute("aria-hidden", "false");
    document.body.style.overflow = "hidden";
  }

  function closeModal() {
    if (!modal) return;
    modal.classList.add("hidden");
    modal.setAttribute("aria-hidden", "true");
    document.body.style.overflow = "";
  }

  function openProvider(providerId) {
    const rec = lastResultsById.get(providerId);
    if (!rec || rec.error) return;

    lastResult = rec.res;
    if (modalTitle) modalTitle.textContent = `${rec.provider.name} — Maandoverzicht`;

    renderSummary(rec.res);
    renderTable(rec.res);
    openModal();
  }

  function run() {
    ensureProvidersHeader();
    // Simuleer altijd alle aanbieders; filters bepalen alleen wat je ziet.
    const resultsById = new Map();

    const isTOBEnabled = (filterLand?.value || "") === "BE";

    for (const provider of PROVIDERS) {
      try {
        const res = simulate({
          provider,
          beginbedrag: Number(beginbedrag.value),
          maandbedrag: Number(maandbedrag.value),
          years: Number(jaren.value),
          annualReturnPct: Number(rendementPct.value),
          underlyingAnnualPct: Number(onderliggendPct.value),
          transactionsPerMonth: provider.transactionsPerMonth != null ? provider.transactionsPerMonth : Number(transacties.value),
          zonderOnderliggendeKosten: Boolean(zonderOnderliggendeKosten.checked),
          zonderKosten: Boolean(zonderKosten.checked),
          enableTOB: isTOBEnabled,
        });
        resultsById.set(provider.id, { provider, res });
      } catch (err) {
        resultsById.set(provider.id, { provider, error: err });
      }
    }

    lastResultsById = resultsById;
    lastResult = null;

    const filteredProviders = PROVIDERS.filter(matchesFilters);
    renderProvidersTable(filteredProviders, resultsById);
    renderCostsChart(filteredProviders, resultsById);
    setSummaryMuted("Klik op een aanbieder in de lijst voor details.");
    closeModal();

    downloadCsvBtn.disabled = false;
    downloadCsvBtn.onclick = () => {
      const sorted = filteredProviders.slice().sort((a, b) => compareProviders(a, b, lastResultsById));
      const csv = toCsvProvidersList(sorted, lastResultsById);
      downloadText("aanbieders.csv", csv);
    };
  }

  function rerenderProvidersOnly() {
    if (!lastResultsById || lastResultsById.size === 0) return;
    const filteredProviders = PROVIDERS.filter(matchesFilters);
    renderProvidersTable(filteredProviders, lastResultsById);
    renderCostsChart(filteredProviders, lastResultsById);
  }

  function wireModal() {
    if (modalOverlay) modalOverlay.addEventListener("click", () => closeModal());
    if (modalCloseBtn) modalCloseBtn.addEventListener("click", () => closeModal());
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape") closeModal();
    });
  }

  function wireProvidersClick() {
    if (!providersBody) return;
    providersBody.addEventListener("click", (e) => {
      if (e.target.closest?.("a[href]")) return; // Laat links navigeren zonder modal te openen
      const tr = e.target && e.target.closest ? e.target.closest("tr[data-provider-id]") : null;
      if (!tr) return;
      openProvider(tr.dataset.providerId);
    });
  }

  function wireFilters() {
    const onChange = () => {
      // Filters beïnvloeden pas de weergave na een nieuwe berekening.
      updateTOBInfo();
    };
    if (filterType) filterType.addEventListener("change", onChange);
    if (filterLand) filterLand.addEventListener("change", onChange);
    if (filterDuurzaamheid) filterDuurzaamheid.addEventListener("change", onChange);

    if (geavanceerd && advancedSettings) {
      const toggleAdvanced = () => {
        advancedSettings.hidden = !geavanceerd.checked;
      };
      geavanceerd.addEventListener("change", toggleAdvanced);
      toggleAdvanced();
    }
  }

  // Add a tiny HR style via JS (keeps CSS minimal)
  const style = document.createElement("style");
  style.textContent = `.hr{border:0;border-top:1px solid rgba(0,24,40,.12);margin:8px 0}`;
  document.head.appendChild(style);

  setDefaults();
  populateFilters();
  ensureProvidersHeader();
  updateTOBInfo();
  setProvidersHint("Klik op “Bereken” om alle aanbieders te tonen.");
  setSummaryMuted("Klik op “Bereken”.");
  wireModal();
  wireProvidersClick();
  wireFilters();

  if (hideSaldoNaKolommen) {
    hideSaldoNaKolommen.addEventListener("change", () => {
      if (lastResult) renderTable(lastResult);
    });
  }

  runBtn.addEventListener("click", (e) => {
    e.preventDefault();
    try {
      run();
    } catch (err) {
      setSummaryMuted(`Fout: ${err && err.message ? err.message : String(err)}`);
      if (downloadCsvBtn) downloadCsvBtn.disabled = true;
    }
  });
})();

