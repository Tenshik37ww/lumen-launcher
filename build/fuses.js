// afterPack: включает шифрование cookie в собранном Lumen.exe (сессии аккаунтов Roblox хранятся зашифрованными)
const path = require('path');
exports.default = async function (context) {
  if (context.electronPlatformName !== 'win32') return;
  const { flipFuses, FuseVersion, FuseV1Options } = require('@electron/fuses');
  const exe = path.join(context.appOutDir, context.packager.appInfo.productFilename + '.exe');
  await flipFuses(exe, { version: FuseVersion.V1, [FuseV1Options.EnableCookieEncryption]: true });
};
