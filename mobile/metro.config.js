const path = require('node:path');
const { getDefaultConfig } = require('expo/metro-config');
const config = getDefaultConfig(__dirname);
config.watchFolders = [path.resolve(__dirname, '..', 'src', 'lib')];
config.resolver.nodeModulesPaths = [path.resolve(__dirname, 'node_modules')];
config.resolver.disableHierarchicalLookup = true;
config.resolver.resolveRequest = (context, name, platform) => {
  if (name === 'crypto' || name === 'node:crypto') {
    return { type: 'sourceFile', filePath: path.resolve(__dirname, 'src/services/portable-crypto.ts') };
  }
  if (name.startsWith('node:') || ['fs', 'pg', 'next', 'http', 'https'].includes(name)) {
    throw new Error(`Server-only dependency in mobile bundle: ${name}`);
  }
  return context.resolveRequest(context, name, platform);
};
module.exports = config;
