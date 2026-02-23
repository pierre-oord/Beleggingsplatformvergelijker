/* global window */
(() => {
  function clampNumber(v, fallback = 0) {
    const n = Number(v);
    return Number.isFinite(n) ? n : fallback;
  }

  function toMonthlyReturnRateFromAnnualPct(annualPct) {
    const a = clampNumber(annualPct, 0) / 100;
    return Math.pow(1 + a, 1 / 12) - 1;
  }

  function toMonthlyRateFromAnnualPctSimple(annualPct) {
    const a = clampNumber(annualPct, 0) / 100;
    return a / 12;
  }

  function toMonthlyUnderlyingCostRate(underlyingAnnualPct) {
    const a = clampNumber(underlyingAnnualPct, 0) / 100;
    return Math.pow(1 + a, 1 / 12) - 1;
  }

  function basisValue(basis, s0Bal, deposit, retDelta, underlyingDelta) {
    // basis definitions follow user's formulas, using deltas (retDelta, underlyingDelta).
    // begin: S0+S1 (or S0+S1+S3 for fee basis)
    // avg:   S0+S1+S2/2 (and +S3/2)
    // end:   S0+S1+S2 (and +S3)
    if (basis === "begin") return s0Bal + deposit + underlyingDelta; // when underlyingDelta is 0 for begin cases, ok
    if (basis === "end") return s0Bal + deposit + retDelta + underlyingDelta;
    // avg
    return s0Bal + deposit + retDelta / 2 + underlyingDelta / 2;
  }

  function round2(n) {
    return Math.round((n + Number.EPSILON) * 100) / 100;
  }

  function feeForOneTransaction(spec, amount) {
    if (!spec) return 0;
    const a = Math.max(0, amount);
    switch (spec.kind) {
      case "fixedPerTransaction":
        return Math.max(0, clampNumber(spec.amount, 0));
      case "tieredTransaction": {
        // Supports fixed and/or percent, each optionally tiered. Optioneel minimumAmount, maximumAmount.
        let total = 0;
        if (spec.fixedTiers && Array.isArray(spec.fixedTiers.tiers)) {
          total += tieredFixedFee(spec.fixedTiers, a);
        } else if (spec.fixedAmount != null) {
          total += Math.max(0, clampNumber(spec.fixedAmount, 0));
        }

        if (spec.percentTiers && Array.isArray(spec.percentTiers.tiers)) {
          total += tieredPercentFee(spec.percentTiers, a);
        } else if (spec.percentRatePct != null) {
          total += a * (Math.max(0, clampNumber(spec.percentRatePct, 0)) / 100);
        }
        const minAmount = spec.minimumAmount != null ? Math.max(0, clampNumber(spec.minimumAmount, 0)) : null;
        let result = minAmount != null ? Math.max(total, minAmount) : total;
        const maxAmount = spec.maximumAmount != null ? Math.max(0, clampNumber(spec.maximumAmount, 0)) : null;
        return maxAmount != null ? Math.min(result, maxAmount) : result;
      }
      case "rebelTieredFixed": {
        // "Slechts 1 EUR tot 250 EUR / Van 250,01 EUR tot 1.000 EUR: 2 EUR /
        //  Van 1.000,01 EUR tot 2.500 EUR: 3 EUR /
        //  Vanaf 2.500,01 EUR tot 10.000 EUR: 10 EUR per schijf van 10.000 EUR"
        if (a <= 250) return 1;
        if (a <= 1000) return 2;
        if (a <= 2500) return 3;
        // 2.500,01+ => 10 per schijf van 10.000
        return 10 * Math.ceil(a / 10000);
      }
      case "boleroEtfPlaylist": {
        // Transactiekosten inleg/opname: <=250: 2,5 | <=1000: 5 | <=2500: 7,5 |
        // <=70000: €15 per €10.000 (max €50) | Rest: €50 + €15 per €10.000
        if (a <= 250) return 2.5;
        if (a <= 1000) return 5;
        if (a <= 2500) return 7.5;
        if (a <= 70000) return Math.min((a / 10000) * 15, 50);
        return 50 + ((a - 70000) / 10000) * 15;
      }
      default:
        return 0;
    }
  }

  function transactionFeeTotal(spec, grossAmount, n, balanceForThreshold) {
    if (!spec) return 0;
    // Optionele saldo-drempel: boven deze waarde geen transactiekosten meer.
    if (spec.balanceThresholdForFees != null) {
      const th = clampNumber(spec.balanceThresholdForFees, 0);
      const bal = clampNumber(balanceForThreshold, 0);
      if (bal >= th) return 0;
    }

    const nn = Math.max(1, Math.floor(clampNumber(n, 1)));
    const per = Math.max(0, grossAmount) / nn;

    // Eerste N transacties gratis, daarna percentage (bijv. Revolut Premium)
    if (spec.kind === "freeFirstNThenPercent") {
      const freeCount = Math.max(0, Math.floor(clampNumber(spec.freeTransactionCount, 0)));
      const ratePct = Math.max(0, clampNumber(spec.percentRatePct, 0)) / 100;
      let total = 0;
      for (let i = 0; i < nn; i++) {
        if (i >= freeCount) total += per * ratePct;
      }
      return total;
    }

    let total = 0;
    for (let i = 0; i < nn; i++) total += feeForOneTransaction(spec, per);
    return total;
  }

  function tierIndex(tiers, base, inclusiveUpper) {
    const b = Math.max(0, base);
    for (let i = 0; i < tiers.length; i++) {
      const upTo = tiers[i].upTo;
      if (upTo == null) return i;
      const ok = inclusiveUpper ? b <= upTo : b < upTo;
      if (ok) return i;
    }
    return Math.max(0, tiers.length - 1);
  }

  function tieredPercentFee({ tiers, apply, inclusiveUpper }, base) {
    const b = Math.max(0, base);
    if (!tiers || tiers.length === 0 || b === 0) return 0;
    const inclusive = inclusiveUpper !== false;
    const mode = apply || "highest"; // highest | marginal

    if (mode === "highest") {
      const idx = tierIndex(tiers, b, inclusive);
      const ratePct = clampNumber(tiers[idx].ratePct, 0);
      return b * (ratePct / 100);
    }

    // marginal: apply rate per slice
    let total = 0;
    let prev = 0;
    for (let i = 0; i < tiers.length && prev < b; i++) {
      const upTo = tiers[i].upTo == null ? b : Math.min(b, tiers[i].upTo);
      const slice = Math.max(0, upTo - prev);
      const ratePct = clampNumber(tiers[i].ratePct, 0);
      total += slice * (ratePct / 100);
      prev = upTo;
    }
    return total;
  }

  function tieredFixedFee({ tiers, apply, inclusiveUpper }, base) {
    const b = Math.max(0, base);
    if (!tiers || tiers.length === 0) return 0;
    const inclusive = inclusiveUpper !== false;
    const mode = apply || "highest"; // highest | marginal

    if (mode === "highest") {
      const idx = tierIndex(tiers, b, inclusive);
      return Math.max(0, clampNumber(tiers[idx].amount, 0));
    }

    // marginal: sum tier amounts up to (and including) the active tier
    const idx = tierIndex(tiers, b, inclusive);
    let total = 0;
    for (let i = 0; i <= idx; i++) total += Math.max(0, clampNumber(tiers[i].amount, 0));
    return total;
  }

  function providerMonthlyFee(providerFees, feeBasisValueMap, monthNumber, fixedMonthlySkipMonths, options) {
    if (!providerFees) return 0;
    const percentOnly = options && options.percentOnly === true;

    const components = Array.isArray(providerFees.components) ? providerFees.components.slice() : [];

    const skipFixed = fixedMonthlySkipMonths != null && monthNumber <= fixedMonthlySkipMonths;

    let total = 0;
    for (const c of components) {
      if (!c || !c.kind) continue;
      if (c.kind === "fixed") {
        if (percentOnly) continue;
        if (skipFixed) continue;
        total += Math.max(0, clampNumber(c.amount, 0));
        continue;
      }
      if (c.kind === "fixedTiered") {
        if (percentOnly) continue;
        const base = feeBasisValueMap[c.basis || "avg"] ?? 0;
        total += tieredFixedFee(c.tiers || c, base);
        continue;
      }
      if (c.kind === "percentOfBase") {
        const base = feeBasisValueMap[c.basis || "avg"] ?? 0;
        const frequency = c.frequency || "monthly"; // "monthly" = jaarbedrag/12 per maand, "quarterly" = jaarbedrag/4 in maanden 3,6,9,12
        const isQuarterEnd = monthNumber % 3 === 0;

        const toMonthlyPortion = (annualAmount) => {
          if (frequency === "quarterly") return isQuarterEnd ? annualAmount / 4 : 0;
          return annualAmount / 12; // monthly: 1/12 van jaarbedrag per maand
        };

        let fee;
        if (c.tiers && Array.isArray(c.tiers.tiers)) {
          const feeAnnual = tieredPercentFee(c.tiers, base);
          fee = toMonthlyPortion(feeAnnual);
          if (frequency === "quarterly" && isQuarterEnd && c.minimumQuarterly != null) {
            fee = Math.max(fee, Math.max(0, clampNumber(c.minimumQuarterly, 0)));
          }
        } else {
          const rate = clampNumber(c.ratePct, 0) / 100;
          fee = Math.max(0, base) * toMonthlyPortion(rate);
          if (c.maximumMonthly != null) {
            fee = Math.min(fee, Math.max(0, clampNumber(c.maximumMonthly, 0)));
          }
        }
        total += fee;
        continue;
      }
    }

    return total;
  }

  function npvMonthly(rate, cashflows) {
    // cashflows: [{tMonths:number, amount:number}]
    const r = rate;
    if (r <= -1) return Number.POSITIVE_INFINITY;
    let sum = 0;
    for (const cf of cashflows) {
      sum += cf.amount / Math.pow(1 + r, cf.tMonths);
    }
    return sum;
  }

  function irrMonthly(cashflows) {
    const hasPos = cashflows.some((c) => c.amount > 0);
    const hasNeg = cashflows.some((c) => c.amount < 0);
    if (!hasPos || !hasNeg) return null;

    let low = -0.9999;
    let high = 1.0;
    let fLow = npvMonthly(low, cashflows);
    let fHigh = npvMonthly(high, cashflows);

    // Expand high until we bracket, or give up
    let attempts = 0;
    while (fLow * fHigh > 0 && attempts < 60) {
      high *= 1.6;
      fHigh = npvMonthly(high, cashflows);
      attempts++;
      if (high > 1e6) break;
    }
    if (fLow * fHigh > 0) return null;

    // Bisection
    for (let i = 0; i < 200; i++) {
      const mid = (low + high) / 2;
      const fMid = npvMonthly(mid, cashflows);
      if (Math.abs(fMid) < 1e-8) return mid;
      if (fLow * fMid <= 0) {
        high = mid;
        fHigh = fMid;
      } else {
        low = mid;
        fLow = fMid;
      }
    }
    return (low + high) / 2;
  }

  /**
   * Main simulation
   */
  function simulate({
    provider,
    beginbedrag,
    maandbedrag,
    years,
    annualReturnPct,
    underlyingAnnualPct,
    transactionsPerMonth,
    zonderOnderliggendeKosten,
    zonderKosten,
    enableTOB = true,
  }) {
    if (!provider) throw new Error("Provider is verplicht");
    const months = Math.max(1, Math.floor(clampNumber(years, 10) * 12));

    const providerType = provider.type;
    const n = providerType === "broker" ? Math.max(1, Math.floor(clampNumber(transactionsPerMonth, 3))) : 1;

    const effAnnualReturnPct =
      provider.overrides?.annualReturnPct != null ? provider.overrides.annualReturnPct : annualReturnPct;
    const effUnderlyingAnnualPct =
      provider.overrides?.underlyingAnnualPct != null ? provider.overrides.underlyingAnnualPct : underlyingAnnualPct;

    const monthlyReturnRate = toMonthlyReturnRateFromAnnualPct(effAnnualReturnPct);
    const underlyingMonthlyRate = toMonthlyUnderlyingCostRate(effUnderlyingAnnualPct);

    // "zonderKosten" mag wél nog onderliggende kosten rekenen; alleen
    // "zonderOnderliggendeKosten" schakelt S3 uit.
    const ignoreUnderlying = Boolean(zonderOnderliggendeKosten);
    const ignoreAllCosts = Boolean(zonderKosten);

    // TOB op inleg/opname (optioneel per aanbieder, én alleen als enableTOB = true)
    const hasTOB =
      enableTOB &&
      provider.tax_BE_TOB_percentage != null &&
      clampNumber(provider.tax_BE_TOB_percentage, 0) > 0;
    const tobRate = hasTOB ? clampNumber(provider.tax_BE_TOB_percentage, 0) / 100 : 0;
    const tobMax =
      hasTOB && provider.tax_BE_TOB_max != null
        ? Math.max(0, clampNumber(provider.tax_BE_TOB_max, 0))
        : Infinity;

    const rows = [];
    const totals = {
      initInleg: 0,
      storting: 0,
      rendement: 0,
      onderliggendeKosten: 0,
      kosten: 0,
      txStorting: 0,
      txOpname: 0,
      taxTOB: 0, // som TOB over inleg + opname
      opnameNetto: 0,
    };

    let balance = 0;
    // minimumAnnual: optioneel op percentOfBase-component. Som van die component over 12 maanden moet minstens dit bedrag zijn.
    const minAnnualComp = Array.isArray(provider.fees?.components)
      ? provider.fees.components.find((c) => c?.kind === "percentOfBase" && c.minimumAnnual != null)
      : null;
    const minimumAnnualFee =
      minAnnualComp != null
        ? Math.max(0, clampNumber(minAnnualComp.minimumAnnual, 0))
        : provider.minimumAnnualFee != null
          ? Math.max(0, clampNumber(provider.minimumAnnualFee, 0))
          : null;
    const minimumAnnualIsPercentOnly = minAnnualComp != null || Boolean(provider.minimumAnnualFeePercentOnly);
    const minimumQuarterlyFee =
      provider.minimumQuarterlyFee != null ? Math.max(0, clampNumber(provider.minimumQuarterlyFee, 0)) : null;
    let yearFeeSum = 0;

    for (let m = 1; m <= months; m++) {
      const isLast = m === months;

      const saldoVorigeMaand = balance;
      const initInleg = m === 1 ? Math.max(0, clampNumber(beginbedrag, 0)) : 0;
      const saldoNaS0 = saldoVorigeMaand + initInleg;

      const storting = Math.max(0, clampNumber(maandbedrag, 0));
      const saldoNaS1 = saldoNaS0 + storting;

      // Belasting TOB over inleg (initiële inleg + storting)
      let belastingTOB = 0;
      let saldoNaTOB = saldoNaS1;
      const tobOnDeposit = provider.tax_BE_TOB_deposit === true;
      if (!ignoreAllCosts && hasTOB && tobOnDeposit) {
        const inlegBruto = initInleg + storting;
        if (inlegBruto > 0 && tobRate > 0 && tobMax > 0) {
          if (providerType === "broker" && n > 1) {
            // Verdeel inleg over n transacties en pas per transactie de TOB-formule toe
            const per = inlegBruto / n;
            const basePer = per / (1 + tobRate);
            const taxPerIdeal = basePer * tobRate;
            const idealTotal = taxPerIdeal * n;
            const capped = Math.min(idealTotal, tobMax);
            belastingTOB = -capped;
          } else {
            const base = inlegBruto / (1 + tobRate);
            const taxIdeal = base * tobRate;
            const capped = Math.min(taxIdeal, tobMax);
            belastingTOB = -capped;
          }
          saldoNaTOB = saldoNaS1 + belastingTOB;
        }
      }

      const rendement = saldoNaTOB * monthlyReturnRate;
      const saldoNaS2 = saldoNaTOB + rendement;

      const onderliggendeKostenBase = (() => {
        const basis = provider.underlyingCostBasis || "begin";
        if (basis === "begin") return saldoNaTOB;
        if (basis === "end") return saldoNaTOB + rendement;
        return saldoNaTOB + rendement / 2;
      })();

      const onderliggendeKosten = ignoreUnderlying ? 0 : -Math.max(0, onderliggendeKostenBase) * underlyingMonthlyRate;
      const saldoNaS3 = saldoNaS2 + onderliggendeKosten;

      // Fee-basis moet TOB meenemen (S0+S1+TOB+...)
      // avg = gemiddelde saldo in deze maand (saldo halverwege de maand, vóór aanbiederfee)
      const avgDezeMaand = saldoNaTOB + rendement / 2 + onderliggendeKosten / 2;
      const feeBasisMap = {
        begin: saldoNaTOB,
        avg: avgDezeMaand,
        end: saldoNaTOB + rendement + onderliggendeKosten,
      };
      // Bij quarterly billing: basis "avg" = (startsaldo kwartaal + eindsaldo kwartaal) / 2
      const hasQuarterlyFees =
        Array.isArray(provider.fees?.components) &&
        provider.fees.components.some((c) => c?.frequency === "quarterly");
      if (hasQuarterlyFees && m % 3 === 0 && m >= 3 && rows.length >= 2) {
        const startKwartaal = rows[m - 3].saldoNaTOB;
        const eindKwartaal = saldoNaTOB + rendement + onderliggendeKosten;
        feeBasisMap.avg = (startKwartaal + eindKwartaal) / 2;
      }
      const fixedMonthlySkipMonths = provider.fixedMonthlySkipMonths ?? null;
      let kostenBedrag = ignoreAllCosts ? 0 : -providerMonthlyFee(provider.fees, feeBasisMap, m, fixedMonthlySkipMonths);
      // Minimum jaarfee: aan het einde van elk jaar (maand 12, 24, …) restant bijrekenen indien som fee < minimum.
      // Bij minimumAnnual op percentOfBase: alleen dat component telt mee. Anders: zie minimumAnnualFeePercentOnly.
      if (!ignoreAllCosts && minimumAnnualFee != null && minimumAnnualFee > 0) {
        const feeForMinimum = minimumAnnualIsPercentOnly
          ? providerMonthlyFee(provider.fees, feeBasisMap, m, fixedMonthlySkipMonths, { percentOnly: true })
          : -kostenBedrag;
        yearFeeSum += Math.max(0, feeForMinimum);
        if (m % 12 === 0) {
          if (yearFeeSum < minimumAnnualFee) {
            const shortfall = minimumAnnualFee - yearFeeSum;
            kostenBedrag -= shortfall;
          }
          yearFeeSum = 0;
        }
      }
      // Minimum kwartaalfee: aan het einde van elk kwartaal (maand 3, 6, 9, 12) minstens het minimum in rekening brengen
      if (!ignoreAllCosts && minimumQuarterlyFee != null && minimumQuarterlyFee > 0 && m % 3 === 0) {
        const feeDitKwartaal = Math.max(0, -kostenBedrag);
        if (feeDitKwartaal < minimumQuarterlyFee) {
          kostenBedrag = -(minimumQuarterlyFee);
        }
      }
      const saldoNaS4 = saldoNaS3 + kostenBedrag;

      const txStortingBedrag =
        ignoreAllCosts || !provider.transactions?.deposit
          ? 0
          : -transactionFeeTotal(provider.transactions.deposit, storting, n, saldoNaS4);
      const saldoNaS5 = saldoNaS4 + txStortingBedrag;

      const opnameBruto = isLast ? saldoNaS5 : 0;
      const txOpnameBedrag =
        !isLast || ignoreAllCosts || !provider.transactions?.withdraw
          ? 0
          : -transactionFeeTotal(provider.transactions.withdraw, opnameBruto, n, saldoNaS5);

      const saldoNaS6 = saldoNaS5 + txOpnameBedrag;

      // Belasting TOB over opname (laatste maand, na tx-opname)
      let belastingTOBOpname = 0;
      let saldoNaTOBOpname = saldoNaS6;
      const tobOnWithdrawal = provider.tax_BE_TOB_withdrawal === true;
      if (isLast && !ignoreAllCosts && hasTOB && tobOnWithdrawal) {
        const opnameBasis = Math.max(0, saldoNaS6);
        if (opnameBasis > 0 && tobRate > 0 && tobMax > 0) {
          if (providerType === "broker" && n > 1) {
            const per = opnameBasis / n;
            const basePer = per / (1 + tobRate);
            const taxPerIdeal = basePer * tobRate;
            const idealTotal = taxPerIdeal * n;
            const capped = Math.min(idealTotal, tobMax);
            belastingTOBOpname = -capped;
          } else {
            const base = opnameBasis / (1 + tobRate);
            const taxIdeal = base * tobRate;
            const capped = Math.min(taxIdeal, tobMax);
            belastingTOBOpname = -capped;
          }
          saldoNaTOBOpname = saldoNaS6 + belastingTOBOpname;
        }
      }

      const opnameNetto = isLast ? Math.max(0, saldoNaTOBOpname) : 0;
      const opnameDelta = isLast ? -opnameNetto : 0;
      const saldoNaOpname = isLast ? 0 : saldoNaTOBOpname;

      // Store row
      rows.push({
        maand: m,
        saldoVorigeMaand,
        initInleg,
        saldoNaS0,
        storting,
        saldoNaS1,
        belastingTOB,
        saldoNaTOB,
        rendement,
        saldoNaS2,
        onderliggendeKosten,
        saldoNaS3,
        kostenBedrag,
        saldoNaS4,
        txStortingBedrag,
        saldoNaS5,
        txOpnameBedrag,
        saldoNaS6,
        belastingTOBOpname,
        saldoNaTOBOpname,
        opnameDelta,
        saldoNaOpname,
      });

      // totals (deltas)
      totals.initInleg += initInleg;
      totals.storting += storting;
      totals.rendement += rendement;
      totals.onderliggendeKosten += onderliggendeKosten;
      totals.kosten += kostenBedrag;
      totals.txStorting += txStortingBedrag;
      totals.txOpname += txOpnameBedrag;
      totals.taxTOB += belastingTOB + belastingTOBOpname;
      totals.opnameNetto += opnameNetto;

      balance = saldoNaOpname;
    }

    // Cashflows for IRR:
    // - contributions at start of each month (t = m-1)
    // - net withdrawal at end (t = months)
    const cashflows = [];
    for (const r of rows) {
      const t = r.maand - 1;
      const out = (r.initInleg || 0) + (r.storting || 0);
      if (out !== 0) cashflows.push({ tMonths: t, amount: -out });
    }
    const finalPayout = rows[rows.length - 1]?.opnameDelta ? -rows[rows.length - 1].opnameDelta : totals.opnameNetto;
    if (finalPayout > 0) cashflows.push({ tMonths: months, amount: finalPayout });

    const irrM = irrMonthly(cashflows);
    const irrA = irrM == null ? null : Math.pow(1 + irrM, 12) - 1;

    const totalInleg = totals.initInleg + totals.storting;
    const nettoResultaat = totals.opnameNetto - totalInleg;

    // Inleg eerste maand (initiële inleg + eerste storting) — voor minimum-inleg check
    const firstMonthInleg =
      rows.length > 0
        ? (rows[0].initInleg || 0) + (rows[0].storting || 0)
        : 0;

    // Provider meta (informational only; no calculations depend on these)
    const minimumInleg = provider.minimumInleg == null ? null : Math.max(0, clampNumber(provider.minimumInleg, 0));
    const duurzaamheidAllowed = [
      "Grijs",
      "Lichtgroen",
      "Donkergroen",
    ];
    const duurzaamheid = duurzaamheidAllowed.includes(provider.duurzaamheid) ? provider.duurzaamheid : null;
    const aandelenpercentage =
      provider.aandelenpercentage == null
        ? null
        : Math.max(0, Math.min(100, clampNumber(provider.aandelenpercentage, 0)));

    const summary = {
      providerId: provider.id,
      providerName: provider.name,
      providerType,
      countries: Array.isArray(provider.countries) ? provider.countries : [],
      lastUpdated: provider.lastUpdated ?? null,
      minimumInleg,
      duurzaamheid,
      aandelenpercentage,
      fbi: provider.fbi === true || provider.fbi === false ? provider.fbi : null,
      months,
      nTransactions: n,
      annualReturnPct: effAnnualReturnPct,
      underlyingAnnualPct: effUnderlyingAnnualPct,
      totalInleg,
      firstMonthInleg,
      eindOpnameNetto: totals.opnameNetto,
      nettoResultaat,
      somOnderliggendeKosten: -totals.onderliggendeKosten,
      // somKosten is expliciet zónder TOB; TOB krijgt eigen som.
      somKosten: -(totals.kosten + totals.txStorting + totals.txOpname),
      somTOB: -totals.taxTOB,
      irrMonthly: irrM,
      irrAnnual: irrA,
    };

    // Geen afronding meer in de engine: return ruwe waarden
    return { rows, totals, summary, cashflows };
  }

  window.BerekenEngine = {
    simulate,
    _internal: {
      irrMonthly,
      npvMonthly,
    },
  };
})();

