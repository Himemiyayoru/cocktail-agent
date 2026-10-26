// metro.config.js
const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

// Register 3D model file extensions with Metro.
config.resolver.assetExts.push(
  'glb',
  'gltf',
  'obj',
  'mtl',
  'fbx'
);

module.exports = config;