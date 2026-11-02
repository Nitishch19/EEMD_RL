"use client";

import {
  useEffect,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";

const ZONE_COLOURS = [
  "#B0D1BB", 
  "#94B9DD", 
  "#EFCA9E", 
  "#D3E279", 
  "#6FA287", 
];

const ROOMS = Array.from({ length: 48 }, (_, index) => {
  const floor = Math.floor(index / 12);
  const column = index % 4;
  const depth = Math.floor((index % 12) / 4);

  return {
    index,
    x: (column - 1.5) * 48,
    y: (1.5 - floor) * 68,
    z: (depth - 1) * 48,
    colour: ZONE_COLOURS[(column + depth) % ZONE_COLOURS.length],
  };
});

export default function IntroGate({
  children,
}: {
  children: ReactNode;
}) {
  const [phase, setPhase] = useState<"opening" | "story" | "final">(
    "opening",
  );
  const [leaving, setLeaving] = useState(false);
  const [finished, setFinished] = useState(false);

    useEffect(() => {
    const reducedMotion = window.matchMedia(
        "(prefers-reduced-motion: reduce)",
    ).matches;

    // Schedule the next scene after the component mounts.
    const storyTimer = window.setTimeout(
        () => setPhase(reducedMotion ? "final" : "story"),
        reducedMotion ? 0 : 3000,
    );

    const finalTimer = reducedMotion
        ? undefined
        : window.setTimeout(() => setPhase("final"), 12500);

    return () => {
        window.clearTimeout(storyTimer);

        if (finalTimer !== undefined) {
        window.clearTimeout(finalTimer);
        }
    };
    }, []);

  useEffect(() => {
    if (!leaving) return;

    const timer = window.setTimeout(() => setFinished(true), 850);
    return () => window.clearTimeout(timer);
  }, [leaving]);

  if (finished) return <>{children}</>;

  return (
    <main
      className={`eemd-intro intro-phase-${phase} ${
        leaving ? "intro-leaving" : ""
      }`}
    >
      <div className="intro-ambient intro-ambient-blue" />
      <div className="intro-ambient intro-ambient-peach" />

      <div className="intro-brand">
        <div className="intro-flower-bloom">
          <img
            className="intro-flower"
            src="/images/branding/logoeemd.png"
            alt="EEMD-RL"
            width={220}
            height={220}
          />
        </div>
      </div>

      <div className="intro-centre-copy">
        <h1>EEMD-RL</h1>

        <p className="intro-tagline">
          A campus that learns to use energy wisely.
        </p>

        {phase === "final" && (
          <button
            type="button"
            className="intro-enter"
            disabled={leaving}
            onClick={() => setLeaving(true)}
          >
            Sneak peek <span aria-hidden="true">↗</span>
          </button>
        )}
      </div>

      <section
        className="intro-story"
        aria-hidden={phase !== "story"}
      >
        <div className="intro-story-copy">
          <span className="intro-eyebrow">
            TIMETABLE-AWARE CAMPUS ENERGY
          </span>

          <h2>
            Every room.
            <br />
            Every timetable.
            <br />
            <em>Smarter energy.</em>
          </h2>

          <p>
            EEMD-RL connects campus timetables, a digital building model,
            and reinforcement learning to explore how energy use can
            follow the way people use each space—balancing efficiency,
            comfort, and safety.
          </p>
        </div>

        <div className="intro-building-area">
          <div
            className={`intro-building ${
              phase !== "opening" ? "is-assembled" : ""
            }`}
            aria-hidden="true"
          >
            {ROOMS.map((room) => (
              <div
                key={room.index}
                className="intro-room"
                style={
                  {
                    "--x": `${room.x}px`,
                    "--y": `${room.y}px`,
                    "--z": `${room.z}px`,
                    "--scatter": `${
                      room.index % 2 === 0 ? -360 : 360
                    }px`,
                    "--delay": `${room.index * 45}ms`,
                    "--room-colour": room.colour,
                  } as CSSProperties
                }
              >
                <span className="room-face room-front" />
                <span className="room-face room-right" />
                <span className="room-face room-top" />
              </div>
            ))}
          </div>

          <div className="intro-zone-legend">
            {["Teaching", "Labs", "Offices", "Shared", "Commercial"].map(
              (label, index) => (
                <span key={label}>
                  <i style={{ background: ZONE_COLOURS[index] }} />
                  {label}
                </span>
              ),
            )}
          </div>

          <small className="intro-building-caption">
            A conceptual view of connected campus spaces
          </small>
        </div>
      </section>

      {phase !== "final" && (
        <button
          type="button"
          className="intro-skip"
          onClick={() => setPhase("final")}
        >
          Skip introduction
        </button>
      )}
    </main>
  );
}