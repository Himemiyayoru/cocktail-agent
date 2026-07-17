// metro.config.js
const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

// 让 Metro 认识 3D 模型文件的后缀名
config.resolver.assetExts.push(
  'glb',
  'gltf',
  'obj',
  'mtl',
  'fbx'
);

module.exports = config;