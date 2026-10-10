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

The step timing convention is part of the environment contract: actions apply at the start of the interval, generated demand becomes observable at the end of the interval, and vehicles never move before `actualDepartureTime`. Exported run data deep-copies logged actions so future dataset generation cannot be mutated through returned objects.
