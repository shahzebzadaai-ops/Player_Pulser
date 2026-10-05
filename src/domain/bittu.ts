/**
 * Bittu pose catalog.
 * The supplied archive contained 21 transparent PNGs, numbered 1–15 and 17–22.
 * Pose 16 was not in the archive. Each WebP keeps the original aspect ratio and alpha.
 */
export const BITTU_POSES = {
  welcome: {
    src: "/bittu/pose-01.webp",
    width: 543,
    height: 720,
    alt: "Bittu waving hello",
    use: "Signup welcome and a small greeting",
  },
  standing: {
    src: "/bittu/pose-02.webp",
    width: 543,
    height: 720,
    alt: "Bittu standing in an India jersey",
    use: "Neutral presence when no gesture is needed",
  },
  pointGuide: {
    src: "/bittu/pose-03.webp",
    width: 543,
    height: 720,
    alt: "Bittu pointing toward more detail",
    use: "Guide a reader toward nearby information",
  },
  thoughtful: {
    src: "/bittu/pose-04.webp",
    width: 543,
    height: 720,
    alt: "Bittu thinking",
    use: "Loading and thinking states",
  },
  pointLeft: {
    src: "/bittu/pose-05.webp",
    width: 543,
    height: 720,
    alt: "Bittu pointing left",
    use: "Point toward content on the left",
  },
  pointRight: {
    src: "/bittu/pose-06.webp",
    width: 543,
    height: 720,
    alt: "Bittu pointing right",
    use: "Market guidance beside a short note",
  },
  pointUp: {
    src: "/bittu/pose-07.webp",
    width: 543,
    height: 720,
    alt: "Bittu pointing upward",
    use: "Player profile note about the quote above",
  },
  thumbsUp: {
    src: "/bittu/pose-08.webp",
    width: 543,
    height: 720,
    alt: "Bittu giving a thumbs up",
    use: "A completed help answer",
  },
  victory: {
    src: "/bittu/pose-09.webp",
    width: 543,
    height: 720,
    alt: "Bittu celebrating with both fists raised",
    use: "Rewards celebration",
  },
  pause: {
    src: "/bittu/pose-10.webp",
    width: 543,
    height: 720,
    alt: "Bittu holding up a pause hand",
    use: "Trading or payments temporarily unavailable",
  },
  helping: {
    src: "/bittu/pose-11.webp",
    width: 543,
    height: 720,
    alt: "Bittu offering a helping hand",
    use: "Empty portfolio encouragement",
  },
  shrug: {
    src: "/bittu/pose-12.webp",
    width: 543,
    height: 720,
    alt: "Bittu shrugging",
    use: "An unknown question or an error",
  },
  balance: {
    src: "/bittu/pose-13.webp",
    width: 543,
    height: 720,
    alt: "Bittu presenting a balance",
    use: "Wallet cash and bonus explanation",
  },
  explain: {
    src: "/bittu/pose-14.webp",
    width: 543,
    height: 720,
    alt: "Bittu explaining with an open hand",
    use: "Help and FAQ guide",
  },
  compare: {
    src: "/bittu/pose-15.webp",
    width: 543,
    height: 720,
    alt: "Bittu holding both hands out to compare two ideas",
    use: "Cash versus bonus comparison",
  },
  shield: {
    src: "/bittu/pose-17.webp",
    width: 543,
    height: 720,
    alt: "Bittu standing beside a shield",
    use: "Account access and support",
  },
  avatar: {
    src: "/bittu/pose-18.webp",
    width: 420,
    height: 420,
    alt: "Bittu smiling",
    use: "Chat header portrait",
  },
  launcher: {
    src: "/bittu/avatar.webp",
    width: 160,
    height: 160,
    alt: "",
    use: "Compact floating launcher",
  },
  present: {
    src: "/bittu/pose-19.webp",
    width: 543,
    height: 720,
    alt: "Bittu welcoming you with an open hand",
    use: "Landing hero banner",
  },
  ready: {
    src: "/bittu/pose-20.webp",
    width: 543,
    height: 720,
    alt: "Bittu standing ready to help",
    use: "Help page introduction",
  },
  listen: {
    src: "/bittu/pose-21.webp",
    width: 543,
    height: 720,
    alt: "Bittu listening with a hand on his chest",
    use: "Home greeting",
  },
  farewell: {
    src: "/bittu/pose-22.webp",
    width: 543,
    height: 720,
    alt: "Bittu waving goodbye",
    use: "Closing the help conversation",
  },
} as const;

export type BittuPose = keyof typeof BITTU_POSES;

export function bittuPose(id: BittuPose) {
  return BITTU_POSES[id];
}
