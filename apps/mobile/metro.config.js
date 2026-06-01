// Metro config — monorepo-aware + NativeWind.
//
// In the pnpm workspace, Metro must watch the repo root (shared packages live
// in ../../packages) and resolve modules from both the app's and the root's
// node_modules. `withNativeWind` compiles `global.css` into the RN style runtime.
const { getDefaultConfig } = require('expo/metro-config');
const { withNativeWind } = require('nativewind/metro');
const path = require('path');

const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, '../..');

const config = getDefaultConfig(projectRoot);

config.watchFolders = [workspaceRoot];
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, 'node_modules'),
  path.resolve(workspaceRoot, 'node_modules'),
];

module.exports = withNativeWind(config, { input: './global.css' });
