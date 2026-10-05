/**
 * A translated sentence with its bold parts: `**Share**` is drawn as
 * <strong>Share</strong>. Lets a sentence keep its emphasis in every language
 * without being cut into pieces around it, which would fix the word order.
 */
export default function Rich({ text }: { text: string }) {
  return (
    <>
      {text.split("**").map((part, i) => (i % 2 === 1 ? <strong key={i}>{part}</strong> : part))}
    </>
  );
}
