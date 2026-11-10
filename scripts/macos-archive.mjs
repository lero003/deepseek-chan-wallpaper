export function appDirectoryName(names) {
  // APFS/HFS and ZIP tools may expose composed or decomposed Japanese names.
  const matches = names.filter(name => name.normalize('NFC') === 'くじらの散歩道.app');
  if (matches.length !== 1) throw new Error('The extracted archive must contain exactly one expected app.');
  return matches[0];
}
