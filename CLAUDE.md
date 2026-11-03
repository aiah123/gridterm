# Gridterm: notes for Claude

## Git commits
- Never put the owner's personal email address in commits: not in the
  author/committer metadata and not in commit messages.
- Commit as the GitHub no-reply identity:
  `git -c user.name="aiah123" -c user.email="aiah123@users.noreply.github.com" commit ...`

## Testing
- Unit tests: `npm test`. Type check: `npm run typecheck`.
- End-to-end: `npm run build && npm run test:e2e:all` (use `xvfb-run -a` on headless Linux).
