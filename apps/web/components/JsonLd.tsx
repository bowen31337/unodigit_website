/**
 * Renders one JSON-LD graph into the static HTML.
 *
 * Server component on purpose: the whole point is that the markup exists in
 * the exported .html file. A crawler that executes no JavaScript — which
 * includes most AI answer-engine fetchers — has to see this on first byte.
 *
 * `<` is escaped to its < form. JSON.stringify happily emits a literal
 * `</script>` if one ever appears inside an article title or excerpt, which
 * terminates the block early and drops raw markup into the page. Escaping the
 * angle bracket makes that structurally impossible while staying valid JSON.
 */
export default function JsonLd({ data }: { data: Record<string, unknown> }) {
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(data).replace(/</g, '\\u003c') }}
    />
  );
}
