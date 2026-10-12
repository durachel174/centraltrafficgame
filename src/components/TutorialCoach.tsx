import { useGameStore } from "../game/GameStore";

const copy = {
  goal: {
    title: "Keep the morning commute moving",
    body: "This practice run starts paused. Watch the bridges, keep passengers satisfied, and use previews before committing."
  },
  inspect: {
    title: "Inspect North Bridge",
    body: "The map is the city. Moving dots are vehicles. North Bridge is selected so you can compare current traffic with forecast pressure."
  },
  forecast: {
    title: "Read the forecast",
    body: "Forecast chips show measured pressure at future horizons. Alerts use the same forecast data, not scripted warnings."
  },
  preview: {
    title: "Preview a reroute",
    body: "Preview Reroute asks the worker to compare no action against moving eligible approaching vehicles to alternatives."
  },
  review: {
    title: "Compare before and after",
    body: "Use selected-road pressure, other affected roads, passenger delay, and satisfaction to decide. Positive cost and delay are worse."
  },
  observe: {
    title: "Confirm, then resume",
    body: "Confirm applies the reviewed action once through the normal action API. Resume time and watch observed traffic, not just projections."
  },
  hold: {
    title: "Try holding departures later",
    body: "Departure holds temporarily keep eligible waiting trips off the network. They can reduce pressure but add passenger delay."
  },
  done: {
    title: "Independent play",
    body: "You can replay this tutorial from Help. Switch to Monday Morning when you want the scored scenario."
  }
} as const;

export function TutorialCoach() {
  const { tutorial, advanceTutorial, skipTutorial, replayTutorial } = useGameStore();
  if (!tutorial.active && tutorial.completed) return null;
  const step = copy[tutorial.step];
  return (
    <section className={`tutorialCoach tutorial-${tutorial.step}`} aria-live="polite">
      <strong>{step.title}</strong>
      <p>{step.body}</p>
      <div className="tutorialActions">
        {tutorial.step === "done" ? (
          <button onClick={replayTutorial}>Replay Tutorial</button>
        ) : (
          <button onClick={advanceTutorial}>{tutorial.step === "hold" ? "Finish" : "Next"}</button>
        )}
        <button onClick={skipTutorial}>Skip Tutorial</button>
      </div>
    </section>
  );
}
