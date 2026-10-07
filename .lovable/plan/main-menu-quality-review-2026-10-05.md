# Main Menu quality review

## What will change

- Review the shared Main Menu and all requested banking pages at desktop, tablet, and phone widths.
- Correct cramped headers, overflowing tables, uneven control rows, and mobile layouts found during the audit.
- Shorten account selectors so they remain readable. On Send Money, show the selected account balance beneath the selector instead of in the same line.
- Improve clear labels and disabled states where controls currently look incomplete or ambiguous.
- Add complete page-sharing metadata to the requested pages that are missing it.

## Verification

- Check every requested page for horizontal overflow and overlapping content.
- Exercise visible controls and multi-step forms where the available signed-in preview permits.
- Confirm the app compiles cleanly after the changes.

## Technical details

- Preserve the current banking logic and data handling; this pass changes presentation and usability only.
- Reuse the existing layout, buttons, fields, and design tokens rather than introducing a new visual system.