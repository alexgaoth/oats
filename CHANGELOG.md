# Changelog

All notable changes to Barley (called Oats before 0.4.0) will be documented in this file.

This repository (`oats-arum`) begins fresh at Stage 0 of `IMPLEMENTATION.md`.
It carries forward the `conversationAide`/`conversationGraph` core and other
work already landed in the `../oats` OpenWhispr fork, but starts its own
history rather than importing OpenWhispr's changelog. See `UPSTREAM.md` for
provenance.

## [Unreleased]

- Repo bootstrap (Stage 0).
- Imported the OpenWhispr-based Oats engine baseline (Stage 1).
- Cut the SaaS umbilical — accounts, cloud sync, workspaces/teams, referrals,
  usage/billing, and OpenWhispr's own hosted cloud — leaving local + BYOK
  providers only (Stage 2).
- Rebranded to Oats / arum: `com.arum.oats` app id, `oats://` protocol,
  `OATS_*` env vars, the oat-milk / Steel-cut design tokens (DESIGN.md §3),
  the husked-oat app icon (DESIGN.md §2), and a full brand-string + locale
  sweep (Stage 3).
- Renamed to Barley (2026-11-28). Only the name people see changed: the
  data folder, the bundle ID `com.arum.oats`, the keychain service and the
  `oats://` protocol keep their names, so an update finds everything where
  it was.
