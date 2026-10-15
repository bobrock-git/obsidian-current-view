# Current View (CRM Mod)

CRM downstream of LucEast/obsidian-current-view, based on tag 1.6.4.

- Keep id current-view and upstream version 1.6.4 so Obsidian community updates remain detectable.
- Change only the display name to Current View (CRM Mod).
- Preserve legacy preview/reading and edit/live values and prefixed or plain rule values.
- CRM switches crmNativeLockMenu and crmNotebookNavigatorIntegration default to false.
- Switching off detaches menu listeners, API registrations, retry timers, observers and icon decorations.
- Notebook Navigator icons also require Show lock icons; menus do not require an observer.

Build with npm ci and npm run test and npm run build. Source and tests belong here; deploy only main.js, manifest.json and styles.css. Keep user data.json. The downstream/crm branch carries CRM modifications; main follows upstream.

A normal community Update replaces these modifications and this display name. Audit the new upstream release, merge its changes into downstream/crm, run tests and rebuild before deploying. Never alter id or inflate version to suppress updates. No CRM notes or personal configuration belong in this repository.
