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

// KEEP TEST FILES OUT OF THE APP BUNDLE.
//
// `expo-router/entry` builds its route table with `require.context` over `app/`,
// matching every `.tsx` in the tree — including the render tests colocated
// beside the screens they cover. Those import `@testing-library/react-native`,
// which imports Node's `console`, which does not exist in React Native, and the
// export dies with an unresolved-module trace. It is worse than a broken build:
// without this, a green `expo export` would mean the testing library shipped
// inside the production bundle.
//
// `blockList` is the right lever because it removes the files from Metro's file
// map, so the context module never enumerates them. Jest is unaffected — it has
// its own resolver and its own roots.
// A bare RegExp, not `metro-config`'s `exclusionList` helper — that is a deep
// import into a transitive package, which pnpm's strict layout does not expose.
config.resolver.blockList = [/.*\.(test|spec)\.(ts|tsx)$/];
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, 'node_modules'),
  path.resolve(workspaceRoot, 'node_modules'),
];

module.exports = withNativeWind(config, { input: './global.css' });
