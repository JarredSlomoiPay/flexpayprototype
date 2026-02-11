export interface ParsedReferencePage {
  style: string;
  markup: string;
}

export function parseReferencePage(source: string): ParsedReferencePage {
  const styleMatch = source.match(/<style>([\s\S]*?)<\/style>/i);
  const style = styleMatch?.[1] ?? '';

  const payAppMatch = source.match(
    /(<div id="pay-app"[\s\S]*?)(?=<iframe data-product="web_widget"|<\/body>)/i,
  );

  return {
    style,
    markup: payAppMatch?.[1] ?? source,
  };
}
