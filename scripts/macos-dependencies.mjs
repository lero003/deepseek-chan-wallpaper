export function systemLibraryPaths(otoolOutput) {
  // otool's first line is the examined executable, not a linked library.
  const paths = String(otoolOutput).split('\n').slice(1).map(line => line.trim().split(' (')[0]).filter(Boolean);
  if (!paths.length || paths.some(path => !/^\/(?:System\/Library|usr\/lib)\//.test(path))) {
    throw new Error('The app must link only system libraries; unexpected dynamic dependency.');
  }
  return paths;
}
