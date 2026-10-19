export type FinatyxCurrencyDefinition = {
  code: string;
  name: string;
  symbol: string;
  decimalPlaces: number;
  active: boolean;
};

/**
 * Finatyx platform currency catalogue.
 *
 * Currency codes use ISO 4217-style three-letter codes.
 *
 * This catalogue is platform-level reference data and is deliberately
 * separate from tenant-specific configuration.
 *
 * Tenant.baseCurrencyCode should reference one of the active currencies
 * established by the Finatyx platform bootstrap.
 */
export const FINATYX_CURRENCIES: readonly FinatyxCurrencyDefinition[] = [
  {
    code: "GHS",
    name: "Ghanaian Cedi",
    symbol: "GH₵",
    decimalPlaces: 2,
    active: true,
  },
  {
    code: "NGN",
    name: "Nigerian Naira",
    symbol: "₦",
    decimalPlaces: 2,
    active: true,
  },
  {
    code: "KES",
    name: "Kenyan Shilling",
    symbol: "KSh",
    decimalPlaces: 2,
    active: true,
  },
  {
    code: "USD",
    name: "United States Dollar",
    symbol: "$",
    decimalPlaces: 2,
    active: true,
  },
  {
    code: "GBP",
    name: "Pound Sterling",
    symbol: "£",
    decimalPlaces: 2,
    active: true,
  },
  {
    code: "EUR",
    name: "Euro",
    symbol: "€",
    decimalPlaces: 2,
    active: true,
  },
  {
    code: "CAD",
    name: "Canadian Dollar",
    symbol: "C$",
    decimalPlaces: 2,
    active: true,
  },
  {
    code: "AUD",
    name: "Australian Dollar",
    symbol: "A$",
    decimalPlaces: 2,
    active: true,
  },
  {
    code: "ZAR",
    name: "South African Rand",
    symbol: "R",
    decimalPlaces: 2,
    active: true,
  },
] as const;