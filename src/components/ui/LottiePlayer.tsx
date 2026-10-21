import { Lottie } from 'lottie-react';

interface LottiePlayerProps {
  path: string;
  loop?: boolean;
}

export function LottiePlayer({ path, loop = true }: LottiePlayerProps) {
  if (!path) return null;

  return <Lottie src={path} loop={loop} />;
}