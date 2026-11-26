import { PHONE_ICONS, type PhoneIconName } from "@/lib/ui/phoneIcons";

/** A decorative line icon; the text beside it always says the same thing. */
export default function PhoneIcon({ name, size = 20, strokeWidth = 1.8 }: { name: PhoneIconName; size?: number; strokeWidth?: number }) {
  return (
    <svg aria-hidden="true" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round">
      {PHONE_ICONS[name].split(" M").map((part, i) => <path key={i} d={i === 0 ? part : `M${part}`} />)}
    </svg>
  );
}
