# ML Interface

No ML is implemented in the MVP. The simulator is structured around deterministic observations and actions:

```text
S_t, A_t, R_t, S_t+1, done
```

`TrafficEnvironment` exposes `reset(seed)` and `step(action)` so human, heuristic, optimization, or ML controllers can share the same environment. Reverse-mode types describe adversarial actions, but adversarial training is intentionally deferred.

Rewards are deterministic and come from objective deltas:

```text
R_t = J_previous - J_current
```

Positive reward means the latest step reduced objective cost relative to the previous observation. The observation intentionally excludes UI state and can be paired with the action, reward, next observation, and done flag for future offline datasets. Forecast and preview rollouts are internal analysis tools and do not write telemetry or alter action logs.
