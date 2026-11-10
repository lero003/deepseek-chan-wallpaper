import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import { prepareMacResources, projectRoot } from './prepare-macos.mjs';

if (process.platform !== 'darwin') throw new Error('The native host requires macOS and an existing Swift 6.2+ toolchain.');
const { resources } = await prepareMacResources({ localPreview: process.argv.includes('--local-preview') });
// --disable-sandbox: this package has no dependencies or plugins, and nested sandboxes are
// unavailable in some agent/CI environments. Build isolation does not depend on it here.
const result = spawnSync('swift', ['test', '--disable-sandbox', '--scratch-path', resolve(projectRoot, 'private-art/swift-build')], {
  cwd: projectRoot, stdio: 'inherit', env: { ...process.env, KUJIRA_TEST_RESOURCES: resources },
});
if (result.error) throw result.error;
process.exit(result.status ?? 1);
