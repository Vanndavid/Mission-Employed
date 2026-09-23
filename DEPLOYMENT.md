# Deployment

**Push to `main` deploys to <https://mission-employed.vanndavidteng.com>, as
soon as CI is green.** Nothing else deploys, and nothing needs doing by hand.

```
push to main ──► CI: frontend · backend · mcp tests
                        │  all green
                        ▼
                 deploy job  (GitHub environment "production", one at a time)
                        │  ssh with the deploy key
                        ▼
                 server runs scripts/deploy.sh:
                   git merge --ff-only origin/main
                   docker compose config   ← missing .env key? stop here
                   docker compose build    ← old containers still serving
                   docker compose up --wait
                   curl /, /api/health, /.well-known/oauth-protected-resource/mcp
                        │ any step fails
                        ▼
                   reset to the previous commit, rebuild, and go red
```

The workflow is the `deploy` job in [`.github/workflows/ci.yml`](.github/workflows/ci.yml).
What runs on the server is [`scripts/deploy.sh`](scripts/deploy.sh).

## Why it is built this way

AiCompliance deploys with `appleboy/ssh-action` running a pull-and-build
script. This setup follows the same idea and closes the gaps in it:

- **Tests gate the deploy.** The deploy job `needs` all three test jobs, so a
  red main does not ship. In AiCompliance, tests only run on PRs and a push to
  main deploys regardless.
- **The key GitHub holds can only deploy.** The server's `authorized_keys`
  pins the deploy key to one command:

  ```
  command="/home/ubuntu/traefik-projects/Mission-Employed/scripts/deploy.sh",restrict ssh-ed25519 AAAA… github-actions-deploy
  ```

  Whatever the client asks to run, sshd runs `deploy.sh`, with no shell, no pty
  and no forwarding. A leaked `DEPLOY_SSH_KEY` lets someone redeploy `main`,
  and nothing more. A plain root key in GitHub secrets would be a root shell on
  a server that hosts nine projects. The `production` environment also only
  hands its secrets to runs on `main`.
- **The host key is pinned.** `DEPLOY_KNOWN_HOSTS` holds the server's key and
  `StrictHostKeyChecking=yes` is on, so the runner cannot be tricked into
  sending the key to the wrong machine. The workflow uses plain `ssh`, and no
  third-party action ever sees the key.
- **The server is never silently overwritten.** The script uses
  `git merge --ff-only`, not `git stash && git pull`. If someone edited files
  on the server, the deploy fails and says so instead of hiding the edits in a
  stash.
- **Build before replacing.** Images are built while the old containers keep
  serving, so a broken Dockerfile or failed `npm ci` costs no downtime. The
  `.env` is checked first with `compose config`, which fails on a missing
  required key such as `MCP_OAUTH_SECRET`.
- **It checks the site came back, and rolls back if not.** Three URLs cover
  nginx and the SPA, Laravel, and the MCP connector. If they are not healthy
  within about a minute, the previous commit is rebuilt and the run goes red.
- **No overlapping deploys.** The job is in a `production` concurrency group,
  and the script takes a `flock` as well, for the case where someone runs it by
  hand while Actions is deploying.

## Everyday operations

**Deploy:** push or merge to `main`, then watch Actions → CI → deploy.

**Redeploy without a new commit** (for example after changing the server `.env`):
Actions → CI → *Run workflow* on `main`. Tests run first. Or from a machine
with access:

```bash
ssh vps /home/ubuntu/traefik-projects/Mission-Employed/scripts/deploy.sh
```

**Roll back:** `git revert` the bad commit on `main` and push. That goes
through tests and the normal path, and leaves history honest. In an
emergency, on the server, `git reset --hard <good sha>` followed by the
compose commands from `deploy.sh`. The next push to main will then fail to
fast-forward until the server is back on main's history
(`git reset --hard origin/main`), which is deliberate.

**A deploy failed with "Not possible to fast-forward":** someone changed
files on the server. `ssh vps`, `cd` into the project, look at `git status` /
`git log origin/main..`, keep or discard deliberately, and re-run.

## Secrets and configuration

| Where | Name | What |
| --- | --- | --- |
| GitHub environment `production` | `DEPLOY_SSH_KEY` | Private half of the deploy key (ed25519) |
| | `DEPLOY_KNOWN_HOSTS` | `ssh-keyscan` of the server, checked against the fingerprint in `~/.ssh/config` |
| | `DEPLOY_HOST` | The server's IP |
| Server `.env` (not in git) | `APP_KEY`, `GEMINI_API_KEY`, `ADMIN_EMAIL`, `ADMIN_PASSWORD`, … | Laravel |
| | `MCP_PUBLIC_URL`, `MCP_OAUTH_SECRET` | The MCP connector. Rotating the secret signs every connector out |

The server `.env` is never touched by a deploy. Change it over `ssh vps`,
then redeploy.

**Rotating the deploy key:**

```bash
ssh-keygen -t ed25519 -N '' -C github-actions-deploy -f deploy_key
```

Then:

1. Replace the `github-actions-deploy` line in the server's
   `/root/.ssh/authorized_keys`, keeping the `command="…",restrict` prefix.
2. Run `gh secret set DEPLOY_SSH_KEY --env production < deploy_key`.
3. Delete the local `deploy_key` files.
