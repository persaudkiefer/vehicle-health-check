#!/bin/bash
# Double-click this file on your Mac to publish Vehicle Health Check to Netlify.
cd "$(dirname "$0")"
if ! command -v npx >/dev/null 2>&1; then
  echo "Node.js is needed once. Opening nodejs.org — install the LTS version, then double-click this file again."
  open "https://nodejs.org/en/download"; read -p "Press Enter to close"; exit 1
fi
npx -y netlify-cli@latest deploy --prod --dir public --functions netlify/functions --site 3935d88d-d29e-4f21-bc27-60eb5a0ff957
echo; echo "Done. Your app: https://vehicle-health-check-app.netlify.app"
read -p "Press Enter to close"
