# Hyperliquid fixtures

Real answers of `POST https://api.hyperliquid.xyz/info`, recorded on 2026-10-31 for public
leaderboard accounts (`https://stats-data.hyperliquid.xyz/Mainnet/leaderboard`):

- `user-abstraction.json`, `clearinghouse-state.json`, `spot-clearinghouse-state.json`:
  `0x47add9a56df66b524d5e2c1993a43cde53b6ed85`, a unified account with three cross positions.
  The spot balances are trimmed to five tokens (USDC, HYPE, UBTC, USDE, USOL).
- `isolated-*.json`: `0xe65123c903700a65068f6a85c6f98519303bae41`, one isolated position.
- `spot-meta-and-asset-ctxs.json`: `{"type":"spotMetaAndAssetCtxs"}`, trimmed to the tokens
  above and the pairs between them (the full answer is about 360 KB).
