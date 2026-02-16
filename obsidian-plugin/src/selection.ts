export interface EditorPoint {
  line: number;
  ch: number;
}

export interface SelectionOffsets {
  startOffsetUtf16: number;
  endOffsetUtf16: number;
}

const lineStartOffsets = (text: string): number[] => {
  const starts = [0];
  for (let i = 0; i < text.length; i += 1) {
    if (text[i] === '\n') starts.push(i + 1);
  }
  return starts;
};

export const pointToUtf16Offset = (text: string, point: EditorPoint): number => {
  const starts = lineStartOffsets(text);
  if (point.line < 0 || point.line >= starts.length) throw new Error(`line out of range: ${point.line}`);
  const lineStart = starts[point.line];
  const lineEnd = point.line + 1 < starts.length ? starts[point.line + 1] - 1 : text.length;
  const offset = lineStart + point.ch;
  if (offset < lineStart || offset > lineEnd) throw new Error(`column out of range: ${point.ch}`);
  return offset;
};

export const normalizeSelection = (text: string, a: EditorPoint, b: EditorPoint): SelectionOffsets => {
  const oa = pointToUtf16Offset(text, a);
  const ob = pointToUtf16Offset(text, b);
  return oa <= ob
    ? { startOffsetUtf16: oa, endOffsetUtf16: ob }
    : { startOffsetUtf16: ob, endOffsetUtf16: oa };
};
