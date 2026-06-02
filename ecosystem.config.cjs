/**
 * PM2-Konfiguration für Produktion.
 * APP_NAME und APP_PORT werden beim Deploy gesetzt (GitHub Variables).
 */
module.exports = {
  apps: [
    {
      name: process.env.APP_NAME || 'eventfrog-screen',
      script: 'src/app.js',
      cwd: __dirname,
      instances: 1,
      autorestart: true,
      env: {
        NODE_ENV: 'production',
        APP_PORT: process.env.APP_PORT,
      },
    },
  ],
};
