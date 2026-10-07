# Show profile photo in the header

## Changes
- Reuse the signed-in user’s protected profile photo endpoint in the header account button and its menu.
- Keep initials as the fallback when no photo exists or loading fails.
- Notify the header immediately after a photo is uploaded, changed, or removed.

## Verification
- Confirm upload, replacement, and removal update the header without a refresh.
- Check the dashboard header and account menu remain correctly sized and accessible.
