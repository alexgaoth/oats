# Upstream provenance

The application foundation was imported from OpenWhispr
(`https://github.com/OpenWhispr/openwhispr`) at upstream version 1.7.6 on
2026-07-20. The original MIT license and notices remain in [LICENSE](./LICENSE).

Configure the tracking remote in a writable Git checkout with:

```sh
git remote add upstream https://github.com/OpenWhispr/openwhispr.git
```

This workspace's `.git` mount is read-only, so the remote cannot be recorded in
the local Git configuration here.
