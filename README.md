# Vehicle Health Check

Live address: https://vehicle-health-check-app.netlify.app
Customer links look like: https://vehicle-health-check-app.netlify.app/v/<id>

## Publish (first time and after every update)
Netlify's drag-and-drop upload only publishes plain pages, not the server part
(saving inspections, VIN lookup, customer approvals). So publish with the script:

1. Double-click `deploy.command` in this folder.
   - If macOS says it can't be opened: right-click > Open > Open.
   - If Node.js isn't installed, it opens nodejs.org. Install the LTS version and double-click again.
2. The first time, a browser window asks you to log in to Netlify and authorize. Approve it.
3. Wait for "Deploy is live". Open https://vehicle-health-check-app.netlify.app

Terminal alternative:
    cd ~/Downloads/vehicle-health-check
    npx netlify-cli deploy --prod --dir public --functions netlify/functions --site 3935d88d-d29e-4f21-bc27-60eb5a0ff957

## First setup in the app
1. Open the **Stores** tab: set the dealership name, upload your logo, add technicians (with photos), set cutoffs and sections. Tap **Save store**.
2. On each technician's phone, open the site in Safari > Share > **Add to Home Screen**.

## What's where
- `public/` — the app (index.html = technician + manager, watch.html = customer page)
- `netlify/functions/api.mjs` — the server (storage in Netlify Blobs, NHTSA VIN + recall lookup)
- `src/api.mts` — readable source of the server

## Notes
- No login yet: anyone with the site address can open the Manager tab. Don't share the main address outside your team.
- Recalls come from NHTSA by model and year. The advisor ticks only the ones still open on that car.
- Text/email sending and the Monday summary email are marked "Coming soon".
