const encoder = new TextEncoder();

function escapePdfText(value: string) {
  return value.replaceAll('\\', '\\\\').replaceAll('(', '\\(').replaceAll(')', '\\)');
}

/** Creates a small, deterministic PDF with a real selectable text layer. */
export function createSamplePdf(): Uint8Array {
  const lines = [
    'We need to improve text-to-speech synchronization.',
    'Accurate highlighting should follow every word on the page.',
    'PDF.js exposes the rendered text and its exact browser geometry.',
    'This proof of concept measures that geometry on the frontend.',
    'Try the word synchronization or the complete first sentence.'
  ];

  const stream = [
    'BT',
    '/F1 22 Tf',
    '72 704 Td',
    `(${escapePdfText('Text-to-speech alignment')}) Tj`,
    '/F1 12 Tf',
    '0 -58 Td',
    ...lines.flatMap((line, index) => [
      `(${escapePdfText(line)}) Tj`,
      ...(index < lines.length - 1 ? ['0 -30 Td'] : [])
    ]),
    'ET'
  ].join('\n');

  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
    `<< /Length ${encoder.encode(stream).length} >>\nstream\n${stream}\nendstream`
  ];

  let output = '%PDF-1.4\n%PDFJS\n';
  const offsets = [0];

  objects.forEach((object, index) => {
    offsets.push(encoder.encode(output).length);
    output += `${index + 1} 0 obj\n${object}\nendobj\n`;
  });

  const xrefOffset = encoder.encode(output).length;
  output += `xref\n0 ${objects.length + 1}\n`;
  output += '0000000000 65535 f \n';
  output += offsets
    .slice(1)
    .map((offset) => `${String(offset).padStart(10, '0')} 00000 n \n`)
    .join('');
  output += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`;

  return encoder.encode(output);
}
