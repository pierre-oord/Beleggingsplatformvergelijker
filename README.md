# Beleggen aanbieders vergelijken (v1)

Open `index.html` in je browser.

## Wat je krijgt

- Maandelijkse simulatie met tussenstappen (S0–S6) + finale opname
- Totalen van alle delta-kolommen
- Som onderliggende kosten (S3) en som kosten (S4–S6)
- Netto resultaat
- IRR (maandelijks + jaarlijks)

## Aannames (bewust in v1)

- Rendement \(p.j.\) wordt omgerekend naar een **maandelijks gecompound** rendement.
- Jaarlijkse kostenpercentages (zoals onderliggende kosten) worden **pro-rata per maand** toegepast (\(/12\)).
- Storting gebeurt aan het **begin van de maand**, opname aan het **einde van de laatste maand**.

## Providers toevoegen

Voeg een object toe aan `PROVIDERS` in `providers.js`.

## Tiers (v1 ondersteuning)

De engine ondersteunt tiers voor **S4 kosten** (percentage over saldo en/of vaste kosten) en voor **S5/S6 transactiekosten** via `kind: "tieredTransaction"`.

### Voorbeeld: percentage-kosten met tiers (marginaal of hoogste tier)

```js
fees: {
  components: [
    {
      kind: "percentOfBase",
      frequency: "monthly",     // "monthly" (1/12 per maand) of "quarterly" (1/4 in maanden 3,6,9,12). ratePct is altijd jaarbasis.
      basis: "avg",             // "begin" | "avg" | "end"
      tiers: {
        inclusiveUpper: true,   // "tot en met" (true) of "tot" (false)
        apply: "marginal",      // "marginal" (tier1 dan tier2...) of "highest"
        tiers: [
          { upTo: 100000, ratePct: 0.30 },
          { upTo: 250000, ratePct: 0.20 },
          { upTo: null,   ratePct: 0.10 }, // null = geen bovengrens
        ],
      },
    },
  ],
}
```

### Voorbeeld: transactiekosten met tiers (vast en/of percentage)

```js
transactions: {
  deposit: {
    kind: "tieredTransaction",
    fixedTiers: {
      inclusiveUpper: true,
      apply: "highest",
      tiers: [
        { upTo: 250, amount: 1 },
        { upTo: 1000, amount: 2 },
        { upTo: null, amount: 3 },
      ],
    },
    // optioneel daarnaast:
    // percentRatePct: 0.15
  },
  withdraw: { kind: "fixedPerTransaction", amount: 1 },
}
```

