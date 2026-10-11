"use client";

import type { CSSProperties } from "react";

function Mark({ src, style }: { src: string; style: CSSProperties }) {
  return <img src={src} alt="" draggable={false} className="splash-mark" style={style} />;
}

function CricketScene() {
  return (
    <>
      <Mark src="/art/sil-cricket-pitch.png?v=4" style={{ left: "18%", bottom: "7%", width: 340, height: 90, opacity: 0.16 }} />
      <Mark src="/art/sil-cricket-batsman.png?v=3" style={{ left: 20, bottom: 28, height: 150, width: "auto", maxWidth: 112 }} />
      <Mark src="/art/sil-cricket-keeper.png?v=4" style={{ right: 28, bottom: 22, height: 132, width: "auto", maxWidth: 108 }} />
      <Mark src="/art/sil-cricket-bowler.png?v=3" style={{ right: 24, top: 86, height: 128, width: "auto", maxWidth: 100 }} />
      <Mark src="/art/sil-cricket-stumps.png?v=4" style={{ right: 148, bottom: 18, height: 78, width: "auto", maxWidth: 52 }} />
      <Mark src="/art/sil-cricket-ball.png?v=4" style={{ left: 148, top: 92, height: 36, width: 36 }} />
      <Mark src="/art/sil-cricket-ball.png?v=4" style={{ left: "46%", bottom: 36, height: 28, width: 28, opacity: 0.22 }} />
    </>
  );
}

function BadmintonScene() {
  return (
    <>
      <Mark src="/art/sil-badminton.png?v=5" style={{ left: 18, bottom: 22, height: 158, width: "auto", maxWidth: 120 }} />
      <Mark src="/art/sil-badminton-serve.png?v=1" style={{ right: 22, bottom: 18, height: 148, width: "auto", maxWidth: 118 }} />
      <Mark src="/art/sil-badminton-racket.png?v=1" style={{ right: 36, top: 78, height: 110, width: "auto", maxWidth: 72, opacity: 0.28 }} />
      <Mark src="/art/sil-badminton-shuttle.png?v=1" style={{ left: 150, top: 88, height: 42, width: 42 }} />
      <Mark src="/art/sil-badminton-shuttle.png?v=1" style={{ left: "48%", bottom: 42, height: 30, width: 30, opacity: 0.22 }} />
      <Mark src="/art/sil-badminton-shuttle.png?v=1" style={{ right: 168, top: 120, height: 26, width: 26, opacity: 0.2 }} />
    </>
  );
}

function TableTennisScene() {
  return (
    <>
      <Mark src="/art/sil-table-tennis.png?v=5" style={{ left: 18, bottom: 22, height: 152, width: "auto", maxWidth: 118 }} />
      <Mark src="/art/sil-tt-forehand.png?v=1" style={{ right: 20, bottom: 18, height: 148, width: "auto", maxWidth: 120 }} />
      <Mark src="/art/sil-tt-serve.png?v=1" style={{ right: 28, top: 72, height: 124, width: "auto", maxWidth: 100, opacity: 0.3 }} />
      <Mark src="/art/sil-tt-paddle.png?v=1" style={{ left: 150, top: 90, height: 54, width: "auto", maxWidth: 54 }} />
      <Mark src="/art/sil-tt-ball.png?v=1" style={{ left: "46%", bottom: 40, height: 28, width: 28, opacity: 0.24 }} />
      <Mark src="/art/sil-tt-ball.png?v=1" style={{ right: 160, top: 118, height: 22, width: 22, opacity: 0.2 }} />
    </>
  );
}

function kind(sport?: string) {
  const t = String(sport || "cricket").toLowerCase();
  if (t.includes("badminton")) return "badminton";
  if (t.includes("table") || t.includes("tt") || t.includes("ping")) return "tt";
  return "cricket";
}

export function SportBackdrop({ sport }: { sport?: string }) {
  const scene = kind(sport);
  return (
    <div className="pointer-events-none fixed inset-0 z-0 overflow-hidden" aria-hidden>
      <div className="stage-glow" />
      {scene === "badminton" ? <BadmintonScene /> : scene === "tt" ? <TableTennisScene /> : <CricketScene />}
    </div>
  );
}
