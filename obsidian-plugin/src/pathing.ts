export const isMarkdownPath = (path: string): boolean => /\.md$/i.test(path);

export const sidecarPathForMarkdown = (markdownPath: string): string => {
  if (!isMarkdownPath(markdownPath)) {
    throw new Error(`expected markdown path, got: ${markdownPath}`);
  }
  return markdownPath.replace(/\.md$/i, '.comments.json');
};

export const markdownPathForSidecar = (sidecarPath: string): string => {
  if (!/\.comments\.json$/i.test(sidecarPath)) {
    throw new Error(`expected sidecar path, got: ${sidecarPath}`);
  }
  return sidecarPath.replace(/\.comments\.json$/i, '.md');
};
