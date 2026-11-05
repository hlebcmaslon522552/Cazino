import { DotLottieReact } from '@lottiefiles/dotlottie-react';

interface LottiePlayerProps {
  path: string;
  loop?: boolean;
}

export function LottiePlayer({ path, loop = true }: LottiePlayerProps) {
  if (!path) return null;

  return <DotLottieReact src={path} loop={loop} autoplay={true} />;
}