import { useGameStore } from "../game/GameStore";

const copy = {
  intro: {
    title: "Keep The Morning Commute Moving",
    body: "Start with one short practice decision. The city is paused so you can read the map before acting."
  },
  select: {
    title: "Select North Bridge",
    body: "Choose North Bridge and compare what is happening now with what the forecast expects soon."
  },
  forecast: {
    title: "Read The Forecast",
    body: "Traffic is moving now, but the forecast shows pressure building. Continue when you have looked at the +5, +10, and +15 minute chips."
  },
  preview: {
    title: "Preview A Reroute",
    body: "Preview a North Bridge reroute to see where traffic would go before you commit."
  },
  review: {
    title: "Review The Tradeoff",
    body: "Check the selected road and the other affected roads. If South Bridge gets busier, that is the cost of the reroute."
  },
  observe: {
    title: "Watch What Changed",
    body: "Resume time and watch the bridges for a few simulated minutes. Projected preview effects and observed traffic counts are separate."
  },
  hold: {
    title: "Departure Holds",
    body: "A hold keeps eligible waiting trips off the network briefly. It can ease a road, but riders wait longer."
  },
  complete: {
    title: "Ready To Play",
    body: "Start Monday Morning for the scored scenario, or keep experimenting in this practice checkpoint."
  }
} as const;

export function TutorialCoach() {
  const { tutorial, advanceTutorial, skipTutorial, finishTutorial, selectEdge, setSpeed } = useGameStore();
  if (!tutorial.active && tutorial.completed) return null;
  const step = copy[tutorial.step];
  const actionButton =
    tutorial.step === "intro" || tutorial.step === "forecast" || tutorial.step === "hold" ? (
      <button onClick={advanceTutorial}>{tutorial.step === "hold" ? "Continue" : "Continue"}</button>
    ) : tutorial.step === "select" ? (
      <button onClick={() => selectEdge("north_bridge")}>Select North Bridge</button>
    ) : tutorial.step === "observe" ? (
      <button onClick={() => setSpeed(1)}>Resume 1x</button>
    ) : tutorial.step === "complete" ? (
      <>
        <button onClick={() => finishTutorial("monday")}>Start Monday Morning</button>
        <button onClick={() => finishTutorial("practice")}>Continue Practice</button>
      </>
    ) : null;
  return (
    <section className={`tutorialCoach tutorial-${tutorial.step}`} aria-live="polite">
      <strong>{step.title}</strong>
      <p>{step.body}</p>
      {tutorial.observationSummary && <p>{tutorial.observationSummary}</p>}
      {tutorial.message && <p className="tutorialMessage">{tutorial.message}</p>}
      <div className="tutorialActions">
        {actionButton}
        {tutorial.step !== "complete" && <button onClick={skipTutorial}>Skip To Practice</button>}
      </div>
    </section>
  );
}
