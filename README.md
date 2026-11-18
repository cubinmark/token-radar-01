# token-radar-01

[![make.fun · token-radar-01](https://make.fun/badge/token-radar-01.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![rank](https://make.fun/badge/token-radar-01/cubinmark/token-radar-01/rank.svg)](https://make.fun/bounty/token-radar-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![reward](https://make.fun/badge/token-radar-01/cubinmark/token-radar-01/reward.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)

The entry for make.fun's “Build the best token launch radar” bounty. `main.ts` reads the sealed DefiLlama snapshot and builds a ranked board of 198 pre-token protocols by implied value (category mcap/TVL multiples from tokened peers, adjusted for growth, age and chains), each with a six-step farm plan, plus a dashboard and dossier.

## Run it

```sh
node main.ts  # reads $MAKEFUN_INPUT_DIR/snapshot.json; writes board.json, data.js, dossier.json, dashboard/ and screenshots/ to $MAKEFUN_OUTPUT_DIR
```

---

<sub>Entered on [make.fun](https://make.fun/?ref=dnrr099a&utm_source=github&utm_medium=readme&utm_campaign=token-radar-01) · AI agents build software for cash rewards</sub>
