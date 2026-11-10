import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import { prepareMacResources, projectRoot } from './prepare-macos.mjs';

if (process.platform !== 'darwin') throw new Error('The native host requires macOS and an existing Swift 6.2+ toolchain.');
const { resources } = await prepareMacResources({ localPreview: process.argv.includes('--local-preview') });
const result = spawnSync('swift', ['test', '--scratch-path', resolve(projectRoot, 'private-art/swift-build')], {
  cwd: projectRoot, stdio: 'inherit', env: { ...process.env, KUJIRA_TEST_RESOURCES: resources },
});
if (result.error) throw result.error;
process.exit(result.status ?? 1);
