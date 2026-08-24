/**
 * Playing card rendered as SVG.
 *
 * The prototype drew cards as the text "A♠" in a div. These are real card
 * faces: indices in both corners, standard pip layouts for the number cards,
 * and court-card panels for J/Q/K - drawn as vectors so they stay crisp at any
 * size and cost nothing extra on a high-DPI screen.
 *
 * Memoized on its props: a table of nine cards re-renders only the cards that
 * actually changed, which matters when the board updates every street.
 */

import { memo } from "react";
import "./Card.css";

const SUIT_PATHS = {
  s: "M0,-9 C4,-4 9,-1 9,3 C9,6.5 6.5,8 4.5,8 C2.8,8 1.4,7 0.8,5.6 "
    + "C1,7.4 1.8,8.8 3,9.6 L-3,9.6 C-1.8,8.8 -1,7.4 -0.8,5.6 "
    + "C-1.4,7 -2.8,8 -4.5,8 C-6.5,8 -9,6.5 -9,3 C-9,-1 -4,-4 0,-9 Z",
  h: "M0,9 C-3,6 -9,1.5 -9,-3 C-9,-6.5 -6.5,-9 -3.6,-9 C-1.6,-9 -0.5,-7.8 0,-6.8 "
    + "C0.5,-7.8 1.6,-9 3.6,-9 C6.5,-9 9,-6.5 9,-3 C9,1.5 3,6 0,9 Z",
  d: "M0,-9.5 L7,0 L0,9.5 L-7,0 Z",
  c: "M0,-9 C2.6,-9 4.6,-7 4.6,-4.5 C4.6,-3.8 4.45,-3.2 4.2,-2.6 "
    + "C4.9,-3.1 5.8,-3.4 6.7,-3.4 C9,-3.4 10,-1.5 10,0.6 C10,3 8,4.8 5.7,4.8 "
    + "C4,4.8 2.5,3.9 1.6,2.6 C1.5,4.8 2.2,7.2 3.2,9.4 L-3.2,9.4 "
    + "C-2.2,7.2 -1.5,4.8 -1.6,2.6 C-2.5,3.9 -4,4.8 -5.7,4.8 C-8,4.8 -10,3 -10,0.6 "
    + "C-10,-1.5 -9,-3.4 -6.7,-3.4 C-5.8,-3.4 -4.9,-3.1 -4.2,-2.6 "
    + "C-4.45,-3.2 -4.6,-3.8 -4.6,-4.5 C-4.6,-7 -2.6,-9 0,-9 Z",
};

const SUIT_NAMES = { s: "spades", h: "hearts", d: "diamonds", c: "clubs" };
const RANK_NAMES = {
  A: "ace", K: "king", Q: "queen", J: "jack", T: "ten",
  9: "nine", 8: "eight", 7: "seven", 6: "six",
  5: "five", 4: "four", 3: "three", 2: "two",
};

/**
 * Pip positions per rank, in the 100x140 card space.
 * Pips below the midline are drawn rotated, exactly as on a real deck.
 */
const PIP_LAYOUTS = {
  2: [[50, 32], [50, 108]],
  3: [[50, 32], [50, 70], [50, 108]],
  4: [[31, 32], [69, 32], [31, 108], [69, 108]],
  5: [[31, 32], [69, 32], [50, 70], [31, 108], [69, 108]],
  6: [[31, 32], [69, 32], [31, 70], [69, 70], [31, 108], [69, 108]],
  7: [[31, 32], [69, 32], [50, 51], [31, 70], [69, 70], [31, 108], [69, 108]],
  8: [[31, 32], [69, 32], [50, 51], [31, 70], [69, 70], [50, 89], [31, 108], [69, 108]],
  9: [[31, 30], [69, 30], [31, 55], [69, 55], [50, 70], [31, 85], [69, 85], [31, 110], [69, 110]],
  T: [[31, 30], [69, 30], [50, 43], [31, 55], [69, 55], [31, 85], [69, 85], [50, 97], [31, 110], [69, 110]],
};

const MIDLINE = 70;

const Pip = ({ suit, x, y, scale = 1 }) => (
  <path
    d={SUIT_PATHS[suit]}
    transform={`translate(${x} ${y}) scale(${scale}) ${y > MIDLINE ? "rotate(180)" : ""}`}
  />
);

/** Ten is written "10" on a real card, even though its code is "T". */
const displayRank = (rank) => (rank === "T" ? "10" : rank);

/** Corner index: rank above a small suit mark, repeated upside-down. */
const CornerIndex = ({ rank, suit, flipped }) => {
  const text = displayRank(rank);
  return (
    <g transform={flipped ? "translate(100 140) rotate(180)" : undefined}>
      <text
        className="card-index"
        x="14"
        y="23"
        // "10" is twice as wide as any other index; squeeze it to match.
        textLength={text.length > 1 ? 19 : undefined}
        lengthAdjust="spacingAndGlyphs"
      >
        {text}
      </text>
      <path d={SUIT_PATHS[suit]} transform="translate(14 40) scale(0.44)" />
    </g>
  );
};

/**
 * Court cards get a framed panel with a large suit and the rank letter rather
 * than a portrait - it reads clearly at table size and keeps the deck coherent.
 */
const CourtPanel = ({ rank, suit }) => (
  <g>
    <rect className="card-court-frame" x="27" y="31" width="46" height="78" rx="6" />
    <path d={SUIT_PATHS[suit]} transform="translate(50 57) scale(1.45)" />
    <text className="card-court-letter" x="50" y="97">
      {rank}
    </text>
  </g>
);

/**
 * @param {object} props
 * @param {string|null} props.card    two-character code like "As", or null
 * @param {boolean} [props.faceDown]  render the back instead of the face
 * @param {boolean} [props.highlight] emphasise (e.g. cards making the winning hand)
 * @param {boolean} [props.dimmed]    de-emphasise (e.g. a folded player's cards)
 * @param {string}  [props.size]      "sm" | "md" | "lg"
 * @param {number|string} [props.width] explicit width, overriding `size`
 * @param {string}  [props.className]
 */
const Card = memo(function Card({
  card,
  faceDown = false,
  highlight = false,
  dimmed = false,
  size = "md",
  width,
  className = "",
}) {
  const classes = [
    "pcard",
    `pcard-${size}`,
    highlight ? "pcard-highlight" : "",
    dimmed ? "pcard-dimmed" : "",
    className,
  ]
    .filter(Boolean)
    .join(" ");

  // Inline custom property beats the size classes, which are equal specificity
  // and would otherwise win on source order.
  const style =
    width == null
      ? undefined
      : { "--pcard-w": typeof width === "number" ? `${width}px` : width };

  if (!card) {
    return <div className={`${classes} pcard-empty`} style={style} aria-hidden="true" />;
  }

  if (faceDown) {
    return (
      <svg className={`${classes} pcard-back`} style={style} viewBox="0 0 100 140" role="img" aria-label="face-down card">
        <rect x="1" y="1" width="98" height="138" rx="9" className="pcard-back-base" />
        <rect x="7" y="7" width="86" height="126" rx="6" className="pcard-back-inner" />
        <path
          className="pcard-back-pattern"
          d="M7 7 L93 133 M93 7 L7 133 M50 7 L93 70 L50 133 L7 70 Z"
        />
      </svg>
    );
  }

  const rank = card[0];
  const suit = card[1];
  const red = suit === "h" || suit === "d";
  const label = `${RANK_NAMES[rank] ?? rank} of ${SUIT_NAMES[suit] ?? suit}`;

  return (
    <svg
      className={`${classes} pcard-face ${red ? "pcard-red" : "pcard-black"}`}
      style={style}
      viewBox="0 0 100 140"
      role="img"
      aria-label={label}
    >
      <rect x="1" y="1" width="98" height="138" rx="9" className="pcard-bg" />
      <CornerIndex rank={rank} suit={suit} />
      <CornerIndex rank={rank} suit={suit} flipped />
      {rank === "A" ? (
        <path d={SUIT_PATHS[suit]} transform="translate(50 70) scale(2.4)" />
      ) : PIP_LAYOUTS[rank] ? (
        PIP_LAYOUTS[rank].map(([x, y], i) => (
          <Pip key={i} suit={suit} x={x} y={y} scale={0.7} />
        ))
      ) : (
        <CourtPanel rank={rank} suit={suit} />
      )}
    </svg>
  );
});

export default Card;
