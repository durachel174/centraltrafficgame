import type { TrafficForecast } from "../types";

export function createAlerts(
  forecasts: TrafficForecast[],
  thresholds: { warningUtilization: number; criticalUtilization: number } = {
    warningUtilization: 1,
    criticalUtilization: 1.25
  }
) {
  return forecasts
    .filter(
      (forecast) =>
        forecast.utilization5m > thresholds.warningUtilization ||
        forecast.utilization10m > thresholds.warningUtilization ||
        forecast.utilization15m > thresholds.warningUtilization
    )
    .map((forecast) => {
      const predicted = Math.max(forecast.utilization5m, forecast.utilization10m, forecast.utilization15m);
      return {
        id: `alert_${forecast.edgeId}`,
        edgeId: forecast.edgeId,
        title: predicted > thresholds.criticalUtilization ? "Critical congestion predicted" : "Congestion predicted",
        severity: predicted > thresholds.criticalUtilization ? ("CRITICAL" as const) : ("WARNING" as const),
        minutesUntil:
          forecast.utilization5m > thresholds.warningUtilization
            ? 5
            : forecast.utilization10m > thresholds.warningUtilization
              ? 10
              : 15,
        current: forecast.currentUtilization,
        predicted
      };
    });
}
