These static UI dependencies are served from this site's own Worker so login
and layout do not depend on a visitor's access to third-party CDNs.

- Bootstrap 5.3.0 — MIT: https://github.com/twbs/bootstrap/blob/v5.3.0/LICENSE
- SweetAlert2 11.26.25 — MIT: https://github.com/sweetalert2/sweetalert2/blob/main/LICENSE
- MSAL Browser 3.30.0 — MIT: https://github.com/AzureAD/microsoft-authentication-library-for-js/blob/dev/LICENSE
- Font Awesome Free 6.4.0 — icons CC BY 4.0, fonts SIL OFL 1.1, code MIT: https://fontawesome.com/license/free
- SheetJS CE 0.20.3 — Apache-2.0: https://cdn.sheetjs.com/xlsx-0.20.3/package/LICENSE
  (`sheetjs/xlsx.full.min.js`, source: https://cdn.sheetjs.com/xlsx-0.20.3/package/dist/xlsx.full.min.js).
  Loaded only when an NPD Excel file is selected; files are parsed locally.

The source URLs and pinned versions are recorded in
`scripts/vendor-ui-assets.mjs`. These copies are not rebuilt during deployment.
