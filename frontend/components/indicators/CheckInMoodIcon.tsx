import { BatteryLow, Cloud, CloudRain, Frown, Smile, Waves, Zap } from "lucide-react";
import { moods } from "@/lib/burnout-data";

const moodIcons = { happy: Smile, calm: Waves, anxious: Cloud, sad: CloudRain, angry: Zap, tired: BatteryLow, unmotivated: Frown };

export function CheckInMoodIcon({ mood, size = 22 }: { mood: string; size?: number }) {
  const key = moods.find(option => option.name === mood)?.icon;
  const Icon = key && moodIcons[key];
  return Icon ? <Icon size={size} strokeWidth={1.65} aria-hidden="true" /> : null;
}
