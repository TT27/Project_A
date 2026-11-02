// electron-builder afterSign hook. Notarization only runs when Apple credentials are present
// in the environment; otherwise the build is an unsigned/un-notarized development artifact.
const path = require('node:path');

exports.default = async function notarizeIfConfigured(context) {
  if (context.electronPlatformName !== 'darwin') return;
  const { APPLE_ID, APPLE_APP_SPECIFIC_PASSWORD, APPLE_TEAM_ID, CSC_IDENTITY_AUTO_DISCOVERY } = process.env;
  if (!APPLE_ID || !APPLE_APP_SPECIFIC_PASSWORD || !APPLE_TEAM_ID || CSC_IDENTITY_AUTO_DISCOVERY === 'false') {
    console.warn('[notarize] Apple credentials not configured: producing an UNSIGNED, un-notarized development build.');
    return;
  }
  const { notarize } = require('@electron/notarize');
  const appName = context.packager.appInfo.productFilename;
  const appPath = path.join(context.appOutDir, `${appName}.app`);
  console.log(`[notarize] Submitting ${appPath} to Apple notary service…`);
  await notarize({ appPath, appleId: APPLE_ID, appleIdPassword: APPLE_APP_SPECIFIC_PASSWORD, teamId: APPLE_TEAM_ID });
  console.log('[notarize] Notarization complete.');
};
