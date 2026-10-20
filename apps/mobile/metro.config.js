const path = require("path");
const { getDefaultConfig } = require("expo/metro-config");

const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, "../..");
const workspaceNodeModules = path.resolve(workspaceRoot, "node_modules");
const mobileReact = path.resolve(projectRoot, "node_modules/react");

const config = getDefaultConfig(projectRoot);
config.watchFolders = [workspaceRoot];
const defaultBlockList = config.resolver.blockList;
config.resolver.blockList = [
  ...toBlockListArray(defaultBlockList),
  blockPath(".pytest_cache"),
  blockPath(".git"),
  blockPath("_archives"),
  blockPath("frontend"),
  blockPath("backend/.venv"),
  blockPath("backend/__pycache__"),
  blockPath("backend/app/__pycache__"),
  blockPath("backend/tests/__pycache__"),
];
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, "node_modules"),
  workspaceNodeModules
];
config.resolver.extraNodeModules = {
  react: mobileReact,
  "react-native": path.resolve(workspaceNodeModules, "react-native"),
  expo: path.resolve(workspaceNodeModules, "expo"),
  "react-refresh": path.resolve(workspaceNodeModules, "react-refresh")
};

const reactResolutions = {
  react: path.resolve(mobileReact, "index.js"),
  "react/jsx-runtime": path.resolve(mobileReact, "jsx-runtime.js"),
  "react/jsx-dev-runtime": path.resolve(mobileReact, "jsx-dev-runtime.js"),
  "react/compiler-runtime": path.resolve(mobileReact, "compiler-runtime.js")
};

config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (reactResolutions[moduleName]) {
    return context.resolveRequest(context, reactResolutions[moduleName], platform);
  }

  if (moduleName === "react-refresh/runtime") {
    return context.resolveRequest(
      context,
      path.resolve(workspaceNodeModules, "react-refresh/runtime.js"),
      platform
    );
  }

  if (moduleName === "react-refresh/babel") {
    return context.resolveRequest(
      context,
      path.resolve(workspaceNodeModules, "react-refresh/babel.js"),
      platform
    );
  }

  return context.resolveRequest(context, moduleName, platform);
};

module.exports = config;

function blockPath(relativePath) {
  const absolutePath = path.resolve(workspaceRoot, relativePath);
  const normalized = escapeRegExp(absolutePath).replace(/\\\\/g, "[\\\\/]");
  return new RegExp(`^${normalized}(?:[\\\\/].*)?$`);
}

function toBlockListArray(blockList) {
  if (!blockList) {
    return [];
  }

  return Array.isArray(blockList) ? blockList : [blockList];
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
