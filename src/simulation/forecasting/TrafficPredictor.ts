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
        forecast.samples.length ? forecast.samples.some((sample) => sample.utilization > thresholds.warningUtilization) :
        forecast.utilization5m > thresholds.warningUtilization ||
        forecast.utilization10m > thresholds.warningUtilization ||
        forecast.utilization15m > thresholds.warningUtilization
    )
    .map((forecast) => {
      const samples = forecast.samples.length
        ? forecast.samples
        : [
            { requestedHorizonMinutes: 5, actualHorizonMinutes: 5, truncated: false, utilization: forecast.utilization5m },
            { requestedHorizonMinutes: 10, actualHorizonMinutes: 10, truncated: false, utilization: forecast.utilization10m },
            { requestedHorizonMinutes: 15, actualHorizonMinutes: 15, truncated: false, utilization: forecast.utilization15m }
          ];
      const firstWarning = samples.find((sample) => sample.utilization > thresholds.warningUtilization) ?? samples[0];
      const predicted = Math.max(...samples.map((sample) => sample.utilization));
      return {
        id: `alert_${forecast.edgeId}`,
        edgeId: forecast.edgeId,
        title: predicted > thresholds.criticalUtilization ? "Critical congestion predicted" : "Congestion predicted",
        severity: predicted > thresholds.criticalUtilization ? ("CRITICAL" as const) : ("WARNING" as const),
        minutesUntil: firstWarning.actualHorizonMinutes,
        requestedMinutesUntil: firstWarning.requestedHorizonMinutes,
        truncated: firstWarning.truncated,
        current: forecast.currentUtilization,
        predicted
      };
    });
}
