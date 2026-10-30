// How money and words are shown. Money is integer centavos everywhere.

const peso = new Intl.NumberFormat("en-PH", { style: "currency", currency: "PHP", trailingZeroDisplay: "stripIfInteger" })
const pesoShort = new Intl.NumberFormat("en-PH", { style: "currency", currency: "PHP", notation: "compact", maximumFractionDigits: 1 })

export const formatPeso = (centavos: number) => peso.format(centavos / 100)
export const formatPesoShort = (centavos: number) => pesoShort.format(centavos / 100)
/** Whole pesos, for figures the app works out (per day, ahead of pace) rather than ones you typed. */
export const formatPesoWhole = (centavos: number) => formatPeso(Math.round(centavos / 100) * 100)

export const capitalize = (text: string) => text[0].toUpperCase() + text.slice(1)
