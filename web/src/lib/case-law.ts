export type QuoteSegment = { highlighted: boolean; text: string };

export function highlightQuote(text: string, quote: string): QuoteSegment[] {
  if (!quote) return [{ text, highlighted: false }];
  const index = text.indexOf(quote);
  if (index < 0) return [{ text, highlighted: false }];
  return [
    ...(index ? [{ text: text.slice(0, index), highlighted: false }] : []),
    { text: quote, highlighted: true },
    ...(index + quote.length < text.length ? [{ text: text.slice(index + quote.length), highlighted: false }] : []),
  ];
}
