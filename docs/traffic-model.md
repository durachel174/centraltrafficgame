# Traffic Model

The city is a directed graph `G=(V,E)`. Edge travel time uses the configurable Bureau of Public Roads style function:

```text
T = T0 * (1 + alpha * (x / C)^beta)
```

Capacity modifiers allow incidents and future adversarial disruption. Demand is generated from a time curve and weighted origin/destination probabilities, so congestion emerges from demand rather than scripted jams.
