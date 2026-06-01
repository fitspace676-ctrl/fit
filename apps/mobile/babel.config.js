// Babel config for the Expo app. `babel-preset-expo` handles Expo Router and
// React Native transforms; `jsxImportSource: 'nativewind'` + the NativeWind
// preset wire Tailwind `className` props through to React Native styles.
module.exports = function (api) {
  api.cache(true);
  return {
    presets: [['babel-preset-expo', { jsxImportSource: 'nativewind' }], 'nativewind/babel'],
  };
};
