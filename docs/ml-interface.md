# ML Interface

No ML is implemented in the MVP. The simulator is structured around deterministic observations and actions:

```text
S_t, A_t, R_t, S_t+1, done
```

`TrafficEnvironment` exposes `reset(seed)` and `step(action)` so human, heuristic, optimization, or ML controllers can share the same environment. Reverse-mode types describe adversarial actions, but adversarial training is intentionally deferred.
